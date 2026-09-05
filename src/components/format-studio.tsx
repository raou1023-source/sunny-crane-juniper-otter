import { useState } from "react";
import { Volume2 } from "lucide-react";
import { toast } from "sonner";
import { AnkiCards } from "@/components/anki-cards";
import { ExportBar } from "@/components/export-bar";
import { FormatPicker } from "@/components/format-picker";
import { NativeSelect } from "@/components/native-select";
import { StudyMarkdown } from "@/components/study-markdown";
import { Textarea } from "@/components/ui/textarea";
import { formatText } from "@/lib/ai";
import { SAMPLE_ENGLISH } from "@/lib/formats";
import { speakText, unlockSpeak } from "@/lib/speech";
import { useFolio } from "@/lib/store";
import { t } from "@/lib/i18n";

export function FormatStudio() {
  const {
    level,
    formatId,
    setFormatId,
    customFormat,
    setCustomFormat,
    lastFormat,
    setLastFormat,
    voiceId,
    ttsSpeed,
    ttsEngine,
    formatDraft,
    setFormatDraft,
    locale,
  } = useFolio();
  const [source, setSource] = useState(lastFormat?.source || formatDraft || "");
  const [busy, setBusy] = useState(false);
  const [go, setGo] = useState("");

  const cards = lastFormat?.cards ?? [];

  async function run(text = source) {
    const trimmed = text.trim();
    if (!trimmed) {
      toast.error("テキストを入力してください");
      return;
    }
    if (formatId === "custom" && !customFormat.trim()) {
      toast.error("出力の形を書いてください");
      return;
    }
    setBusy(true);
    try {
      const res = await formatText({
        data: { source: trimmed, level, formatId, customFormat, locale },
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setLastFormat({
        source: trimmed,
        output: res.output,
        notesJa: res.notesJa,
        formatId,
        cards: res.cards ?? [],
      });
      setGo("");
    } catch {
      toast.error("整形に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <FormatPicker
        value={formatId}
        custom={customFormat}
        onChange={setFormatId}
        onCustom={setCustomFormat}
      />

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <section className="flex min-w-0 flex-col gap-3 paper-sheet p-4 sm:p-5">
          <div className="flex items-end justify-between gap-2">
            <h2 className="text-xs font-medium tracking-wide text-muted-foreground">入力</h2>
            <NativeSelect
              id="folio-sample"
              ariaLabel="サンプルを入れる"
              className="w-44 shrink-0"
              value=""
              onChange={(id) => {
                if (id === "sample") setSource(SAMPLE_ENGLISH);
              }}
              options={[
                { id: "", label: "サンプルを入れる" },
                { id: "sample", label: "書店の土曜（英文）" },
              ]}
            />
          </div>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void run();
            }}
          >
            <Textarea
              id="format-source"
              value={source}
              onChange={(e) => {
                setSource(e.target.value);
                setFormatDraft(e.target.value);
              }}
              placeholder={t(locale, "formatPh")}
              className="min-h-48 flex-1"
            />
            <label className="flex flex-col gap-1" htmlFor="format-go">
              <span className="text-xs font-medium text-muted-foreground">
                生成する（この欄をタップしてキーボードの送信）
              </span>
              <input
                id="format-go"
                type="text"
                enterKeyHint="go"
                autoComplete="off"
                value={go}
                disabled={busy}
                onChange={(e) => setGo(e.target.value)}
                placeholder="ここをタップして送信"
                className="field h-12 px-3.5 text-base"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="h-11 w-full cursor-pointer touch-manipulation rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground select-none disabled:opacity-45 sm:w-auto"
            >
              {busy ? "生成中…" : "この形式で生成"}
            </button>
          </form>
        </section>

        <section className="min-w-0 overflow-hidden paper-sheet p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-xs font-medium tracking-wide text-muted-foreground">出力</h2>
            {lastFormat?.output ? (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  unlockSpeak();
                  const spoken = cards[0]?.front
                    ? cards
                        .slice(0, 6)
                        .map((c) => c.front)
                        .join(". ")
                    : lastFormat.output.replace(/[#|*`]/g, "").slice(0, 800);
                  try {
                    await speakText({
                      text: spoken,
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
                  聞く
                </button>
              </form>
            ) : null}
          </div>
          {busy ? (
            <div className="space-y-3 py-2">
              <div className="h-4 w-36 rounded-sm folio-shimmer" />
              <div className="h-3 w-full rounded-sm folio-shimmer" />
              <div className="h-3 w-5/6 rounded-sm folio-shimmer" />
              <div className="h-3 w-2/3 rounded-sm folio-shimmer" />
            </div>
          ) : lastFormat?.output || cards.length ? (
            <div className="flex min-w-0 flex-col gap-4">
              <ExportBar cards={cards} fallbackText={lastFormat?.output} />
              {cards.length ? <AnkiCards cards={cards} /> : null}
              {lastFormat?.output && (formatId !== "anki" || !cards.length) ? (
                <StudyMarkdown text={lastFormat.output} />
              ) : null}
              {lastFormat?.notesJa ? (
                <p className="border-t border-border pt-4 text-sm leading-relaxed text-muted-foreground">
                  {lastFormat.notesJa}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="py-6">
              <p className="font-display text-2xl leading-tight">書いて、AnkiDroidへ。</p>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                基本の書き出しは 単語／フレーズ・意味・Core Concept・例文5つ。ファイルを保存して
                AnkiDroid の「読み込む」へ。自由指定なら、欲しい形をそのまま書いてください。
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
