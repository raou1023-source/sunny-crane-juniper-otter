export type AnkiExample = {
  en: string;
  ja: string;
};

export type AnkiCard = {
  front: string;
  meaning: string;
  core: string;
  coreJa: string;
  note: string;
  examples: AnkiExample[];
};

function asString(v: unknown, max = 500) {
  if (typeof v !== "string") return "";
  return v
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, max);
}

function parseExample(raw: unknown): AnkiExample | null {
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return null;
    const split = t.split(/\s*(?:\n|／|\/\/)\s*/);
    if (split.length >= 2 && /[\u3040-\u30ff\u4e00-\u9fff]/.test(split[1] ?? "")) {
      return { en: split[0] ?? "", ja: split.slice(1).join(" ") };
    }
    return { en: t, ja: "" };
  }
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const en = asString(o.en) || asString(o.english) || asString(o.text) || asString(o.sentence);
  if (!en) return null;
  return { en, ja: asString(o.ja) || asString(o.japanese) || asString(o.translation) };
}

export function parseCards(raw: unknown): AnkiCard[] {
  if (!Array.isArray(raw)) return [];
  const cards: AnkiCard[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const front = asString(o.front) || asString(o.word) || asString(o.phrase);
    if (!front) continue;
    const examples = (
      Array.isArray(o.examples) ? o.examples : Array.isArray(o.example) ? o.example : []
    )
      .map(parseExample)
      .filter((e): e is AnkiExample => Boolean(e))
      .slice(0, 5);
    while (examples.length < 5) examples.push({ en: "", ja: "" });
    const jaList = Array.isArray(o.examples_ja)
      ? o.examples_ja.map((x) => asString(x))
      : Array.isArray(o.example_ja)
        ? o.example_ja.map((x) => asString(x))
        : [];
    if (jaList.length) {
      for (let i = 0; i < examples.length; i++) {
        if (!examples[i]!.ja && jaList[i]) examples[i] = { ...examples[i]!, ja: jaList[i]! };
      }
    }
    cards.push({
      front,
      meaning: asString(o.meaning),
      core: asString(o.core) || asString(o.core_concept) || asString(o.coreConcept),
      coreJa: asString(o.core_ja) || asString(o.coreJa) || asString(o.core_ja_meaning),
      note: asString(o.note) || asString(o.usage) || asString(o.explain),
      examples,
    });
  }
  return cards.slice(0, 8);
}

export function filledExamples(card: AnkiCard) {
  return card.examples.filter((e) => e.en.trim());
}

function normKey(s: string) {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function firstFront(raw: string) {
  return raw
    .split(/\n+|[/｜|]+|(?:\s[・•]\s)/)
    .map((p) => p.trim())
    .find((p) => p.length > 0) ?? raw.trim();
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mentionsKey(text: string, key: string) {
  if (!key || key.length < 2) return false;
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escapeRe(key)}(?:$|[^\\p{L}\\p{N}])`, "iu").test(text);
}

function stripOtherKeys(text: string, others: string[]) {
  let out = text;
  for (const key of others) {
    if (key.length < 3) continue;
    out = out.replace(new RegExp(`(?:^|[,;、/｜\\n])+\\s*${escapeRe(key)}(?=$|[,;、/｜\\n])`, "giu"), "");
  }
  return out.replace(/\s{2,}/g, " ").replace(/^[,;、/\s]+|[,;、/\s]+$/g, "").trim();
}

export function isolateCards(cards: AnkiCard[]): AnkiCard[] {
  const fronts = cards.map((c) => firstFront(c.front));
  return cards.map((card, i) => {
    const front = fronts[i] || firstFront(card.front);
    const self = normKey(front);
    const others = fronts
      .map(normKey)
      .filter((k) => k && k !== self && k.length >= 3 && !self.includes(k))
      .sort((a, b) => b.length - a.length);
    const examples = filledExamples(card)
      .filter((ex) => {
        const en = ex.en.replace(/\*\*/g, "");
        if (mentionsKey(en, self) || en.toLowerCase().includes(self)) return true;
        return !others.some((o) => mentionsKey(en, o) || en.toLowerCase().includes(o));
      })
      .slice(0, 5);
    const keep = examples.length ? examples : filledExamples(card).slice(0, 5);
    while (keep.length < 5) keep.push({ en: "", ja: "" });
    return {
      front,
      meaning: stripOtherKeys(card.meaning, others),
      core: stripOtherKeys(card.core, others),
      coreJa: stripOtherKeys(card.coreJa, others),
      note: stripOtherKeys(card.note, others),
      examples: keep,
    };
  });
}

export function needsJapanese(cards: AnkiCard[]) {
  return cards.some((c) => {
    if (c.core && !c.coreJa) return true;
    if (/\s/.test(c.front) && !c.note) return true;
    return c.examples.some((e) => e.en && !e.ja);
  });
}

export function mergeCards(groups: AnkiCard[][]): AnkiCard[] {
  const seen = new Set<string>();
  const out: AnkiCard[] = [];
  for (const group of groups) {
    for (const card of group) {
      const key = card.front.toLowerCase().replace(/\s+/g, " ").trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(card);
    }
  }
  return out.slice(0, 64);
}

function esc(s: string) {
  return s
    .replace(/&/g, "&" + "amp;")
    .replace(/</g, "&" + "lt;")
    .replace(/>/g, "&" + "gt;")
    .replace(/"/g, "&" + "quot;");
}

function mdBoldToHtml(s: string) {
  return esc(s).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
}

export function cleanField(s: string) {
  return s.replace(/\t/g, " ").replace(/\r?\n/g, " ").trim();
}

export function csvField(s: string) {
  return `"${s.replace(/"/g, '""')}"`;
}

