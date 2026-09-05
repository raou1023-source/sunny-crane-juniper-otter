import { speakEnglish } from "@/lib/ai";
import { VOICES, type VoiceId } from "@/lib/formats";
import { playDataAudio } from "@/lib/media";

type StudioVoice = (typeof VOICES)[number];
type VoiceStat = { ok: number; fail: number };
type VoiceStats = Record<string, VoiceStat>;

const STATS_KEY = "folio-voice-stats";

const HINTS: Record<VoiceId, { prefer: string[]; gender: "f" | "m" }> = {
  eve: { prefer: ["samantha", "nicky", "siri", "google us english", "microsoft aria", "jenny", "aria online"], gender: "f" },
  luna: { prefer: ["karen", "moira", "fiona", "tessa", "google uk english female", "libby", "sonia"], gender: "f" },
  orion: { prefer: ["daniel", "reed", "google uk english male", "george", "ryan", "microsoft guy"], gender: "m" },
  liora: { prefer: ["samantha", "karen", "nicky", "zira", "google us english", "jenny"], gender: "f" },
  atlas: { prefer: ["alex", "fred", "aaron", "david", "google us english", "mark", "microsoft david"], gender: "m" },
  helix: { prefer: ["daniel", "reed", "google uk english", "tom", "rishi", "arthur"], gender: "m" },
};

const PREMIUM = /neural|premium|enhanced|natural|wavenet|studio|online \(natural\)|multilingual/i;
const WEAK = /compact|eloquence|espeak|robot|whisper|zarvox|trinoids|boing|bells|bubbles|cellos|bad news|junior|kathy|princess|ralph|albert|zarvox|pipe organ/i;

let currentUtter: SpeechSynthesisUtterance | null = null;
let currentAudio: HTMLAudioElement | null = null;
let speaking = false;

export function sanitizeSpeakText(text: string) {
  return text
    .replace(/[<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 800);
}

export function cancelSpeak() {
  speaking = false;
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* ignore */
  }
  currentUtter = null;
  currentAudio?.pause();
  currentAudio = null;
}

export function unlockSpeak() {
  const syn = window.speechSynthesis;
  if (!syn) return;
  try {
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    syn.speak(u);
    syn.cancel();
  } catch {
    /* ignore */
  }
}

function loadStats(): VoiceStats {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as VoiceStats;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveStats(stats: VoiceStats) {
  try {
    const keys = Object.keys(stats);
    if (keys.length > 40) {
      keys
        .sort((a, b) => (stats[a].ok - stats[a].fail) - (stats[b].ok - stats[b].fail))
        .slice(0, keys.length - 40)
        .forEach((k) => delete stats[k]);
    }
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch {
    /* ignore */
  }
}

function remember(uri: string, ok: boolean) {
  const stats = loadStats();
  const cur = stats[uri] ?? { ok: 0, fail: 0 };
  if (ok) cur.ok += 1;
  else cur.fail += 1;
  stats[uri] = cur;
  saveStats(stats);
}

function waitVoices(): Promise<SpeechSynthesisVoice[]> {
  const syn = window.speechSynthesis;
  if (!syn) return Promise.resolve([]);
  const have = syn.getVoices();
  if (have.length) return Promise.resolve(have);
  return new Promise((resolve) => {
    const done = () => resolve(syn.getVoices());
    syn.addEventListener("voiceschanged", done, { once: true });
    window.setTimeout(done, 1800);
  });
}

function genderHint(name: string): "f" | "m" | "?" {
  const n = name.toLowerCase();
  if (/\b(female|woman|girl|samantha|karen|moira|zira|aria|jenny|libby|sonia|fiona|veena|tessa|nicky|siri)\b/.test(n)) {
    return "f";
  }
  if (/\b(male|man|daniel|david|george|alex|fred|aaron|reed|mark|ryan|rishi|arthur|guy|tom)\b/.test(n)) return "m";
  return "?";
}

function scoreVoice(v: SpeechSynthesisVoice, profile: StudioVoice, stats: VoiceStats) {
  const name = v.name;
  const lang = v.lang.toLowerCase();
  const hints = HINTS[profile.id];
  let s = 0;
  if (lang.startsWith(profile.lang.toLowerCase())) s += 42;
  else if (lang.startsWith("en")) s += 18;
  else return -200;
  if (PREMIUM.test(name)) s += 28;
  if (WEAK.test(name)) s -= 60;
  if (v.default) s += 4;
  if (hints) {
    const low = name.toLowerCase();
    for (const p of hints.prefer) {
      if (low.includes(p)) s += 26;
    }
    const g = genderHint(name);
    if (g === hints.gender) s += 10;
    else if (g !== "?") s -= 6;
  }
  const st = stats[v.voiceURI];
  if (st) s += st.ok * 5 - st.fail * 14;
  return s;
}

function rankVoices(profile: StudioVoice, voices: SpeechSynthesisVoice[]) {
  const stats = loadStats();
  return voices
    .map((v) => ({ v, s: scoreVoice(v, profile, stats) }))
    .filter((x) => x.s > -50)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.v);
}

function profileById(id: string): StudioVoice {
  return VOICES.find((v) => v.id === id) ?? VOICES[0];
}

function chunksOf(text: string) {
  const parts = text
    .split(/(?<=[.!?])\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const out: string[] = [];
  let buf = "";
  for (const p of parts) {
    if ((buf + " " + p).trim().length > 180) {
      if (buf) out.push(buf);
      buf = p;
    } else {
      buf = buf ? `${buf} ${p}` : p;
    }
  }
  if (buf) out.push(buf);
  return out.length ? out : [text];
}

function speakOne(
  syn: SpeechSynthesis,
  text: string,
  voice: SpeechSynthesisVoice | null,
  rate: number,
  pitch: number,
  lang: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = voice?.lang || lang;
    utter.rate = rate;
    utter.pitch = pitch;
    utter.volume = 1;
    if (voice) utter.voice = voice;
    currentUtter = utter;
    try {
      if (syn.paused) syn.resume();
    } catch {
      /* ignore */
    }
    const failTimer = window.setTimeout(() => {
      reject(new Error("timeout"));
    }, Math.max(12000, text.length * 110));
    utter.onend = () => {
      window.clearTimeout(failTimer);
      if (currentUtter === utter) currentUtter = null;
      resolve();
    };
    utter.onerror = () => {
      window.clearTimeout(failTimer);
      if (currentUtter === utter) currentUtter = null;
      reject(new Error("utter-error"));
    };
    syn.speak(utter);
  });
}

