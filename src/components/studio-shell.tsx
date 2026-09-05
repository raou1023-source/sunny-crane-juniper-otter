import { useEffect, useState } from "react";
import { toast, Toaster } from "sonner";
import { AuthSlot } from "@/components/auth-slot";
import { FolioMark } from "@/components/folio-mark";
import { FormatStudio } from "@/components/format-studio";
import { HistorySync } from "@/components/history-sync";
import { LevelBar } from "@/components/level-bar";
import { NativeSelect } from "@/components/native-select";
import { PwaInstall } from "@/components/pwa-install";
import { ScanStudio } from "@/components/scan-studio";
import { SpeakStudio } from "@/components/speak-studio";
import { Label } from "@/components/ui/label";
import { getAiStatus } from "@/lib/ai";
import { imageFilesFromClipboard } from "@/lib/clipboard";
import { VOICES } from "@/lib/formats";
import { compressImage } from "@/lib/media";
import { rehydrateFolio, useFolio } from "@/lib/store";
import { LOCALES, LOCALE_META, detectLocale, t } from "@/lib/i18n";

export function StudioShell() {
  const {
    mode,
    setMode,
    level,
    setLevel,
    voiceId,
    setVoiceId,
    autoPlay,
    setAutoPlay,
    ttsSpeed,
    setTtsSpeed,
    setPendingImages,
    locale,
    setLocale,
    scanBusy,
    scanProgress,
  } = useFolio();
  const [aiOff, setAiOff] = useState(false);

  useEffect(() => {
    rehydrateFolio();
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = locale;
    document.documentElement.dir = LOCALE_META[locale].dir;
  }, [locale]);

  useEffect(() => {
    try {
      if (!localStorage.getItem("folio-en")) setLocale(detectLocale());
    } catch {
      /* ignore */
    }
  }, [setLocale]);

  useEffect(() => {
    let alive = true;
    void getAiStatus().then((s) => {
      if (alive) setAiOff(!s.available);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    async function takeFiles(files: File[]) {
      const images = files.filter((f) => f.type.startsWith("image/")).slice(0, 8);
      if (!images.length) return;
      try {
        const urls = await Promise.all(images.map((file) => compressImage(file)));
        setPendingImages(urls);
        setMode("scan");
        toast.success(urls.length > 1 ? t(locale, "toastGotMany", { n: urls.length }) : t(locale, "toastGotOne"));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t(locale, "toastImageFail"));
      }
    }

    const onPaste = (e: ClipboardEvent) => {
      const files = imageFilesFromClipboard(e.clipboardData);
      if (!files.length) return;
      e.preventDefault();
      void takeFiles(files);
    };

    const onDragOver = (e: DragEvent) => {
      if ([...(e.dataTransfer?.types ?? [])].includes("Files")) e.preventDefault();
    };

    const onDrop = (e: DragEvent) => {
      const files = [...(e.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith("image/"));
      if (!files.length) return;
      e.preventDefault();
      void takeFiles(files);
    };

    window.addEventListener("paste", onPaste);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [setMode, setPendingImages, locale]);

  return (
    <div className="flex min-h-dvh flex-col pb-[env(safe-area-inset-bottom)]">
      <Toaster
        position="bottom-center"
        offset={96}
        toastOptions={{
          className: "!bg-paper !text-foreground !border-border !font-sans",
        }}
      />
      <header className="sticky top-0 z-20 bg-paper paper-grain pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-3 sm:gap-3 sm:px-6">
          <FolioMark className="size-8 shrink-0 sm:size-9" />
          <div className="min-w-0 flex-1 overflow-hidden pr-2">
            <p className="truncate font-display text-base leading-none tracking-tight sm:text-xl">
              {t(locale, "appName")}
            </p>
            <p className="mt-1 hidden truncate text-[11px] tracking-wide text-muted-foreground sm:block">
              {t(locale, "appTagline")}
            </p>
          </div>
          <AuthSlot />
          <div className="hidden w-[13.5rem] shrink-0 sm:block">
            <LevelBar value={level} onChange={setLevel} compact name="folio-level-header" />
          </div>
        </div>
        <div className="letterhead-rules h-[5px] w-full" />
      </header>

      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-5 sm:px-6 sm:py-7">
        {aiOff ? (
          <p className="mb-4 rounded-md bg-memo px-4 py-3 text-sm paper-shadow">
            {t(locale, "aiOff")}
          </p>
        ) : null}

        <PwaInstall />

        <div className="mb-5 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <NativeSelect
            id="folio-mode"
            label={t(locale, "chooseTask")}
            size="lg"
            value={mode}
            onChange={setMode}
            options={[
              { id: "speak", label: t(locale, "modeSpeak") },
              { id: "scan", label: t(locale, "modeScan") },
              { id: "format", label: t(locale, "modeFormat") },
            ]}
          />
          <details className="paper-sheet px-3 py-2 sm:min-w-52">
            <summary className="flex h-8 cursor-pointer list-none items-center text-sm font-medium select-none [&::-webkit-details-marker]:hidden">
              {t(locale, "settings")}
            </summary>
            <div className="mt-3 grid gap-4 pb-1">
              <div className="sm:hidden">
                <LevelBar value={level} onChange={setLevel} name="folio-level-settings" />
              </div>
              <NativeSelect
                id="folio-voice"
                label={t(locale, "voice")}
                value={voiceId}
                onChange={setVoiceId}
                options={[
                  { id: "device", label: t(locale, "voiceDevice") },
                  ...VOICES.map((v) => ({ id: v.id, label: `Grok · ${v.label} · ${v.blurb}` })),
                ]}
              />
              <NativeSelect
                id="folio-lang"
                label={t(locale, "language")}
                value={locale}
                onChange={(id) => setLocale(id)}
                options={LOCALES.map((id) => ({ id, label: LOCALE_META[id].label }))}
              />
              <div>
                <Label className="mb-2 block" htmlFor="speed">
                  {t(locale, "speed")} {ttsSpeed.toFixed(2)}
                </Label>
                <input
                  id="speed"
                  type="range"
                  min={0.7}
                  max={1.2}
                  step={0.05}
                  value={ttsSpeed}
                  onChange={(e) => setTtsSpeed(Number(e.target.value))}
                  className="w-full accent-primary"
                />
              </div>
              <label className="flex h-11 cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={autoPlay}
                  onChange={(e) => setAutoPlay(e.target.checked)}
                  className="size-4 accent-primary"
                />
                {t(locale, "autoPlay")}
              </label>
            </div>
          </details>
        </div>

        <HistorySync />

        {scanBusy && mode !== "scan" && scanProgress ? (
          <button
            type="button"
            onClick={() => setMode("scan")}
            className="mb-4 w-full rounded-md bg-memo px-4 py-3 text-left text-sm paper-shadow"
          >
            {t(locale, "scanBg", { done: scanProgress.done, total: scanProgress.total })}
          </button>
        ) : null}

        {mode === "speak" ? <SpeakStudio /> : null}
        {mode === "scan" ? <ScanStudio /> : null}
        {mode === "format" ? <FormatStudio /> : null}
      </div>
    </div>
  );
}
