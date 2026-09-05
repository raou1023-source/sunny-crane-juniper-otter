import { useEffect, useRef, useState } from "react";
import { Loader2, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { NativeSelect } from "@/components/native-select";
import { PaperSheet } from "@/components/paper-sheet";
import { Button } from "@/components/ui/button";
import { converse, transcribeAudio } from "@/lib/ai";
import { CHARACTERS, DRILLS, characterById } from "@/lib/characters";
import { imageFilesFromClipboard } from "@/lib/clipboard";
import { FORMATS, SCENARIOS, type ScenarioId } from "@/lib/formats";
import { blobToBase64, compressImage } from "@/lib/media";
import { cancelSpeak, getSpeechRecognition, speakText, startBrowserListen, unlockSpeak } from "@/lib/speech";
import { useFolio } from "@/lib/store";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

function formatWhen(ts: number) {
  const d = new Date(ts);
  const mo = d.getMonth() + 1;
  const day = d.getDate();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${mo}/${day} ${hh}:${mm}`;
}

export function SpeakStudio() {
  const {
    level,
    scenario,
    setScenario,
    voiceId,
    autoPlay,
    ttsSpeed,
    ttsEngine,
    speakTurns,
    addSpeakTurn,
    setMode,
    setFormatId,
    setPendingImages,
    characterId,
    setCharacterId,
    drill,
    setDrill,
    setVoiceId,
    ready,
    sessions,
    sessionId,
    openSession,
    newSpeak,
    speakDraft,
    setSpeakDraft,
    locale,
  } = useFolio();

  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const recApiStop = useRef<(() => void) | null>(null);
  const listenTextRef = useRef("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const sendingRef = useRef(false);
  const playGen = useRef(0);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [speakTurns.length, busy]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      audioRef.current?.pause();
      recApiStop.current?.();
      cancelSpeak();
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, []);

  const listen = drill === "listen";
  const character = characterById(characterId);
  const historyValue = speakTurns.length && sessionId ? sessionId : "new";
  const historyOptions = [
    { id: "new", label: speakTurns.length ? "新しい会話を始める" : "新しい会話" },
    ...sessions.map((s) => ({
      id: s.id,
      label: `${formatWhen(s.updatedAt)} · ${s.title}`,
    })),
  ];
  if (historyValue !== "new" && !historyOptions.some((o) => o.id === historyValue)) {
    historyOptions.splice(1, 0, { id: historyValue, label: "いまの会話" });
  }

  async function playEnglish(id: string, text: string) {
    const gen = (playGen.current += 1);
    cancelSpeak();
    audioRef.current?.pause();
    setPlayingId(id);
    try {
      await speakText({
        text,
        voiceId,
        speed: listen ? Math.min(ttsSpeed, 0.88) : ttsSpeed,
        engine: ttsEngine,
      });
    } catch {
      if (playGen.current === gen) toast.error("音声を再生できませんでした");
    } finally {
      if (playGen.current === gen) setPlayingId(null);
    }
  }

  function applyCommand(raw: string): boolean {
    const t = raw.trim();
    if (t === "/画像" || t === "/scan") {
      setMode("scan");
      return true;
    }
    if (t === "/整形" || t === "/format") {
      setMode("format");
      return true;
    }
    if (t === "/会話" || t === "/speak") {
      setMode("speak");
      return true;
    }
    for (const f of FORMATS) {
      if (t === `/${f.label}` || t === `/${f.id}`) {
        setFormatId(f.id);
        setMode("format");
        return true;
      }
    }
    return false;
  }

  async function send(
    text: string,
    asStart = false,
    scenarioId: ScenarioId = scenario,
    spoken = false,
  ) {
    const content = text.trim();
    if (!content || busy || sendingRef.current) return;
    unlockSpeak();
    if (applyCommand(content)) {
      setSpeakDraft("");
      return;
    }
    setSpeakDraft("");
    sendingRef.current = true;
    setBusy(true);

    if (!asStart) {
      addSpeakTurn({ role: "user", english: content });
    }

    const history = useFolio
      .getState()
      .speakTurns.filter((t) => !asStart || t.role === "tutor")
      .slice(-8)
      .map((t) => ({
        role: (t.role === "user" ? "user" : "assistant") as "user" | "assistant",
        content: t.english,
      }));

    try {
      const res = await converse({
        data: {
          history: asStart ? [] : history.slice(0, -1),
          userMessage: asStart
            ? listen
              ? `Start an advanced listening turn for this topic. Speak first; I will only listen.`
              : `Please greet me and start a conversation practice. Keep it welcoming and short.`
            : content,
          level,
          scenarioId,
          characterId,
          spoken,
          listen,
          locale,
        },
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const turn = addSpeakTurn({
        role: "tutor",
        english: res.english,
        notesJa: res.notesJa,
        corrections: res.corrections,
        newWords: res.newWords,
      });
      if (autoPlay || listen) void playEnglish(turn.id, res.english);
    } catch {
      toast.error("会話に失敗しました。もう一度試してください");
    } finally {
      sendingRef.current = false;
      setBusy(false);
    }
  }

  async function startRecording() {
    if (busy || recording) return;
    cancelSpeak();
    listenTextRef.current = "";
    const appleMobile =
      /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (!appleMobile && getSpeechRecognition()) {
      try {
        recApiStop.current = startBrowserListen((text) => {
          listenTextRef.current = text;
        });
        setRecording(true);
        setRecSecs(0);
        const startedAt = Date.now();
        timerRef.current = window.setInterval(() => {
          const s = Math.floor((Date.now() - startedAt) / 1000);
          setRecSecs(s);
          if (s >= 38) stopRecording();
        }, 250);
        return;
      } catch {
        recApiStop.current = null;
      }
    }
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
          },
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      streamRef.current = stream;
      const mime = [
        "audio/mp4",
        "audio/aac",
        "audio/x-m4a",
        "video/mp4",
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
      ].find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m));
      let rec: MediaRecorder;
      try {
        rec = mime
          ? new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 128_000 })
          : new MediaRecorder(stream);
      } catch {
        rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      }
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || mime || "audio/webm" });
        if (blob.size < 1200) {
          toast.error("もう少し長めに、はっきり話してください");
          return;
        }
        setBusy(true);
        try {
          const audioBase64 = await blobToBase64(blob);
          const lastTutor = [...useFolio.getState().speakTurns]
            .reverse()
            .find((t) => t.role === "tutor")?.english ?? "";
          const keyterms = lastTutor
            .replace(/[^A-Za-z' ]/g, " ")
            .split(/\s+/)
            .filter((w) => w.length >= 4)
            .slice(0, 14);
          const stt = await transcribeAudio({
            data: {
              audioBase64,
              mime: blob.type || "audio/webm",
              keyterms,
            },
          });
          if (!stt.ok) {
            toast.error(stt.error);
            setBusy(false);
            return;
          }
          setBusy(false);
          await send(stt.text, false, scenario, true);
        } catch {
          toast.error("音声を送れませんでした");
          setBusy(false);
        }
      };
      recRef.current = rec;
      try {
        rec.start(200);
      } catch {
        rec.start();
      }
      setRecording(true);
      setRecSecs(0);
      const startedAt = Date.now();
      timerRef.current = window.setInterval(() => {
        const s = Math.floor((Date.now() - startedAt) / 1000);
        setRecSecs(s);
        if (s >= 38) stopRecording();
      }, 250);
    } catch {
      toast.error("マイクを使えません。文字で話してください");
    }
  }

  function stopRecording() {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (recApiStop.current) {
      const stop = recApiStop.current;
      recApiStop.current = null;
      setRecording(false);
      stop();
      const heard = listenTextRef.current.trim();
      if (heard.length < 2) {
        toast.error("もう少し長めに、はっきり話してください");
        return;
      }
      void send(heard, false, scenario, true);
      return;
    }
    if (recRef.current && recRef.current.state !== "inactive") {
      try {
        recRef.current.requestData();
      } catch {
        /* ignore */
      }
      recRef.current.stop();
    }
    recRef.current = null;
    setRecording(false);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <NativeSelect
        id="folio-history"
        label="会話の履歴"
        value={historyValue}
        onChange={(id) => {
          if (id === "new") newSpeak();
          else if (id !== historyValue) openSession(id);
        }}
        options={historyOptions}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <NativeSelect
          id="folio-drill"
          label="練習"
          value={drill}
          onChange={setDrill}
          options={DRILLS.map((d) => ({ id: d.id, label: `${d.label} · ${d.blurb}` }))}
        />
        <NativeSelect
          id="folio-character"
          label="相手"
          value={characterId}
          onChange={(id) => {
            setCharacterId(id);
            const next = characterById(id);
            setVoiceId(next.voice);
          }}
          options={CHARACTERS.map((c) => ({ id: c.id, label: `${c.label} · ${c.blurb}` }))}
        />
        <NativeSelect
          id="folio-scenario"
          label="テーマ（場面）"
          value={scenario}
          onChange={setScenario}
          options={SCENARIOS.map((s) => ({ id: s.id, label: `${s.label} · ${s.blurb}` }))}
        />
      </div>
      <p className="-mt-1 text-xs leading-relaxed text-muted-foreground">
        テーマは場面。会話は自動で残り、モードを変えても消えません。
      </p>

      <PaperSheet
        margin
        ruled
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto py-4 pr-4 sm:py-6 sm:pr-6">
        {!ready ? (
          <div className="mx-auto flex max-w-lg flex-col gap-3 py-10">
            <p className="text-xs font-medium tracking-wide text-muted-foreground">Conversation</p>
            <p className="text-sm text-muted-foreground">前回の会話を読み込み中…</p>
          </div>
        ) : speakTurns.length === 0 && !busy ? (
          <EmptySpeak onStart={() => void send("start", true)} />
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col gap-5">
            {speakTurns.map((turn) =>
              turn.role === "user" ? (
                <div key={turn.id} className="flex justify-end">
                  <p className="max-w-[85%] bg-memo px-4 py-2.5 text-sm leading-relaxed shadow-[1px_2px_0_color-mix(in_oklab,var(--color-foreground)_12%,transparent)]">
                    {turn.english}
                  </p>
                </div>
              ) : (
                <article key={turn.id} className="max-w-[94%]">
                  {listen && !openIds[turn.id] ? (
                    <div className="flex flex-col gap-3">
                      <p className="font-display text-lg text-foreground">
                        {playingId === turn.id ? "再生中…" : "文字なし · 耳だけ"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {character.label}が話しています。聞き取って答えてください。
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="inline-flex h-11 cursor-pointer touch-manipulation items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
                          onClick={() => void playEnglish(turn.id, turn.english)}
                        >
                          もう一度聞く
                        </button>
                        <button
                          type="button"
                          className="inline-flex h-11 cursor-pointer touch-manipulation items-center rounded-md bg-paper px-4 text-sm font-medium paper-shadow"
                          onClick={() => setOpenIds((m) => ({ ...m, [turn.id]: true }))}
                        >
                          文字を見る
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="mb-1 text-[11px] tracking-wide text-muted-foreground">
                        {character.label}
                      </p>
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-display text-[1.08rem] leading-snug text-foreground">
                          {turn.english}
                        </p>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          aria-label="英語を聞く"
                          className="shrink-0"
                          onClick={() => void playEnglish(turn.id, turn.english)}
                        >
                          <Volume2 className={cn(playingId === turn.id && "text-primary")} />
                        </Button>
                      </div>
                      {listen ? (
                        <button
                          type="button"
                          className="mt-2 text-xs text-muted-foreground"
                          onClick={() => setOpenIds((m) => ({ ...m, [turn.id]: false }))}
                        >
                          文字を隠す
                        </button>
                      ) : null}
                      {turn.notesJa ? (
                        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                          {turn.notesJa}
                        </p>
                      ) : null}
                      {turn.corrections && turn.corrections.length > 0 ? (
                        <ul className="mt-3 space-y-1.5 border-t border-border/70 pt-3 text-xs">
                          {turn.corrections.map((c, i) => (
                            <li key={i} className="leading-relaxed">
                              <span className="text-muted-foreground line-through">{c.original}</span>
                              <span className="mx-1.5 text-muted-foreground">→</span>
                              <span className="font-medium text-foreground">{c.better}</span>
                              {c.why ? (
                                <span className="mt-0.5 block text-muted-foreground">{c.why}</span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {turn.newWords && turn.newWords.length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {turn.newWords.map((w) => (
                            <span
                              key={w.word}
                              className="bg-accent px-2.5 py-1 text-xs text-accent-foreground"
                            >
                              <span className="font-medium">{w.word}</span>
                              <span className="text-muted-foreground"> {w.meaning}</span>
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </>
                  )}
                </article>
              ),
            )}
            {busy ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                ペンを置いて考えています…
              </div>
            ) : null}
          </div>
        )}
        </div>
      </PaperSheet>

      <form
        className="sticky bottom-0 z-30 -mx-4 mt-2 flex flex-col gap-2 bg-background px-4 py-3 sm:-mx-6 sm:px-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (!speakDraft.trim()) {
            toast.error("ひとこと書いて、送信してください");
            return;
          }
          void send(speakDraft);
        }}
      >
        <label className="sr-only" htmlFor="speak-input">
          英語で入力
        </label>
        <input
          id="speak-input"
          type="text"
          enterKeyHint="send"
          autoComplete="off"
          autoCorrect="on"
          autoCapitalize="sentences"
          value={speakDraft}
          disabled={busy || recording || !ready}
          onChange={(e) => setSpeakDraft(e.target.value)}
          onPaste={(e) => {
            const files = imageFilesFromClipboard(e.clipboardData);
            if (!files.length) return;
            e.preventDefault();
            void Promise.all(files.slice(0, 8).map((file) => compressImage(file))).then((urls) => {
              setPendingImages(urls);
              setMode("scan");
            });
          }}
          placeholder={
            recording
              ? "話してください…"
              : listen
                ? t(locale, "speakPhListen")
                : t(locale, "speakPh")
          }
          className="field h-12 px-3.5 text-base leading-relaxed disabled:opacity-50"
        />
        <div className="flex gap-2">
          <button
            type="button"
            disabled={(busy && !recording) || !ready}
            onClick={() => (recording ? stopRecording() : void startRecording())}
            className={cn(
              "inline-flex h-11 shrink-0 cursor-pointer touch-manipulation items-center rounded-md px-4 text-sm font-medium select-none disabled:opacity-45",
              recording
                ? "bg-destructive text-destructive-foreground recording-pulse"
                : "bg-paper text-foreground paper-shadow",
            )}
          >
            {recording ? `停止 ${recSecs}s` : "録音"}
          </button>
          <button
            type="submit"
            disabled={busy || recording || !ready}
            className="h-11 min-w-0 flex-1 cursor-pointer touch-manipulation rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground select-none disabled:opacity-45"
          >
            {busy ? "送信中…" : "送信"}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          送信が反応しないときは、入力欄にフォーカスしたままキーボードの送信を押してください。画像はこの欄に貼れます。
        </p>
      </form>

      {speakTurns.length > 0 ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            newSpeak();
          }}
        >
          <button
            type="submit"
            className="ml-auto flex h-11 cursor-pointer touch-manipulation items-center rounded-md px-3 text-sm text-muted-foreground"
          >
            新しい会話にする
          </button>
        </form>
      ) : null}
    </div>
  );
}

function EmptySpeak({ onStart }: { onStart: () => void }) {
  const scenario = useFolio((s) => s.scenario);
  const drill = useFolio((s) => s.drill);
  const characterId = useFolio((s) => s.characterId);
  const meta = SCENARIOS.find((s) => s.id === scenario);
  const character = characterById(characterId);
  const listen = drill === "listen";
  return (
    <div className="mx-auto flex max-w-lg flex-col items-start gap-5 py-6 sm:py-10">
      <h2 className="font-display text-3xl leading-tight text-foreground sm:text-4xl">
        {listen ? "文字は、出さない。" : "英語で、ひとこと。"}
      </h2>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {listen
          ? `相手は${character.label}。上のテーマ（${meta?.label ?? "日常"}）で、少し高めの英語を耳だけで追います。`
          : `上のテーマは「${meta?.label ?? "日常"} · ${meta?.blurb ?? ""}」。${character.label}がその場面で話します。`}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onStart();
        }}
      >
        <button
          type="submit"
          className="inline-flex h-12 cursor-pointer touch-manipulation items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground"
        >
          このテーマで始める
        </button>
      </form>
    </div>
  );
}
