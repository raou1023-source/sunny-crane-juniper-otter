const MAX_DATA_URL = 6_000_000;

export function isSafeImageDataUrl(s: string) {
  if (typeof s !== "string") return false;
  if (s.length < 32 || s.length > MAX_DATA_URL) return false;
  if (s.includes("\0") || s.includes(" ")) return false;
  return /^data:image\/(jpeg|jpg|png|webp|gif);base64,[A-Za-z0-9+/]+=*$/.test(s);
}

export function onlySafeImageUrls(urls: unknown, max = 8) {
  if (!Array.isArray(urls)) return [];
  return urls.filter((u): u is string => typeof u === "string" && isSafeImageDataUrl(u)).slice(0, max);
}
