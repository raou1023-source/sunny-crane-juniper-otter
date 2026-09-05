import { toast } from "sonner";
import { polishCards, readImage } from "@/lib/ai";
import { mergeCards, needsJapanese, type AnkiCard } from "@/lib/anki";
import { t } from "@/lib/i18n";
import { onlySafeImageUrls } from "@/lib/safe-image";
import { useFolio } from "@/lib/store";

export type ScanPart = {
  extracted: string;
  translationJa: string;
  formatted: string;
  notesJa: string;
  cards: AnkiCard[];
};

let generation = 0;
let wake: WakeLockSentinel | null = null;

function joinPages(parts: string[], label: boolean) {
  return parts
    .map((text, i) => {
      const t = text.trim();
      if (!t) return "";
      return label ? `【${i + 1}】\n${t}` : t;
    })
    .filter(Boolean)
    .join("\n\n");
}

export function mergeParts(parts: ScanPart[]): ScanPart {
  const label = parts.length > 1;
  return {
    extracted: joinPages(
      parts.map((p) => p.extracted),
      label,
    ),
    translationJa: joinPages(
      parts.map((p) => p.translationJa),
      label,
    ),
    formatted: joinPages(
      parts.map((p) => p.formatted),
      label,
    ),
    notesJa: joinPages(
      parts.map((p) => p.notesJa),
      label,
    ),
    cards: mergeCards(parts.map((p) => p.cards)),
  };
}

async function holdAwake() {
  try {
    wake?.release().catch(() => undefined);
    wake = (await navigator.wakeLock?.request("screen")) ?? null;
  } catch {
    wake = null;
  }
}

function dropAwake() {
  void wake?.release().catch(() => undefined);
  wake = null;
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>) {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next;
      next += 1;
      if (i >= items.length) return;
      out[i] = await fn(items[i]!, i);
    }
  }
  const n = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

export function startScanJob(urls: string[]) {
  const list = onlySafeImageUrls(urls);
  if (!list.length) return;
  const gen = ++generation;
  void run(gen, list);
}

async function run(gen: number, urls: string[]) {
  const folio = useFolio.getState();
  folio.setScanPreviews(urls);
  folio.setScanJob({ busy: true, progress: { done: 0, total: urls.length } });
  await holdAwake();

  const onVisible = () => {
    if (document.visibilityState === "visible" && generation === gen && useFolio.getState().scanBusy) {
      void holdAwake();
    }
  };
  document.addEventListener("visibilitychange", onVisible);

  const parts: Array<ScanPart | null> = urls.map(() => null);
  let done = 0;

  function publish() {
    const ready = parts.filter((p): p is ScanPart => Boolean(p));
    if (!ready.length) return;
    const merged = mergeParts(ready);
    useFolio.getState().setLastScan({
      extracted: merged.extracted.slice(0, 12000),
      translationJa: merged.translationJa.slice(0, 12000),
      formatted: merged.formatted.slice(0, 16000),
      notesJa: merged.notesJa.slice(0, 4000),
      formatId: folio.formatId,
      cards: merged.cards,
    });
  }

  try {
    await mapPool(urls, 3, async (url, i) => {
      if (generation !== gen) return;
      try {
        const res = await readImage({
          data: {
            imageDataUrl: url,
            level: folio.level,
            formatId: folio.formatId,
            customFormat: folio.customFormat,
            locale: folio.locale,
            skipFill: true,
          },
        });
        if (generation !== gen) return;
        if (!res.ok) {
          toast.error(`${i + 1}: ${res.error}`);
        } else {
          parts[i] = {
            extracted: res.extracted,
            translationJa: res.translationJa,
            formatted: res.formatted,
            notesJa: res.notesJa,
            cards: res.cards ?? [],
          };
          publish();
        }
      } catch {
        if (generation !== gen) return;
        toast.error(`${i + 1}`);
      }
      done += 1;
      useFolio.getState().setScanJob({ busy: true, progress: { done, total: urls.length } });
    });
    if (generation !== gen) return;
    const ready = parts.filter((p): p is ScanPart => Boolean(p));
    if (ready.length && needsJapanese(mergeCards(ready.map((p) => p.cards)))) {
      const merged = mergeParts(ready);
      const polished = await polishCards({
        data: { cards: merged.cards, locale: folio.locale },
      });
      if (generation !== gen) return;
      if (polished.ok) {
        useFolio.getState().setLastScan({
          extracted: merged.extracted.slice(0, 12000),
          translationJa: merged.translationJa.slice(0, 12000),
          formatted: merged.formatted.slice(0, 16000),
          notesJa: merged.notesJa.slice(0, 4000),
          formatId: folio.formatId,
          cards: polished.cards,
        });
      }
    }
    const locale = useFolio.getState().locale;
    if (ready.length) toast.success(t(locale, "scanBgDone", { n: ready.length }));
  } finally {
    document.removeEventListener("visibilitychange", onVisible);
    if (generation === gen) {
      useFolio.getState().setScanJob({ busy: false, progress: null });
      dropAwake();
    }
  }
}
