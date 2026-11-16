import {
  assembleDoc,
  getLessonMarks,
  getLessonSegments,
  getLessonWords,
  listLessons,
  type Lesson,
  type LessonMark,
  type LessonSegment,
  type LessonWord,
  type WordMarkState,
} from '../db'

/**
 * SQL 导出层：把 IndexedDB 里的 Lesson/Word/Segment/Mark 四张表的数据
 * 转成标准 SQL 语句，方便你后续用 MySQL / PostgreSQL / SQLite 做持久化。
 *
 * 这层的接口纯粹围绕「数据 → SQL」，不依赖任何 React 或 LLM 逻辑，
 * 后续可以单独做成 Node 脚本离线导出，也可以在 App 里点按钮一键复制。
 */

// ========================= DDL =========================

/** 建表语句（ANSI SQL，兼容 MySQL / PostgreSQL / SQLite）。 */
export const SQL_DDL = `-- 词树 · SQL 优先规范化结构
-- 每张表对应 db.ts 的一个 export interface

CREATE TABLE IF NOT EXISTS lessons (
  id                  VARCHAR(64) PRIMARY KEY,
  title               VARCHAR(200) NOT NULL,
  kind                VARCHAR(20)  NOT NULL,
  generation_mode     VARCHAR(10)  NOT NULL DEFAULT 'daily',  -- review | daily | stretch
  scene_label         VARCHAR(100) NOT NULL,
  scene_category      VARCHAR(32),
  condition_topic     VARCHAR(20)  NOT NULL,
  condition_difficulty VARCHAR(20) NOT NULL,
  condition_format    VARCHAR(20)  NOT NULL,
  status              VARCHAR(16)  NOT NULL,
  error               TEXT,
  coverage_hit        INTEGER,
  coverage_total      INTEGER,
  coverage_known      INTEGER,
  coverage_real_words INTEGER,
  coverage_mastered   INTEGER,
  read_at             BIGINT,
  created_at          BIGINT NOT NULL,
  updated_at          BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS lesson_segments (
  id         VARCHAR(80) PRIMARY KEY,
  lesson_id  VARCHAR(64) NOT NULL,
  position   INTEGER     NOT NULL,
  speaker    VARCHAR(80),
  en         TEXT NOT NULL,
  zh         TEXT NOT NULL,
  FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_segments_lesson ON lesson_segments(lesson_id, position);

CREATE TABLE IF NOT EXISTS lesson_words (
  id         VARCHAR(80) PRIMARY KEY,
  lesson_id  VARCHAR(64) NOT NULL,
  position   INTEGER     NOT NULL,
  word_key   VARCHAR(80) NOT NULL,
  word       VARCHAR(80) NOT NULL,
  ipa        VARCHAR(60),
  meaning    VARCHAR(300),
  is_review  BOOLEAN     NOT NULL DEFAULT FALSE,
  FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_words_lesson ON lesson_words(lesson_id, position);
CREATE INDEX IF NOT EXISTS idx_words_key   ON lesson_words(word_key);

CREATE TABLE IF NOT EXISTS lesson_marks (
  lesson_id  VARCHAR(64)   NOT NULL,
  word_key   VARCHAR(80)   NOT NULL,
  state      VARCHAR(12)   NOT NULL,  -- known | fuzzy | unknown
  updated_at BIGINT        NOT NULL,
  PRIMARY KEY (lesson_id, word_key),
  FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_marks_word ON lesson_marks(word_key);

-- ========================= Phase 1 新增：事件流 =========================
-- append-only，记录每一次复习判级。USER 画像 / 薄弱点诊断的原始数据源。
CREATE TABLE IF NOT EXISTS word_events (
  id          VARCHAR(80) PRIMARY KEY,
  word_key    VARCHAR(80) NOT NULL,
  word        VARCHAR(80) NOT NULL,
  at          BIGINT NOT NULL,
  direction   VARCHAR(10) NOT NULL,  -- 'en→zh' | 'zh→en' | 'both'
  source      VARCHAR(20) NOT NULL,  -- 'study' | 'ai_reader' | 'quiz' | 'manual'
  grade       VARCHAR(12) NOT NULL,  -- 'known' | 'fuzzy' | 'unknown' | 'skipped'
  reaction_ms INTEGER,
  context_id  VARCHAR(80)
);
CREATE INDEX IF NOT EXISTS idx_events_word   ON word_events(word_key);
CREATE INDEX IF NOT EXISTS idx_events_at     ON word_events(at);
CREATE INDEX IF NOT EXISTS idx_events_source ON word_events(source);
`

