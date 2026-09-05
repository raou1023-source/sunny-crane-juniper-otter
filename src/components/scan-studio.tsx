import { useCallback, useEffect } from "react";
import { Loader2, RefreshCw, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { CopyButton, TapToCopy } from "@/components/copy-button";
import { FileField } from "@/components/file-field";
import { FormatPicker } from "@/components/format-picker";
import { PaperSheet } from "@/components/paper-sheet";
import { StudyMarkdown } from "@/components/study-markdown";
import { AnkiCards } from "@/components/anki-cards";
import { ExportBar } from "@/components/export-bar";
import { compressImage } from "@/lib/media";
import { startScanJob } from "@/lib/scan-job";
import { speakText, unlockSpeak } from "@/lib/speech";
import { useFolio } from "@/lib/store";
import { t } from "@/lib/i18n";

const MAX_IMAGES = 8;

export function ScanStudio() {
  const {
    level,
    formatId,
    setFormatId,
    customFormat,
    setCustomFormat,
    lastScan,
    setLastScan,
    voiceId,
    ttsSpeed,
    ttsEngine,
    pendingImages,
    setPendingImages,
    scanPreviews,
    setScanPreviews,
    scanBusy,
    scanProgress,
    locale,
  } = useFolio();

  const previews = scanPreviews;
  const busy = scanBusy;
  const progress = scanProgress;

  const ingestFiles = useCallback(
    async (files: File[], mode: "replace" | "append") => {
      const images = files.filter((f) => f.type.startsWith("image/") || !f.type);
      if (!images.length) {
        toast.error(t(locale, "toastNeedImage"));
        return;
      }
      try {
        const urls = await Promise.all(images.map((file) => compressImage(file)));
        const next =
          mode === "append" ? [...previews, ...urls].slice(0, MAX_IMAGES) : urls.slice(0, MAX_IMAGES);
        if (mode === "append" && previews.length + urls.length > MAX_IMAGES) {
          toast.error(t(locale, "toastMax"));
        }
        setScanPreviews(next);
        startScanJob(next);
      } catch {
        toast.error(t(locale, "toastImageFail"));
      }
    },
    [previews, locale, setScanPreviews],
  );

  useEffect(() => {
    if (!pendingImages.length) return;
    const urls = pendingImages.slice(0, MAX_IMAGES);
    setPendingImages([]);
    setScanPreviews(urls);
    startScanJob(urls);
  }, [pendingImages, setPendingImages, setScanPreviews]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <FormatPicker
        value={formatId}
        custom={customFormat}
        onChange={setFormatId}
        onCustom={setCustomFormat}
      />

      <PaperSheet className="p-4 sm:p-5">
        {previews.length ? (
          <div className="flex flex-col gap-3">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {previews.map((src, i) =>
                src.startsWith("data:image/") ? (
                <img
                  key={`${src.slice(-24)}-${i}`}
                  src={src}
                  alt=""
                  className="h-28 w-28 shrink-0 rounded-sm object-cover outline outline-1 -outline-offset-1 outline-foreground/15"
                />
                ) : null,
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {t(locale, "scanCount", { n: previews.length })}
            </p>
            <p className="text-xs text-muted-foreground">{t(locale, "scanMax")}</p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <FileField
                id="scan-add"
                label={t(locale, "scanAdd")}
                accept="image/*"
                multiple
                disabled={busy || previews.length >= MAX_IMAGES}
                onFiles={(files) => void ingestFiles(files, "append")}
              />
              <FileField
                id="scan-replace"
                label={t(locale, "scanReplace")}
                accept="image/*"
                multiple
                disabled={busy}
                onFiles={(files) => void ingestFiles(files, "replace")}
              />
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                startScanJob(previews);
              }}
            >
              <button
                type="submit"
                disabled={busy}
                className="inline-flex h-11 cursor-pointer touch-manipulation items-center gap-2 rounded-md bg-secondary px-4 text-sm font-medium text-secondary-foreground disabled:opacity-45"
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                {busy && progress
                  ? t(locale, "scanReading", { done: progress.done, total: progress.total })
                  : t(locale, "scanRerun")}
              </button>
            </form>
          </div>
        ) : (
          <div className="flex flex-col items-stretch gap-4 py-2 sm:py-4">
            <p className="text-xs font-medium tracking-wide text-muted-foreground">Scan</p>
            <h2 className="font-display text-3xl leading-tight">{t(locale, "scanTitle")}</h2>
            <p className="max-w-lg text-sm leading-relaxed text-muted-foreground">
              {t(locale, "scanLead")}
            </p>
            <p className="text-xs font-medium text-muted-foreground">{t(locale, "scanMax")}</p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <FileField
                id="scan-file"
                label={t(locale, "scanPick")}
                accept="image/*"
                multiple
                onFiles={(files) => void ingestFiles(files, "replace")}
              />
              <FileField
                id="scan-camera"
                label={t(locale, "scanCamera")}
                accept="image/*"
                capture="environment"
                onFile={(file) => void ingestFiles([file], "replace")}
              />
            </div>
          </div>
        )}
      </PaperSheet>

      {busy ? (
        <div className="space-y-3 paper-sheet p-5">
          <p className="text-sm text-muted-foreground">
            {progress ? t(locale, "scanReading", { done: progress.done, total: progress.total }) : t(locale, "scanBusy")}
          </p>
          <div className="h-4 w-40 rounded-sm folio-shimmer" />
          <div className="h-3 w-full rounded-sm folio-shimmer" />
          <div className="h-3 w-5/6 rounded-sm folio-shimmer" />
          <div className="h-3 w-2/3 rounded-sm folio-shimmer" />
        </div>
      ) : lastScan ? (
        <div className="grid min-w-0 gap-4 lg:grid-cols-2">
          <section className="min-w-0 overflow-hidden paper-sheet p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-xs font-medium tracking-wide text-muted-foreground">{t(locale, "scanExtracted")}</h3>
              <div className="flex flex-wrap">
                {lastScan.extracted ? (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      unlockSpeak();
                      try {
                        await speakText({
                          text: lastScan.extracted.slice(0, 800),
                          voiceId,
                          speed: ttsSpeed,
                          engine: ttsEngine,
                        });
                      } catch {
                        toast.error("音声を再生できませんでした");
                      }
                    }}
                  >
                    <button
                      type="submit"
                      className="inline-flex h-11 cursor-pointer touch-manipulation items-center gap-1 rounded-md px-3 text-sm"
                    >
                      <Volume2 className="size-4" />
                      {t(locale, "listen")}
                    </button>
                  </form>
                ) : null}
                {lastScan.extracted ? (
                  <CopyButton text={lastScan.extracted} label={t(locale, "copyEn")} />
                ) : null}
                {lastScan.extracted || lastScan.translationJa ? (
                  <CopyButton
                    text={[lastScan.extracted, lastScan.translationJa].filter(Boolean).join("\n\n")}
                    label={t(locale, "copyAll")}
                  />
                ) : null}
              </div>
            </div>
            {lastScan.extracted ? (
              <TapToCopy text={lastScan.extracted}>
                <p className="whitespace-pre-wrap font-display text-[1.02rem] leading-relaxed">
                  {lastScan.extracted}
                </p>
              </TapToCopy>
            ) : (
              <p className="text-sm text-muted-foreground">{t(locale, "scanNone")}</p>
            )}
            {lastScan.translationJa ? (
              <TapToCopy text={lastScan.translationJa}>
                <p className="mt-4 border-t border-border pt-4 text-sm leading-relaxed text-muted-foreground">
                  {lastScan.translationJa}
                </p>
              </TapToCopy>
            ) : null}
          </section>
          <section className="min-w-0 overflow-hidden paper-sheet p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-xs font-medium tracking-wide text-muted-foreground">{t(locale, "scanFormatted")}</h3>
              <CopyButton text={lastScan.formatted} />
            </div>
            <div className="flex min-w-0 flex-col gap-4">
              <ExportBar cards={lastScan.cards ?? []} fallbackText={lastScan.formatted} />
              {(lastScan.cards ?? []).length ? <AnkiCards cards={lastScan.cards} /> : null}
              {lastScan.formatted && (!(lastScan.cards ?? []).length || formatId !== "anki") ? (
                <StudyMarkdown text={lastScan.formatted} />
              ) : null}
            </div>
            {lastScan.notesJa ? (
              <p className="mt-4 border-t border-border pt-4 text-sm leading-relaxed text-muted-foreground">
                {lastScan.notesJa}
              </p>
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}
