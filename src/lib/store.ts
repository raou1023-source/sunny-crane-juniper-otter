import { create } from "zustand";
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware";
import { parseCards, type AnkiCard } from "@/lib/anki";
import { characterById, type CharacterId, type DrillId } from "@/lib/characters";
import {
  type FormatId,
  type Level,
  type ScenarioId,
  SCENARIOS,
} from "@/lib/formats";
import { isLocale, type Locale } from "@/lib/i18n";
import { onlySafeImageUrls } from "@/lib/safe-image";
import { uid } from "@/lib/utils";

export type Mode = "speak" | "scan" | "format";

export type Correction = { original: string; better: string; why: string };
export type VocabItem = { word: string; meaning: string };

export type SpeakTurn = {
  id: string;
  role: "user" | "tutor";
  english: string;
  notesJa?: string;
  corrections?: Correction[];
  newWords?: VocabItem[];
  createdAt: number;
};

export type ScanRecord = {
  id: string;
  extracted: string;
  translationJa: string;
  formatted: string;
  notesJa: string;
  formatId: FormatId;
  cards: AnkiCard[];
  createdAt: number;
};

export type FormatRecord = {
  id: string;
  source: string;
  output: string;
  notesJa: string;
  formatId: FormatId;
  cards: AnkiCard[];
  createdAt: number;
};

export type SpeakSession = {
  id: string;
  title: string;
  scenario: ScenarioId;
  characterId: CharacterId;
  drill: DrillId;
  turns: SpeakTurn[];
  updatedAt: number;
};

type FolioState = {
  ready: boolean;
  mode: Mode;
  level: Level;
  scenario: ScenarioId;
  voiceId: string;
  ttsEngine: "local" | "grok";
  autoPlay: boolean;
  ttsSpeed: number;
  formatId: FormatId;
  customFormat: string;
  characterId: CharacterId;
  drill: DrillId;
  sessionId: string;
  sessions: SpeakSession[];
  speakTurns: SpeakTurn[];
  lastScan: ScanRecord | null;
  lastFormat: FormatRecord | null;
  pendingImages: string[];
  scanPreviews: string[];
  scanBusy: boolean;
  scanProgress: { done: number; total: number } | null;
  speakDraft: string;
  formatDraft: string;
  locale: Locale;
  setReady: (ready: boolean) => void;
  setMode: (mode: Mode) => void;
  setLevel: (level: Level) => void;
  setScenario: (scenario: ScenarioId) => void;
  setVoiceId: (voiceId: string) => void;
  setTtsEngine: (engine: "local" | "grok") => void;
  setAutoPlay: (autoPlay: boolean) => void;
  setTtsSpeed: (ttsSpeed: number) => void;
  setFormatId: (formatId: FormatId) => void;
  setCustomFormat: (customFormat: string) => void;
  setCharacterId: (characterId: CharacterId) => void;
  setDrill: (drill: DrillId) => void;
  setPendingImages: (dataUrls: string[]) => void;
  setScanPreviews: (dataUrls: string[]) => void;
  setScanJob: (job: { busy: boolean; progress: { done: number; total: number } | null }) => void;
  setSpeakDraft: (text: string) => void;
  setFormatDraft: (text: string) => void;
  setLocale: (locale: Locale) => void;
  addSpeakTurn: (turn: Omit<SpeakTurn, "id" | "createdAt">) => SpeakTurn;
  openSession: (id: string) => void;
  newSpeak: () => void;
  clearSpeak: () => void;
  mergeRemoteSessions: (remote: SpeakSession[]) => void;
  setLastScan: (record: Omit<ScanRecord, "id" | "createdAt">) => void;
  setLastFormat: (record: Omit<FormatRecord, "id" | "createdAt">) => void;
};

const persistGate = { open: false };

