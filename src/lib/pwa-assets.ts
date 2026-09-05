export const PWA_MANIFEST = {
  name: "Conversation",
  short_name: "Conversation",
  description: "紙の上で、英語を書く。会話、画像の読み取り、AnkiDroid への書き出し。",
  id: "/",
  start_url: "/",
  scope: "/",
  display: "standalone",
  display_override: ["standalone", "minimal-ui"],
  lang: "ja",
  dir: "ltr",
  background_color: "#e4d7c3",
  theme_color: "#e4d7c3",
  prefer_related_applications: false,
  categories: ["education"],
  icons: [
    { src: "/icon-180.png", sizes: "180x180", type: "image/png", purpose: "any" },
    { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
  ],
} as const;

export const SW_SOURCE = `self.addEventListener("install", function (event) {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});
self.addEventListener("fetch", function (event) {
  event.respondWith(fetch(event.request).catch(function () {
    if (event.request.mode === "navigate") {
      return new Response("オフラインです", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    return new Response("", { status: 504 });
  }));
});
`;
