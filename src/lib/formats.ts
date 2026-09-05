export const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type Level = (typeof LEVELS)[number];

export const LEVEL_BAND: Record<Level, string> = {
  A1: "超基礎",
  A2: "初級",
  B1: "中級",
  B2: "中上級",
  C1: "上級",
  C2: "熟達",
};

export const LEVEL_HINT: Record<Level, string> = {
  A1: "単語と短い文",
  A2: "日常の簡単表現",
  B1: "自分の意見が言える",
  B2: "自然な会話",
  C1: "精確で豊かな英語",
  C2: "ネイティブに近い",
};

export function levelOptionLabel(level: Level, compact = false) {
  const band = LEVEL_BAND[level];
  const hint = LEVEL_HINT[level];
  return compact ? `${level} · ${band}` : `${level} · ${band} · ${hint}`;
}

export const SCENARIOS = [
  { id: "daily", label: "日常", blurb: "週末や趣味の雑談", prompt: "casual daily conversation about everyday life" },
  { id: "travel", label: "旅行", blurb: "空港・ホテル・街", prompt: "travel: airport, hotel, asking for directions, restaurants" },
  { id: "work", label: "仕事", blurb: "会議とメール", prompt: "workplace small talk, meetings, and polite office English" },
  { id: "interview", label: "面接", blurb: "自己紹介と質問", prompt: "job interview practice with follow-up questions" },
  { id: "cafe", label: "カフェ", blurb: "注文と世間話", prompt: "ordering at a cafe and light chat with a barista" },
  { id: "free", label: "自由", blurb: "好きな話題で", prompt: "free conversation; follow the learner's topic" },
] as const;

export type ScenarioId = (typeof SCENARIOS)[number]["id"];

export const VOICES = [
  { id: "eve", label: "Eve", blurb: "標準・明瞭", grok: "eve", pitch: 1.02, rate: 0.94, lang: "en-US" },
  { id: "luna", label: "Luna", blurb: "柔らかめ", grok: "luna", pitch: 1.08, rate: 0.92, lang: "en-GB" },
  { id: "orion", label: "Orion", blurb: "落ち着いた低め", grok: "orion", pitch: 0.8, rate: 0.88, lang: "en-GB" },
  { id: "liora", label: "Liora", blurb: "明るめ", grok: "liora", pitch: 1.14, rate: 1.0, lang: "en-US" },
  { id: "atlas", label: "Atlas", blurb: "しっかりめ", grok: "atlas", pitch: 0.84, rate: 0.9, lang: "en-US" },
  { id: "helix", label: "Helix", blurb: "クリア", grok: "helix", pitch: 0.96, rate: 0.94, lang: "en-GB" },
] as const;

export type VoiceId = (typeof VOICES)[number]["id"];

export type FormatId =
  | "anki"
  | "vocab"
  | "cloze"
  | "quiz"
  | "translate-ja"
  | "translate-en"
  | "grammar"
  | "summary"
  | "dialogue"
  | "cefr"
  | "shadow"
  | "custom";

export type FormatPreset = {
  id: FormatId;
  label: string;
  blurb: string;
  instruction: string;
};

export const FORMATS: FormatPreset[] = [
  {
    id: "anki",
    label: "AnkiDroid",
    blurb: "単語／フレーズ・意味・Core Concept（英＋日）・例文5（英＋日）",
    instruction:
      "Create 8 AnkiDroid cards when the source has enough items (do not stop at 5). Each card MUST include: front, meaning in the learner's language, Core Concept in English AND the learner's language (core_ja), a usage note for phrases, and EXACTLY 5 examples each with English (target in **bold**) AND a translation. Never output English-only examples.",
  },
  {
    id: "vocab",
    label: "単語帳",
    blurb: "語・品詞・意味・例文",
    instruction:
      "Extract 8–12 useful words/phrases. For each: word, part of speech, SUPPORT_LANG meaning, one CEFR-appropriate example sentence, and a short note on collocation if useful. Markdown table.",
  },
  {
    id: "cloze",
    label: "穴埋め",
    blurb: "空所補充 5問",
    instruction:
      "Make 5 cloze (fill-in-the-blank) questions from the text. Show the gapped sentence, 4 options (A–D), then an answer key with a one-line SUPPORT_LANG explanation.",
  },
  {
    id: "quiz",
    label: "4択クイズ",
    blurb: "内容理解と語彙",
    instruction:
      "Make 4 multiple-choice questions (comprehension + vocabulary). Each has 4 options and a SUPPORT_LANG explanation of the correct answer.",
  },
  {
    id: "translate-ja",
    label: "和訳",
    blurb: "自然な訳",
    instruction:
      "Give a natural SUPPORT_LANG translation, then 3 notes on tricky phrases (English → SUPPORT_LANG) with why that rendering was chosen.",
  },
  {
    id: "translate-en",
    label: "英訳",
    blurb: "自然な英語へ",
    instruction:
      "If the input is not English, translate it into natural English at the learner's CEFR level. Provide a polished version and a slightly simpler version. If the input is already English, rewrite it more naturally and explain changes in SUPPORT_LANG.",
  },
  {
    id: "grammar",
    label: "文法解説",
    blurb: "構造と使い方",
    instruction:
      "Explain the key grammar in SUPPORT_LANG, with diagrams of sentence structure where helpful, 3 additional example sentences, and common mistakes learners who use SUPPORT_LANG make.",
  },
  {
    id: "summary",
    label: "要約",
    blurb: "3文＋キーワード",
    instruction:
      "Summarize in 3 English sentences at the learner's level, then a 1-sentence SUPPORT_LANG summary, then 5 keywords with SUPPORT_LANG glosses.",
  },
  {
    id: "dialogue",
    label: "対話化",
    blurb: "2人の短い会話",
    instruction:
      "Rewrite the content as a short 8–12 line dialogue between two people. Keep it speakable. After the dialogue, list 4 useful phrases with SUPPORT_LANG meanings.",
  },
  {
    id: "cefr",
    label: "レベル変換",
    blurb: "指定CEFRに書き換え",
    instruction:
      "Rewrite the English at the requested CEFR level. Show BEFORE (original excerpt) and AFTER. List the main simplifications/enrichments in SUPPORT_LANG.",
  },
  {
    id: "shadow",
    label: "シャドーイング",
    blurb: "音読用スクリプト",
    instruction:
      "Produce a shadowing script: short breath-sized lines (max ~12 words each), a slower 'practice' paragraph, and IPA or respelling for 5 hard words. Add a 1-minute practice plan in SUPPORT_LANG.",
  },
  {
    id: "custom",
    label: "自由指定",
    blurb: "入力した指示どおりの形",
    instruction: "Follow the user's custom format instructions exactly.",
  },
];

export function formatById(id: FormatId) {
  return FORMATS.find((f) => f.id === id) ?? FORMATS[0];
}

export const SAMPLE_ENGLISH = `Last Saturday I went to a small bookstore near the station. I wasn't looking for anything in particular, but a paperback with a faded blue cover caught my eye. The clerk smiled and said, "That one's been waiting for the right person." I bought it, sat down at a cafe, and read the first chapter with a cup of tea. For the first time in weeks, I forgot to check my phone.`;
