import { useMemo, useState } from "react";
import { toast } from "sonner";
import { NativeSelect } from "@/components/native-select";
import type { AnkiCard } from "@/lib/anki";
import { copyText } from "@/lib/clipboard";
import {
  downloadBlob,
  EXPORT_KINDS,
  type ExportKind,
  shareBlob,
  textForKind,
  toAnkiDroidCsv,
  toExcelXml,
} from "@/lib/export-files";
import { cardsToPdfBlob } from "@/lib/pdf";
import { t } from "@/lib/i18n";
import { useFolio } from "@/lib/store";

export function ExportBar({
  cards,
  fallbackText,
}: {
  cards: AnkiCard[];
  fallbackText?: string;
}) {
  const locale = useFolio((s) => s.locale);
  const [kind, setKind] = useState<ExportKind>("anki");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const preview = useMemo(
    () => textForKind(kind, cards, fallbackText ?? ""),
    [kind, cards, fallbackText],
  );

  if (!cards.length && !(fallbackText ?? "").trim()) return null;

  async function fileForKind(): Promise<{ name: string; blob: Blob; copiedText?: string }> {
    if (kind === "excel") {
      const xml = cards.length ? toExcelXml(cards) : preview;
      return {
        name: "Conversation.xls",
        blob: new Blob([xml], { type: "application/vnd.ms-excel" }),
        copiedText: preview,
      };
    }
    if (kind === "pdf") {
      if (!cards.length) throw new Error("カードがありません");
      const blob = await cardsToPdfBlob(cards);
      return { name: "Conversation.pdf", blob, copiedText: preview };
    }
    if (kind === "text") {
      const text = preview;
      return {
        name: "Conversation.txt",
        blob: new Blob([text], { type: "text/plain;charset=utf-8" }),
        copiedText: text,
      };
    }
    const csv = cards.length ? toAnkiDroidCsv(cards) : preview;
    return {
      name: "Conversation-ankidroid.csv",
      blob: new Blob([csv], { type: "text/csv;charset=utf-8" }),
      copiedText: csv,
    };
  }

  async function save() {
    setBusy(true);
    try {
      const file = await fileForKind();
      downloadBlob(file.name, file.blob);
      toast.success(`${file.name} を保存しました`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "書き出せませんでした");
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    setBusy(true);
    try {
      const file = await fileForKind();
      const shared = await shareBlob(file.name, file.blob);
      toast.success(shared ? "共有シートを開きました" : `${file.name} を保存しました`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "共有できませんでした");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    const text = preview;
    if (!text.trim()) return;
    const ok = await copyText(text);
    if (!ok) {
      toast.error("下の欄を長押ししてコピーしてください");
      return;
    }
    setCopied(true);
    toast.success("コピーしました");
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <NativeSelect
        id="folio-export-kind"
        label={t(locale, "export")}
        value={kind}
        onChange={setKind}
        options={EXPORT_KINDS}
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="inline-flex h-11 cursor-pointer touch-manipulation items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground select-none disabled:opacity-45"
        >
          {busy ? t(locale, "preparing") : t(locale, "download")}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void share()}
          className="inline-flex h-11 cursor-pointer touch-manipulation items-center rounded-md bg-secondary px-4 text-sm font-medium text-secondary-foreground disabled:opacity-45"
        >
          {t(locale, "share")}
        </button>
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex h-11 cursor-pointer touch-manipulation items-center rounded-md bg-paper px-4 text-sm font-medium paper-shadow"
        >
          {copied ? t(locale, "copied") : t(locale, "copy")}
        </button>
      </div>
      <label className="flex min-w-0 flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">
          {kind === "anki"
            ? t(locale, "exportAnki")
            : kind === "pdf"
              ? t(locale, "exportPdf")
              : t(locale, "exportHold")}
        </span>
        <textarea
          readOnly
          value={preview}
          rows={3}
          className="max-h-28 min-h-16 w-full resize-y rounded-md bg-background px-3 py-2 font-mono text-xs leading-relaxed text-foreground shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-foreground)_10%,transparent)]"
          onFocus={(e) => e.currentTarget.select()}
        />
      </label>
    </div>
  );
}
