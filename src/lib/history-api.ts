import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { CHARACTERS, type CharacterId, type DrillId } from "@/lib/characters";
import { getSql } from "@/lib/db";
import { SCENARIOS, type ScenarioId } from "@/lib/formats";
import type { SpeakSession, SpeakTurn } from "@/lib/store";

const SCENARIO_IDS = new Set(SCENARIOS.map((s) => s.id));
const CHARACTER_IDS = new Set(CHARACTERS.map((c) => c.id));
const DRILLS = new Set(["talk", "listen"]);

function clip(s: unknown, max: number) {
  return String(s ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .slice(0, max);
}

function clipId(s: unknown) {
  return String(s ?? "")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 80);
}

function asTurn(raw: unknown): SpeakTurn | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const role = o.role === "user" || o.role === "tutor" ? o.role : null;
  const english = clip(o.english, 4000);
  if (!role || !english) return null;
  const createdAt = typeof o.createdAt === "number" && Number.isFinite(o.createdAt) ? o.createdAt : Date.now();
  return {
    id: clipId(o.id) || `${createdAt}`,
    role,
    english,
    notesJa: o.notesJa ? clip(o.notesJa, 2000) : undefined,
    corrections: Array.isArray(o.corrections)
      ? o.corrections
          .slice(0, 8)
          .map((c) => {
            if (!c || typeof c !== "object") return null;
            const x = c as Record<string, unknown>;
            return {
              original: clip(x.original, 400),
              better: clip(x.better, 400),
              why: clip(x.why, 400),
            };
          })
          .filter((x): x is { original: string; better: string; why: string } => Boolean(x))
      : undefined,
    newWords: Array.isArray(o.newWords)
      ? o.newWords
          .slice(0, 12)
          .map((w) => {
            if (!w || typeof w !== "object") return null;
            const x = w as Record<string, unknown>;
            const word = clip(x.word, 80);
            if (!word) return null;
            return { word, meaning: clip(x.meaning, 120) };
          })
          .filter((x): x is { word: string; meaning: string } => Boolean(x))
      : undefined,
    createdAt,
  };
}

function asSession(raw: unknown): SpeakSession | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = clipId(o.id);
  if (!id) return null;
  const scenario = SCENARIO_IDS.has(o.scenario as ScenarioId) ? (o.scenario as ScenarioId) : "daily";
  const characterId = CHARACTER_IDS.has(o.characterId as CharacterId)
    ? (o.characterId as CharacterId)
    : "tutor";
  const drill = DRILLS.has(String(o.drill)) ? (o.drill as DrillId) : "talk";
  const turns = (Array.isArray(o.turns) ? o.turns : []).map(asTurn).filter((t): t is SpeakTurn => Boolean(t)).slice(-40);
  const updatedAt =
    typeof o.updatedAt === "number" && Number.isFinite(o.updatedAt) ? o.updatedAt : Date.now();
  return {
    id,
    title: clip(o.title, 120) || "会話",
    scenario,
    characterId,
    drill,
    turns,
    updatedAt,
  };
}

function parseTurns(raw: unknown): SpeakTurn[] {
  if (typeof raw === "string") {
    try {
      return parseTurns(JSON.parse(raw));
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw.map(asTurn).filter((t): t is SpeakTurn => Boolean(t)).slice(-40);
}

export const listCloudSessions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      title: string;
      scenario: string;
      character_id: string;
      drill: string;
      turns: unknown;
      updated_at: string;
    }>`
      select id, title, scenario, character_id, drill, turns, updated_at
      from speak_sessions
      where user_id = ${context.userId}
      order by updated_at desc
      limit 16
    `;
    return rows
      .map((row) =>
        asSession({
          id: row.id,
          title: row.title,
          scenario: row.scenario,
          characterId: row.character_id,
          drill: row.drill,
          turns: parseTurns(row.turns),
          updatedAt: Date.parse(row.updated_at) || Date.now(),
        }),
      )
      .filter((s): s is SpeakSession => Boolean(s));
  });

export const pushCloudSessions = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { sessions: unknown }) => {
    const list = Array.isArray(input?.sessions) ? input.sessions : [];
    return list.map(asSession).filter((s): s is SpeakSession => Boolean(s)).slice(0, 16);
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    for (const sess of data) {
      const payload = JSON.stringify(sess.turns);
      if (payload.length > 180_000) continue;
      await sql.query(
        `insert into speak_sessions (id, user_id, title, scenario, character_id, drill, turns, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7::jsonb, to_timestamp($8))
         on conflict (user_id, id) do update set
           title = excluded.title,
           scenario = excluded.scenario,
           character_id = excluded.character_id,
           drill = excluded.drill,
           turns = excluded.turns,
           updated_at = excluded.updated_at
         where speak_sessions.user_id = $2`,
        [
          sess.id,
          context.userId,
          sess.title,
          sess.scenario,
          sess.characterId,
          sess.drill,
          payload,
          Math.floor(sess.updatedAt / 1000),
        ],
      );
    }
    return { ok: true as const };
  });
