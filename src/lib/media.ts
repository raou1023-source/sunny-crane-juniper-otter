const ALLOWED_IMAGE = /^image\/(jpeg|jpg|png|webp|gif|heic|heif)$/i;
const ALLOWED_AUDIO = /^(audio|video)\/(mpeg|mp3|mp4|aac|wav|x-wav|webm|ogg|m4a|x-m4a)$/i;

export async function compressImage(file: File): Promise<string> {
  if (/svg|xml|html/i.test(file.type) || /\.svg$/i.test(file.name)) {
    throw new Error("その画像形式は使えません");
  }
  if (file.type && !file.type.startsWith("image/")) {
    throw new Error("画像ファイルを選んでください");
  }
  if (file.size > 8_000_000) {
    throw new Error("画像が大きすぎます（8MBまで）");
  }
  const bitmap = await createImageBitmap(file);
  const max = 1280;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("画像を処理できませんでした");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const quality = file.size > 1_200_000 ? 0.72 : 0.84;
  return canvas.toDataURL("image/jpeg", quality);
}

export function playDataAudio(audio: string, mime: string) {
  const safeMime = ALLOWED_AUDIO.test(mime) ? mime : "audio/mpeg";
  const el = new Audio(`data:${safeMime};base64,${audio}`);
  void el.play();
  return el;
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
