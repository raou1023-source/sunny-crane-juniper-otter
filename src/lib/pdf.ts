import { filledExamples, isolateCards, type AnkiCard } from "@/lib/anki";

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number) {
  const lines: string[] = [];
  const pushChars = (s: string) => {
    let buf = "";
    for (const ch of s) {
      const next = buf + ch;
      if (ctx.measureText(next).width <= max) buf = next;
      else {
        if (buf) lines.push(buf);
        buf = ch;
      }
    }
    if (buf) lines.push(buf);
  };
  const words = text.split(/\s+/).filter(Boolean);
  let cur = "";
  for (const w of words) {
    if (ctx.measureText(w).width > max) {
      if (cur) {
        lines.push(cur);
        cur = "";
      }
      pushChars(w);
      continue;
    }
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width <= max) cur = next;
    else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function drawCard(
  ctx: CanvasRenderingContext2D,
  card: AnkiCard,
  x: number,
  y: number,
  w: number,
) {
  let cy = y;
  ctx.fillStyle = "#1c1915";
  ctx.font = "600 40px Fraunces, 'Iowan Old Style', serif";
  for (const line of wrap(ctx, card.front, w)) {
    ctx.fillText(line, x, cy);
    cy += 48;
  }
  cy += 8;
  ctx.font = "500 22px 'IBM Plex Sans JP', sans-serif";
  ctx.fillStyle = "#6e675c";
  ctx.fillText("Meaning", x, cy);
  cy += 32;
  ctx.fillStyle = "#1c1915";
  ctx.font = "400 26px 'IBM Plex Sans JP', sans-serif";
  for (const line of wrap(ctx, card.meaning, w)) {
    ctx.fillText(line, x, cy);
    cy += 34;
  }
  cy += 10;
  ctx.fillStyle = "#6e675c";
  ctx.font = "500 22px 'IBM Plex Sans JP', sans-serif";
  ctx.fillText("Core Concept", x, cy);
  cy += 32;
  ctx.fillStyle = "#1c1915";
  ctx.font = "400 26px 'IBM Plex Sans JP', sans-serif";
  for (const line of wrap(ctx, card.core, w)) {
    ctx.fillText(line, x, cy);
    cy += 34;
  }
  if (card.coreJa) {
    ctx.fillStyle = "#6e675c";
    ctx.font = "400 22px 'IBM Plex Sans JP', sans-serif";
    for (const line of wrap(ctx, card.coreJa, w)) {
      ctx.fillText(line, x, cy);
      cy += 30;
    }
  }
  if (card.note) {
    cy += 10;
    ctx.fillStyle = "#6e675c";
    ctx.font = "500 22px 'IBM Plex Sans JP', sans-serif";
    ctx.fillText("Usage", x, cy);
    cy += 32;
    ctx.fillStyle = "#1c1915";
    ctx.font = "400 24px 'IBM Plex Sans JP', sans-serif";
    for (const line of wrap(ctx, card.note, w)) {
      ctx.fillText(line, x, cy);
      cy += 32;
    }
  }
  cy += 12;
  ctx.fillStyle = "#6e675c";
  ctx.font = "500 22px 'IBM Plex Sans JP', sans-serif";
  ctx.fillText("Examples", x, cy);
  cy += 34;
  filledExamples(card).forEach((ex, i) => {
    ctx.fillStyle = "#1c1915";
    ctx.font = "400 24px 'IBM Plex Sans JP', sans-serif";
    const body = ex.en.replace(/\*\*/g, "");
    const lines = wrap(ctx, `${i + 1}. ${body}`, w);
    for (const line of lines) {
      ctx.fillText(line, x, cy);
      cy += 32;
    }
    if (ex.ja) {
      ctx.fillStyle = "#6e675c";
      ctx.font = "400 20px 'IBM Plex Sans JP', sans-serif";
      for (const line of wrap(ctx, ex.ja, w - 16)) {
        ctx.fillText(line, x + 16, cy);
        cy += 28;
      }
    }
    cy += 8;
  });
  return cy;
}


function jpegOfCanvas(canvas: HTMLCanvasElement) {
  const dataUrl = canvas.toDataURL("image/jpeg", 0.84);
  const raw = dataUrl.split(",")[1] ?? "";
  const bin = atob(raw);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function buildPdf(images: { bytes: Uint8Array; w: number; h: number }[]) {
  const pageW = 595;
  const pageH = 842;
  const objs: string[] = [];
  const offsets: number[] = [];
  const parts: (string | Uint8Array)[] = [];
  const encoder = new TextEncoder();

  function add(obj: string | Uint8Array) {
    parts.push(obj);
  }

  const kids: string[] = [];
  const imageIds: number[] = [];
  let nextId = 3;
  for (let i = 0; i < images.length; i++) {
    imageIds.push(nextId);
    const contentId = nextId + 1;
    const pageId = nextId + 2;
    kids.push(`${pageId} 0 R`);
    nextId += 3;
    void contentId;
  }

  const catalog = 1;
  const pages = 2;

  const assembled: { id: number; body: string | Uint8Array }[] = [];
  assembled.push({
    id: catalog,
    body: `<< /Type /Catalog /Pages ${pages} 0 R >>`,
  });
  assembled.push({
    id: pages,
    body: `<< /Type /Pages /Count ${images.length} /Kids [${kids.join(" ")}] >>`,
  });

  let id = 3;
  images.forEach((img, i) => {
    const imgId = id;
    const contentId = id + 1;
    const pageId = id + 2;
    id += 3;
    assembled.push({
      id: imgId,
      body: img.bytes,
    });
    assembled.push({
      id: contentId,
      body: `<< /Length ${`q ${pageW} 0 0 ${pageH} 0 0 cm /Im${i} Do Q`.length} >>\nstream\nq ${pageW} 0 0 ${pageH} 0 0 cm /Im${i} Do Q\nendstream`,
    });
    assembled.push({
      id: pageId,
      body: `<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im${i} ${imgId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    });
    void img;
  });

  add("%PDF-1.4\n");
  const sorted = assembled.sort((a, b) => a.id - b.id);
  let pos = encoder.encode("%PDF-1.4\n").length;
  for (const item of sorted) {
    offsets[item.id] = pos;
    if (item.body instanceof Uint8Array) {
      const img = images[imageIds.indexOf(item.id)];
      const dict = `<< /Type /XObject /Subtype /Image /Width ${img.w} /Height ${img.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${item.body.length} >>\nstream\n`;
      const header = `${item.id} 0 obj\n${dict}`;
      const tail = `\nendstream\nendobj\n`;
      add(header);
      add(item.body);
      add(tail);
      pos += encoder.encode(header).length + item.body.length + encoder.encode(tail).length;
    } else {
      const chunk = `${item.id} 0 obj\n${item.body}\nendobj\n`;
      add(chunk);
      pos += encoder.encode(chunk).length;
    }
  }

  const xrefPos = pos;
  const maxId = Math.max(...sorted.map((s) => s.id));
  let xref = `xref\n0 ${maxId + 1}\n`;
  xref += "0000000000 65535 f \n";
  for (let i = 1; i <= maxId; i++) {
    const off = offsets[i] ?? 0;
    xref += `${String(off).padStart(10, "0")} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  add(xref);

  let total = 0;
  const bins = parts.map((p) => {
    if (typeof p === "string") {
      const b = encoder.encode(p);
      total += b.length;
      return b;
    }
    total += p.length;
    return p;
  });
  const out = new Uint8Array(total);
  let o = 0;
  for (const b of bins) {
    out.set(b, o);
    o += b.length;
  }
  return new Blob([out], { type: "application/pdf" });
}

export async function cardsToPdfBlob(cards: AnkiCard[]): Promise<Blob> {
  const isolated = isolateCards(cards);
  await document.fonts.ready.catch(() => undefined);
  const W = 1190;
  const H = 1684;
  const pages: { bytes: Uint8Array; w: number; h: number }[] = [];
  const per = 2;
  for (let i = 0; i < isolated.length; i += per) {
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("PDF を作れませんでした");
    ctx.fillStyle = "#fffcf6";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#2c4a42";
    ctx.font = "500 22px 'IBM Plex Sans JP', sans-serif";
    ctx.fillText("Conversation  ·  AnkiDroid", 64, 56);
    let y = 110;
    const slice = isolated.slice(i, i + per);
    for (const card of slice) {
      y = drawCard(ctx, card, 64, y, W - 128) + 48;
    }
    pages.push({ bytes: jpegOfCanvas(canvas), w: W, h: H });
  }
  if (!pages.length) {
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("PDF を作れませんでした");
    ctx.fillStyle = "#fffcf6";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#1c1915";
    ctx.font = "600 40px Fraunces, serif";
    ctx.fillText("Conversation", 64, 120);
    pages.push({ bytes: jpegOfCanvas(canvas), w: W, h: H });
  }
  return buildPdf(pages);
}