// ========================= 单值转义 =========================

function esc(v: unknown): string {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  if (typeof v === 'number') return String(v)
  return `'${String(v).replace(/'/g, "''")}'`
}

// ========================= INSERT =========================

/** 单篇 Lesson 的四表 INSERT 语句。 */
export function lessonToSQL(
  lesson: Lesson,
  segments: LessonSegment[],
  words: LessonWord[],
  marks: LessonMark[],
): string {
  const ids: string[] = []

  const lessonCols = [
    'id', 'title', 'kind', 'generation_mode', 'scene_label', 'scene_category',
    'condition_topic', 'condition_difficulty', 'condition_format',
    'status', 'error', 'coverage_hit', 'coverage_total',
    'coverage_known', 'coverage_real_words', 'coverage_mastered', 'read_at', 'created_at', 'updated_at',
  ]
  const lessonVals = lessonCols.map((c) => esc((lesson as any)[c])).join(', ')
  ids.push(`INSERT INTO lessons (${lessonCols.join(', ')}) VALUES (${lessonVals});`)

  for (const seg of segments) {
    const segId = `${lesson.id}:seg:${seg.position}`
    ids.push(
      `INSERT INTO lesson_segments (id, lesson_id, position, speaker, en, zh) VALUES ` +
      `(${esc(segId)}, ${esc(lesson.id)}, ${esc(seg.position)}, ${esc(seg.speaker ?? null)}, ${esc(seg.en)}, ${esc(seg.zh)});`,
    )
  }

  for (const w of words) {
    const wid = `${lesson.id}:word:${w.position}`
    ids.push(
      `INSERT INTO lesson_words (id, lesson_id, position, word_key, word, ipa, meaning, is_review) VALUES ` +
      `(${esc(wid)}, ${esc(lesson.id)}, ${esc(w.position)}, ${esc(w.word_key)}, ${esc(w.word)}, ${esc(w.ipa ?? null)}, ${esc(w.meaning ?? null)}, ${esc(w.is_review)});`,
    )
  }

  for (const m of marks) {
    ids.push(
      `INSERT INTO lesson_marks (lesson_id, word_key, state, updated_at) VALUES ` +
      `(${esc(lesson.id)}, ${esc(m.word_key)}, ${esc(m.state)}, ${esc(m.updated_at)}) ` +
      `ON CONFLICT (lesson_id, word_key) DO UPDATE SET state = EXCLUDED.state, updated_at = EXCLUDED.updated_at;`,
    )
  }

  return ids.join('\n')
}

/** 把库里所有课程导出成一份 SQL 文件（DDL + INSERT）。 */
export async function exportAllSQL(): Promise<string> {
  const lessons = await listLessons()
  const chunks: string[] = [SQL_DDL, '']

  for (const l of lessons) {
    const segs = await getLessonSegments(l.id)
    const words = await getLessonWords(l.id)
    const marks = await getLessonMarks(l.id)
    chunks.push(`-- ===== Lesson: ${l.title} (${l.scene_label}) =====`)
    chunks.push(lessonToSQL(l, segs, words, marks))
    chunks.push('')
  }

  return chunks.join('\n')
}

// ========================= 从文档反推完整 Lesson（db.ts assembleDoc 的包装） =========================

/** 把 IndexedDB 文档重新组装成 Lesson + 三个 children 数组（导出 SQL 时用）。 */
export function docToLessonPackage(doc: ReturnType<typeof assembleDoc>): {
  lesson: Lesson
  segments: LessonSegment[]
  words: LessonWord[]
  marks: LessonMark[]
} {
  const { segments, words, marks: markMap, ...lesson } = doc
  const markList: LessonMark[] = Object.entries(markMap).map(([word_key, state]) => ({
    lesson_id: lesson.id,
    word_key,
    state: state as WordMarkState,
    updated_at: lesson.updated_at,
  }))
  return { lesson, segments, words, marks: markList }
}