function exampleLines(card: AnkiCard) {
  return filledExamples(card).map((e) => {
    const en = mdBoldToHtml(e.en);
    return e.ja ? `<li>${en}<br><span>${esc(e.ja)}</span></li>` : `<li>${en}</li>`;
  });
}

export function cardBackHtml(card: AnkiCard): string {
  const items = exampleLines(card).join("");
  return [
    card.meaning ? `<div><b>Meaning</b><br>${esc(card.meaning)}</div>` : "",
    card.core || card.coreJa
      ? `<div style="margin-top:0.6em"><b>Core Concept</b><br>${esc(card.core)}${card.coreJa ? `<br>${esc(card.coreJa)}` : ""}</div>`
      : "",
    card.note ? `<div style="margin-top:0.6em"><b>Usage</b><br>${esc(card.note)}</div>` : "",
    items ? `<div style="margin-top:0.6em"><b>Examples</b><ol>${items}</ol></div>` : "",
  ]
    .filter(Boolean)
    .join("");
}

export function cardCopyText(card: AnkiCard): string {
  const examples = filledExamples(card);
  return [
    card.front,
    card.meaning ? `Meaning\n${card.meaning}` : "",
    card.core ? `Core Concept\n${card.core.replace(/\*\*/g, "")}` : "",
    card.coreJa ? card.coreJa : "",
    card.note ? `Usage\n${card.note}` : "",
    examples.length
      ? [
          "Examples",
          ...examples.flatMap((e, n) => {
            const en = e.en.replace(/\*\*/g, "").trim();
            return [`${n + 1}. ${en}`, e.ja ? e.ja : ""];
          }),
        ].join("\n")
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function toAnkiDroidTsv(cards: AnkiCard[], deck = "Conversation"): string {
  const header = [
    "#separator:tab",
    "#html:true",
    `#deck:${deck}`,
    "#notetype:Basic",
    "#columns:Front,Back",
  ].join("\n");
  const rows = cards.map((c) => `${cleanField(c.front)}\t${cardBackHtml(c)}`);
  return `\uFEFF${header}\n${rows.join("\n")}\n`;
}

export function toFieldTsv(cards: AnkiCard[]): string {
  const header = [
    "#separator:tab",
    "#html:true",
    "#deck:Conversation",
    "#columns:Front,Meaning,Core,CoreJa,Note,Example1,Example1Ja,Example2,Example2Ja,Example3,Example3Ja,Example4,Example4Ja,Example5,Example5Ja",
  ].join("\n");
  const rows = cards.map((c) =>
    [
      c.front,
      c.meaning,
      c.core,
      c.coreJa,
      c.note,
      ...c.examples.flatMap((e) => [e.en, e.ja]),
    ]
      .map(cleanField)
      .join("\t"),
  );
  return `\uFEFF${header}\n${rows.join("\n")}\n`;
}

export function toReadableText(cards: AnkiCard[]): string {
  return isolateCards(cards)
    .map((c, i) => `${i + 1}. ${cardCopyText(c)}`)
    .join("\n\n----------\n\n");
}

export function downloadTextFile(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function shareTextFile(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const file = new File([blob], filename, { type: "text/plain" });
  const nav = navigator as Navigator & {
    canShare?: (data: { files: File[] }) => boolean;
    share?: (data: { files: File[]; title: string }) => Promise<void>;
  };
  if (nav.canShare?.({ files: [file] })) {
    await nav.share({ files: [file], title: filename });
    return true;
  }
  downloadTextFile(filename, text);
  return false;
}

export function ankiCardInstruction(lang: string) {
  return `AnkiDroid cards: produce UP TO 8 cards when the source has enough items. Do not stop at 5. 8 is the target when 8 words/phrases are present.

Each card:
- front: English word OR phrase
- meaning: meaning in ${lang}
- core: one simple English Core Concept sentence
- core_ja: ${lang} translation of that Core Concept. REQUIRED. Never omit. (JSON key stays core_ja)
- note: usage note in ${lang}. REQUIRED for phrases and high-frequency expressions (when to use, nuance). One or two short sentences. Empty only for a very simple single word.
- examples: EXACTLY 5 items, each MUST be {"en":"sentence with **target** in bold","ja":"${lang} translation of that sentence"}. Never omit ja.

Output 8 cards if 8 distinct words or phrases exist. Output fewer only when the source has fewer than 8.

Bad: examples as English strings only.
Good: examples as objects with both en and ja.`;
}

export const ANKI_CARD_INSTRUCTION = ankiCardInstruction("Japanese");
