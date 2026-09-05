import { type AnkiCard, cardBackHtml, cleanField, csvField, isolateCards, toReadableText } from "@/lib/anki";

export function toAnkiDroidCsv(cards: AnkiCard[], deck = "Conversation"): string {
  const isolated = isolateCards(cards);
  const header = [
    "#separator:comma",
    "#html:true",
    `#deck:${deck}`,
    "#notetype:Basic",
    "#columns:Front,Back",
  ].join("\n");
  const rows = isolated.map((c) => {
    const front = cleanField(c.front);
    const back = cardBackHtml(c).replace(/\r?\n/g, "");
    return `${csvField(front)},${csvField(back)}`;
  });
  return `\uFEFF${header}\n${rows.join("\n")}\n`;
}

export function toSheetCsv(cards: AnkiCard[]): string {
  const isolated = isolateCards(cards);
  const head = [
    "Front",
    "Meaning",
    "Core Concept",
    "Core Concept JA",
    "Usage",
    "Example1",
    "Example1 JA",
    "Example2",
    "Example2 JA",
    "Example3",
    "Example3 JA",
    "Example4",
    "Example4 JA",
    "Example5",
    "Example5 JA",
  ]
    .map(csvField)
    .join(",");
  const rows = isolated.map((c) =>
    [
      c.front,
      c.meaning,
      c.core,
      c.coreJa,
      c.note,
      ...c.examples.flatMap((e) => [e.en, e.ja]),
    ]
      .map((v) => csvField(cleanField(v)))
      .join(","),
  );
  return `\uFEFF${head}\n${rows.join("\n")}\n`;
}

function xmlEsc(s: string) {
  return s
    .replace(/&/g, "&" + "amp;")
    .replace(/</g, "&" + "lt;")
    .replace(/>/g, "&" + "gt;")
    .replace(/"/g, "&" + "quot;");
}

export function toExcelXml(cards: AnkiCard[]): string {
  const isolated = isolateCards(cards);
  const cols = [
    "Front",
    "Meaning",
    "Core Concept",
    "Core Concept JA",
    "Usage",
    "Example1",
    "Example1 JA",
    "Example2",
    "Example2 JA",
    "Example3",
    "Example3 JA",
    "Example4",
    "Example4 JA",
    "Example5",
    "Example5 JA",
  ];
  const headerRow = cols
    .map((c) => `<Cell><Data ss:Type="String">${xmlEsc(c)}</Data></Cell>`)
    .join("");
  const body = isolated
    .map((card) => {
      const vals = [
        card.front,
        card.meaning,
        card.core,
        card.coreJa,
        card.note,
        ...card.examples.flatMap((e) => [e.en, e.ja]),
      ];
      return `<Row>${vals
        .map((v) => `<Cell><Data ss:Type="String">${xmlEsc(v)}</Data></Cell>`)
        .join("")}</Row>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Eikaiwa">
  <Table>
   <Row>${headerRow}</Row>
   ${body}
  </Table>
 </Worksheet>
</Workbook>`;
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function shareBlob(filename: string, blob: Blob) {
  const file = new File([blob], filename, { type: blob.type || "application/octet-stream" });
  const nav = navigator as Navigator & {
    canShare?: (data: { files: File[] }) => boolean;
    share?: (data: { files: File[]; title: string }) => Promise<void>;
  };
  if (nav.canShare?.({ files: [file] })) {
    await nav.share({ files: [file], title: filename });
    return true;
  }
  downloadBlob(filename, file);
  return false;
}

export type ExportKind = "anki" | "excel" | "pdf" | "text";

export const EXPORT_KINDS: { id: ExportKind; label: string }[] = [
  { id: "anki", label: "AnkiDroid（CSV）" },
  { id: "excel", label: "Excel" },
  { id: "pdf", label: "PDF" },
  { id: "text", label: "テキスト" },
];

export function textForKind(kind: ExportKind, cards: AnkiCard[], fallback = "") {
  if (!cards.length) return fallback;
  if (kind === "excel") return toSheetCsv(cards);
  if (kind === "text" || kind === "pdf") return toReadableText(cards);
  return toAnkiDroidCsv(cards);
}