const folioStorage: StateStorage = {
  getItem: (name) => {
    try {
      if (typeof localStorage === "undefined") return null;
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    if (!persistGate.open) return;
    try {
      localStorage.setItem(name, value);
    } catch {
      /* quota / private mode */
    }
  },
  removeItem: (name) => {
    try {
      if (typeof localStorage === "undefined") return;
      localStorage.removeItem(name);
    } catch {
      /* ignore */
    }
  },
};

function sessionTitle(turns: SpeakTurn[], scenario: ScenarioId, characterId: CharacterId) {
  const scene = SCENARIOS.find((s) => s.id === scenario)?.label ?? "会話";
  const who = characterById(characterId).label;
  const line =
    turns.find((t) => t.role === "tutor")?.english ||
    turns.find((t) => t.role === "user")?.english ||
    "";
  const snippet = line.replace(/\s+/g, " ").slice(0, 22);
  return snippet ? `${scene} · ${snippet}` : `${scene} · ${who}`;
}

function upsertSession(
  sessions: SpeakSession[],
  next: SpeakSession,
): SpeakSession[] {
  return [next, ...sessions.filter((s) => s.id !== next.id)].slice(0, 16);
}

function asSessions(v: unknown): SpeakSession[] {
  if (!Array.isArray(v)) return [];
  return v.filter((s) => s && typeof s === "object" && typeof (s as SpeakSession).id === "string");
}

function asTurns(v: unknown): SpeakTurn[] {
  if (!Array.isArray(v)) return [];
  return v.filter((t) => t && typeof t === "object" && typeof (t as SpeakTurn).english === "string");
}

function mergeTurns(a: SpeakTurn[], b: SpeakTurn[]) {
  const map = new Map<string, SpeakTurn>();
  for (const t of a) map.set(t.id, t);
  for (const t of b) map.set(t.id, t);
  return [...map.values()].sort((x, y) => x.createdAt - y.createdAt).slice(-60);
}

function snapshotSession(s: {
  sessionId: string;
  speakTurns: SpeakTurn[];
  sessions: SpeakSession[];
  scenario: ScenarioId;
  characterId: CharacterId;
  drill: DrillId;
}): SpeakSession[] {
  if (s.speakTurns.length === 0) return s.sessions;
  return upsertSession(s.sessions, {
    id: s.sessionId,
    title: sessionTitle(s.speakTurns, s.scenario, s.characterId),
    scenario: s.scenario,
    characterId: s.characterId,
    drill: s.drill,
    turns: s.speakTurns.slice(-40),
    updatedAt: Date.now(),
  });
}

export const useFolio = create<FolioState>()(
  persist(
    (set) => ({
      ready: false,
      mode: "speak",
      level: "A2",
      scenario: "daily",
      voiceId: "device",
      ttsEngine: "local",
      autoPlay: true,
      ttsSpeed: 0.9,
      formatId: "anki",
      customFormat: "",
      characterId: "tutor",
      drill: "talk",
      sessionId: "",
      sessions: [],
      speakTurns: [],
      lastScan: null,
      lastFormat: null,
      pendingImages: [],
      scanPreviews: [],
      scanBusy: false,
      scanProgress: null,
      speakDraft: "",
      formatDraft: "",
      locale: "ja",
      setReady: (ready) => set({ ready }),
      setMode: (mode) => set({ mode }),
      setLevel: (level) => set({ level }),
      setScenario: (scenario) => set({ scenario }),
      setVoiceId: (voiceId) =>
        set({ voiceId, ttsEngine: voiceId === "device" ? "local" : "grok" }),
      setTtsEngine: (ttsEngine) => set({ ttsEngine }),
      setAutoPlay: (autoPlay) => set({ autoPlay }),
      setTtsSpeed: (ttsSpeed) => set({ ttsSpeed }),
      setFormatId: (formatId) => set({ formatId }),
      setCustomFormat: (customFormat) => set({ customFormat }),
      setCharacterId: (characterId) => set({ characterId }),
      setDrill: (drill) => set({ drill }),
      setPendingImages: (pendingImages) => set({ pendingImages: onlySafeImageUrls(pendingImages) }),
      setScanPreviews: (scanPreviews) => set({ scanPreviews: onlySafeImageUrls(scanPreviews) }),
      setScanJob: (job) => set({ scanBusy: job.busy, scanProgress: job.progress }),
      setSpeakDraft: (speakDraft) => set({ speakDraft: speakDraft.slice(0, 4000) }),
      setFormatDraft: (formatDraft) => set({ formatDraft: formatDraft.slice(0, 8000) }),
      setLocale: (locale) => set({ locale }),
      addSpeakTurn: (turn) => {
        const full: SpeakTurn = { ...turn, id: uid(), createdAt: Date.now() };
        set((s) => {
          const sessionId = s.sessionId || uid();
          const speakTurns = [...s.speakTurns, full].slice(-60);
          return {
            sessionId,
            speakTurns,
            sessions: snapshotSession({ ...s, sessionId, speakTurns }),
          };
        });
        return full;
      },
      openSession: (id) =>
        set((s) => {
          if (id === "new") {
            return {
              sessions: snapshotSession(s),
              speakTurns: [],
              sessionId: uid(),
            };
          }
          const found = s.sessions.find((x) => x.id === id);
          if (!found) return s;
          const sessions = snapshotSession(s);
          return {
            sessionId: found.id,
            speakTurns: found.turns,
            scenario: found.scenario,
            characterId: found.characterId,
            drill: found.drill,
            sessions,
          };
        }),
      newSpeak: () =>
        set((s) => ({
          sessions: snapshotSession(s),
          speakTurns: [],
          sessionId: uid(),
        })),
      clearSpeak: () =>
        set((s) => ({
          sessions: snapshotSession(s),
          speakTurns: [],
          sessionId: uid(),
        })),
      mergeRemoteSessions: (remote) =>
        set((s) => {
          const map = new Map<string, SpeakSession>();
          for (const sess of s.sessions) map.set(sess.id, sess);
          for (const sess of remote) {
            const local = map.get(sess.id);
            if (!local || sess.updatedAt >= local.updatedAt) map.set(sess.id, sess);
          }
          if (s.speakTurns.length && s.sessionId) {
            map.set(s.sessionId, {
              id: s.sessionId,
              title: sessionTitle(s.speakTurns, s.scenario, s.characterId),
              scenario: s.scenario,
              characterId: s.characterId,
              drill: s.drill,
              turns: s.speakTurns.slice(-40),
              updatedAt: Date.now(),
            });
          }
          const sessions = [...map.values()]
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .slice(0, 16);
          return { sessions };
        }),
      setLastScan: (record) =>
        set({ lastScan: { ...record, cards: record.cards ?? [], id: uid(), createdAt: Date.now() } }),
      setLastFormat: (record) =>
        set({
          lastFormat: { ...record, cards: record.cards ?? [], id: uid(), createdAt: Date.now() },
        }),
    }),
    {
      name: "folio-en",
      version: 11,
      skipHydration: true,
      storage: createJSONStorage(() => folioStorage),
      partialize: (s) => ({
        level: s.level,
        scenario: s.scenario,
        voiceId: s.voiceId,
        ttsEngine: s.ttsEngine,
        autoPlay: s.autoPlay,
        ttsSpeed: s.ttsSpeed,
        formatId: s.formatId,
        customFormat: s.customFormat,
        characterId: s.characterId,
        drill: s.drill,
        sessionId: s.sessionId,
        sessions: s.sessions.slice(0, 16).map((sess) => ({
          ...sess,
          turns: sess.turns.slice(-40),
        })),
        speakTurns: s.speakTurns.slice(-40),
        speakDraft: s.speakDraft.slice(0, 4000),
        formatDraft: s.formatDraft.slice(0, 8000),
        locale: s.locale,
        lastScan: s.lastScan
          ? {
              ...s.lastScan,
              extracted: s.lastScan.extracted.slice(0, 12000),
              translationJa: s.lastScan.translationJa.slice(0, 12000),
              formatted: s.lastScan.formatted.slice(0, 16000),
              notesJa: s.lastScan.notesJa.slice(0, 4000),
              cards: (s.lastScan.cards ?? []).slice(0, 64),
            }
          : null,
        lastFormat: s.lastFormat
          ? {
              ...s.lastFormat,
              source: s.lastFormat.source.slice(0, 8000),
              output: s.lastFormat.output.slice(0, 16000),
              notesJa: s.lastFormat.notesJa.slice(0, 4000),
              cards: (s.lastFormat.cards ?? []).slice(0, 64),
            }
          : null,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<FolioState>;
        const fromDisk = asTurns(p.speakTurns);
        const fromMem = current.speakTurns ?? [];
        const sessions = asSessions(p.sessions);
        return {
          ...current,
          ...p,
          speakTurns: mergeTurns(fromDisk, fromMem),
          sessions,
          sessionId: typeof p.sessionId === "string" && p.sessionId ? p.sessionId : current.sessionId,
          ready: current.ready,
          mode: current.mode,
          pendingImages: current.pendingImages,
          scanPreviews: current.scanPreviews,
          scanBusy: current.scanBusy,
          scanProgress: current.scanProgress,
        };
      },
      migrate: (persisted) => {
        if (!persisted || typeof persisted !== "object") return persisted as FolioState;
        const next = { ...(persisted as Record<string, unknown>) };
        delete next.mode;
        delete next.pendingImage;
        delete next.pendingImages;
        delete next.ready;
        if (next.formatId === "vocab") next.formatId = "anki";
        if (!next.characterId) next.characterId = "tutor";
        if (!next.drill) next.drill = "talk";
        if (!Array.isArray(next.sessions)) next.sessions = [];
        if (typeof next.sessionId !== "string") next.sessionId = "";
        if (typeof next.speakDraft !== "string") next.speakDraft = "";
        if (typeof next.formatDraft !== "string") next.formatDraft = "";
        if (!isLocale(next.locale)) next.locale = "ja";
        if (next.ttsEngine !== "grok") next.ttsEngine = "local";
        const paperVoice: Record<string, string> = {
          sumi: "eve",
          shu: "luna",
          sugi: "orion",
          ai: "liora",
          koji: "atlas",
          suzuri: "helix",
        };
        if (typeof next.voiceId === "string" && paperVoice[next.voiceId]) {
          next.voiceId = paperVoice[next.voiceId];
        }
        const grokVoices = new Set(["eve", "luna", "orion", "liora", "atlas", "helix"]);
        if (next.ttsEngine === "local" || next.voiceId === "device") {
          next.voiceId = "device";
          next.ttsEngine = "local";
        } else if (typeof next.voiceId !== "string" || !grokVoices.has(next.voiceId)) {
          next.voiceId = "eve";
          next.ttsEngine = "grok";
        } else {
          next.ttsEngine = "grok";
        }
        if (next.lastScan && typeof next.lastScan === "object") {
          const scan = next.lastScan as Record<string, unknown>;
          scan.cards = parseCards(scan.cards);
        }
        if (next.lastFormat && typeof next.lastFormat === "object") {
          const rec = next.lastFormat as Record<string, unknown>;
          rec.cards = parseCards(rec.cards);
        }
        const turns = asTurns(next.speakTurns);
        if (turns.length && !(next.sessions as SpeakSession[]).length) {
          const sid = uid();
          next.sessionId = sid;
          next.sessions = [
            {
              id: sid,
              title: sessionTitle(
                turns,
                (next.scenario as ScenarioId) ?? "daily",
                (next.characterId as CharacterId) ?? "tutor",
              ),
              scenario: (next.scenario as ScenarioId) ?? "daily",
              characterId: (next.characterId as CharacterId) ?? "tutor",
              drill: (next.drill as DrillId) ?? "talk",
              turns,
              updatedAt: Date.now(),
            },
          ];
        }
        return next as FolioState;
      },
      onRehydrateStorage: () => {
        return () => {
          persistGate.open = true;
        };
      },
    },
  ),
);

export function rehydrateFolio() {
  const done = () => {
    persistGate.open = true;
    useFolio.setState({ ready: true });
  };
  if (useFolio.persist.hasHydrated()) {
    done();
    return;
  }
  const unsub = useFolio.persist.onFinishHydration(() => {
    done();
    unsub();
  });
  void Promise.resolve(useFolio.persist.rehydrate()).finally(() => {
    window.setTimeout(done, 0);
  });
}