export async function speakLocal(text: string, voiceId: string, speed: number): Promise<void> {
  const syn = window.speechSynthesis;
  if (!syn) throw new Error("この端末では読み上げできません");
  const clean = sanitizeSpeakText(text);
  if (!clean) return;
  cancelSpeak();
  speaking = true;
  const voices = await waitVoices();
  const profile = profileById(voiceId);
  const ranked = rankVoices(profile, voices);
  const rate = Math.min(1.08, Math.max(0.72, speed * profile.rate));
  const pieces = chunksOf(clean);
  let chosen = ranked[0] ?? null;
  try {
    for (const piece of pieces) {
      if (!speaking) return;
      let lastErr: Error | null = null;
      const tries = chosen ? [chosen, ...ranked.filter((v) => v.voiceURI !== chosen?.voiceURI).slice(0, 2)] : ranked.slice(0, 3);
      let ok = false;
      for (const voice of tries.length ? tries : [null]) {
        if (!speaking) return;
        try {
          await speakOne(syn, piece, voice, rate, profile.pitch, profile.lang);
          if (voice) {
            remember(voice.voiceURI, true);
            chosen = voice;
          }
          ok = true;
          break;
        } catch (err) {
          lastErr = err instanceof Error ? err : new Error("fail");
          if (voice && speaking) remember(voice.voiceURI, false);
        }
      }
      if (!ok) throw lastErr ?? new Error("読み上げに失敗しました");
    }
  } finally {
    speaking = false;
  }
}

export async function speakText(opts: {
  text: string;
  voiceId: string;
  speed: number;
  engine: "local" | "grok";
}): Promise<void> {
  const clean = sanitizeSpeakText(opts.text);
  if (!clean) return;
  if (opts.engine !== "grok") {
    await speakLocal(clean, opts.voiceId, opts.speed);
    return;
  }
  try {
    const res = await speakEnglish({
      data: {
        text: clean,
        voiceId: profileById(opts.voiceId).grok,
        speed: opts.speed,
      },
    });
    if (!res.ok) throw new Error(res.error);
    cancelSpeak();
    const el = playDataAudio(res.audio, res.mime);
    currentAudio = el;
    await new Promise<void>((resolve, reject) => {
      el.onended = () => resolve();
      el.onerror = () => reject(new Error("音声を再生できませんでした"));
    });
  } catch {
    await speakLocal(clean, opts.voiceId, opts.speed);
  }
}

type RecResult = { isFinal: boolean; 0?: { transcript?: string } };
type RecEvent = { resultIndex: number; results: ArrayLike<RecResult> };
type RecLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((ev: RecEvent) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type RecCtor = new () => RecLike;

export function getSpeechRecognition(): RecCtor | null {
  const w = window as Window & {
    SpeechRecognition?: RecCtor;
    webkitSpeechRecognition?: RecCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function startBrowserListen(onText: (text: string) => void): () => void {
  const Ctor = getSpeechRecognition();
  if (!Ctor) throw new Error("no-recognition");
  const rec = new Ctor();
  rec.lang = "en-US";
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 3;
  let finalText = "";
  rec.onresult = (ev) => {
    let interim = "";
    for (let i = ev.resultIndex; i < ev.results.length; i += 1) {
      const piece = ev.results[i]?.[0]?.transcript ?? "";
      if (ev.results[i]?.isFinal) finalText = `${finalText} ${piece}`.trim();
      else interim += piece;
    }
    onText((finalText || interim).trim());
  };
  rec.start();
  return () => {
    try {
      rec.stop();
    } catch {
      rec.abort();
    }
    if (finalText) onText(finalText);
  };
}
