// ============================================================
// 需求：自适应水平评估 + 薄弱点诊断 + 精准课程推送
// ------------------------------------------------------------
// 状态：记录阶段（未实现）
// 依赖：AI 模块重构已完成（单篇生成 + SQL 四表规范化）
// ============================================================

/**
 * 一、核心思路
 * ─────────────────────────────────────────────────────────────
 * 不再让用户手动"选场景 + 选难度"，而是系统**主动**告诉用户：
 *   "我看了你最近读的 5 篇 AI 课程、20 个错词、3 次 AI 聊天，
 *    你现在 A2 顶、B1 边缘；
 *    介词用法 / 过去完成时 / food 场景下的名词搭配 是薄弱点；
 *    给你生成 3 篇针对性文章帮你补。"
 *
 * 本质是一个「数据 → 画像 → 行动」闭环：
 *                 ┌──────────────────────────────┐
 * 数据源 ─────►   │   用户水平画像 UserProfile    │
 *                 └──────────────┬───────────────┘
 *                                 │ 薄弱点诊断
 *                                 ▼
 *                 ┌──────────────────────────────┐
 *                 │  精准推送引擎 RecommendEngine │
 *                 └──────────────┬───────────────┘
 *                                 │ 生成指令
 *                                 ▼
 *                    现有的单篇 AI 生成流水线
 */

// ============================================================
// 二、数据源（全部已有或即将接入）
// ============================================================

// ========================= 2.0 核心升级：把"单次标记"改成"事件流" =========================
//
// 现在：每个词只存一个状态（mastered / unknown）+ 累计 miss 次数
// 升级：每一次复习行为 append 一条 WordEvent，时间顺序串起来
//       → 能算"认识↔不认识来回跳了几次"（记忆不稳定词）
//       → 能算"是英→中还是中→英不认识"（精准薄弱方向）
//       → 能算"反应时间"（快 = 真会，慢 = 其实模糊）
//       → 能算"哪些词反复出现在 StudyView 里反复答错"
//
// 这是整个需求里**性价比最高**的数据源——用户每次刷卡都在产生数据，
// 零额外成本、样本量大、比 AI 聊天便宜 100 倍。

export type WordEventSource = 'study' | 'ai_reader' | 'quiz' | 'manual'
export type WordEventDirection = 'en→zh' | 'zh→en' | 'both'
export type WordEventGrade = 'known' | 'fuzzy' | 'unknown' | 'skipped'

/** 一次复习/判级事件。 */
export interface WordEvent {
  id: string
  word_key: string
  word: string
  at: number
  /** 哪面看到的：英文→中文 还是 中文→英文 */
  direction: WordEventDirection
  /** 用哪个模块判的级 */
  source: WordEventSource
  /** 判的什么级 */
  grade: WordEventGrade
  /** 从展示到判级的毫秒数（可空，手动标记没有） */
  reaction_ms?: number
  /** 关联上下文（哪篇 AI 课、哪个 quiz） */
  context_id?: string
}

// ------------------------- 从事件流聚合出来的分析结构 -------------------------

/** 一个词的完整复习轨迹（从 WordEvent 聚合）。 */
export interface WordTrajectory {
  word_key: string
  word: string
  total_events: number
  /** 状态切换次数：known↔unknown 来回跳的次数 → 越高 = 记忆越不稳定 */
  state_flips: number
  /** 最近 N 次事件的状态序列（算趋势用） */
  recent_sequence: WordEventGrade[]
  /** 英→中方向的 known 率 */
  known_rate_en_to_zh: number
  /** 中→英方向的 known 率（如果只在一个方向练过，另一端是 null） */
  known_rate_zh_to_en: number | null
  /** 最近 10 次平均反应时间（ms） */
  avg_reaction_ms: number | null
  /** 不稳定度 0~1（state_flips 和 known_rate 综合） */
  instability: number
}

/** 2.1 已掌握词表（现状：localStorage lexicore-mastered）。 */
//     继续保留 Set<string> 作"当前掌握词"的快照；
//     但计算 UserProfile 时不再直接读这个快照的 size，
//     而是读 WordTrajectory 聚合后的 confidence 加权值。

/** 2.2 错词复习队列（现状：localStorage lexicore-ai-review）。 */
//     继续保留作"AI 课程挑词入文"的快速索引；
//     但 misses / lastAt 不再手动累加——改为从 WordEvent 流里聚合。

// 2.3 AI 课程阅读行为（现状：LessonMark 表，已落地）
//     新增：读取时记录阅读流畅度（句子间停留时长、跳过段落）
export interface LessonReadingEvent {
  lesson_id: string
  segment_index: number
  /** 该段停留超过 3s 标记为"有卡点" */
  stalled: boolean
  /** 该段是否点过词（点过 = 不确定） */
  looked_up: boolean
  /** 阅读该段时朗读次数（0=跳过没听，1=听了一次，2+=反复听） */
  listen_count: number
}

// 2.4 AI 聊天记录（未来新增数据源）
//     用户用 AI 练口语时的完整对话，用于提取薄弱语法点和发音困难词
export interface AiChatSession {
  id: string
  created_at: number
  /** 用 LLM 离线分析后的诊断 */
  analysis?: ChatAnalysis
  messages: Array<{ role: 'user' | 'assistant'; content: string; at: number }>
}

export interface ChatAnalysis {
  /** 用户尝试说的英语里出现频次高但正确用法没掌握的词 */
  tentative_words: string[]
  /** 语法错误类型 + 次数（present_tense / article / preposition ...） */
  grammar_errors: Record<string, number>
  /** 发音困难词（音频转写差异大的词） */
  pronunciation_hard: string[]
  /** 本轮整体水平自评（A1~B2） */
  self_assessed_level: 'A1' | 'A2' | 'B1' | 'B2' | 'unknown'
}

// ============================================================
// 三、用户水平画像 UserProfile（核心产出）
// ============================================================

export interface UserProfile {
  id: string
  generated_at: number

  /** 当前综合水平，用 CEFR 四级带小数（A1.3, A2.8, B1.5, B2.1） */
  level: number
  level_label: 'A1' | 'A2' | 'B1' | 'B2'

  /** 各维度能力分（0~1） */
  scores: {
    /** 词汇广度：已掌握词数 / 对应级别上限 */
    vocabulary: number
    /** 词汇深度：同一个词在不同体裁里见过、标记 known 的次数 */
    depth: number
    /** 语法：从 AI 聊天语法错误 / AI 文章卡点推断 */
    grammar: number
    /** 阅读流畅度：stalled segment 占比的倒数 */
    fluency: number
    /** 听力：listen_count > 1 的段落占比的倒数 */
    listening: number
  }

  /** TOP 薄弱点：精准到 category / kind / 语法点 */
  weaknesses: WeakPoint[]

  /** TOP 最近进步点 */
  strengths: WeakPoint[]
}

export interface WeakPoint {
  /** 类型：词汇 / 语法 / 场景 / 体裁 / 不稳定词 / 方向性薄弱 / 慢反应 */
  type: 'vocab' | 'grammar' | 'category' | 'kind' | 'leech' | 'direction' | 'slow'
  /** 标识符：word_key / grammar_tag / category_id / lesson_kind / 'en→zh' / 'zh→en' / null */
  id: string | null
  /** 展示标签 */
  label: string
  /** 严重度 0~1 */
  severity: number
  /** 数据来源 */
  evidence: { count: number; sources: string[] }
  /** 针对这个薄弱点的具体建议（给 RecommendEngine / StudyView / 提示用） */
  prescription: string
  /** 可选：方向性薄弱时标记哪个方向弱 */
  direction?: 'en→zh' | 'zh→en'
}

// ============================================================
// 四、计算逻辑（伪代码，用于指导实现）
// ============================================================

/**
 * 4.1 综合水平分 level 计算
 *
 * level = 基础分 + 词汇分 + 语法分 + 流畅度分 + 置信度衰减
 *
 *   基础分：masteredCount 落在哪个阈值区间
 *     < 200  → A1.0
 *     200-500 → A1.8
 *     500-1200 → A2.5
 *     1200-2500 → B1.3
 *     2500-4000 → B1.8
 *     > 4000 → B2.0
 *
 *   词汇分：reviewWords 比例拉低
 *     review_ratio > 30% → level -= 0.4
 *     review_ratio > 50% → level -= 0.8
 *
 *   语法分：AI 聊天 grammar_errors 拉低
 *     preposition > 3 → level -= 0.3
 *     article > 3 → level -= 0.2
 *     past_tense > 5 → level -= 0.3
 *
 *   流畅度分：stalled_segments 比例拉低
 *     stalled_ratio > 20% → level -= 0.2
 *     stalled_ratio > 40% → level -= 0.5
 *
 *   置信度衰减：久不复习的词 confidence < 0.5 时拉低基础分
 */

/**
 * 4.2 薄弱点诊断（Phase 1 全从 WordEvent 事件流算，Phase 2+ 接 AI 聊天）
 *
 * ─── Phase 1 就能跑（零 AI 依赖） ───
 *
 * ① 不稳定词（leech）：WordTrajectory.state_flips >= 3
 *    → 用户以为会了 → 又忘了 → 又想起来 → 又忘了
 *    → 比"一直 unknown 的词"更危险——它在拉低词汇分但用户没察觉
 *    → prescription：下次 AI 生成时**强制**把这个词放进去（无论场景匹配度）
 *
 * ② 方向性薄弱词：known_rate_en_to_zh > 0.7 但 known_rate_zh_to_en < 0.4
 *    → 看到英文能认出来意思，但自己说/写这个词时卡住
 *    → prescription：StudyView 里多加中→英方向的卡；AI 文章里把词放成 prompt 中的填空位
 *
 * ③ 慢反应词：avg_reaction_ms > 5000ms 且 grade = 'known'
 *    → 用户说是"认识"但想了 10 秒才答出来——其实没真掌握，只是不想点 unknown
 *    → prescription：StudyView 里如果反应 > 3s 强制弹追问"确定真的认识吗？"
 *
 * ④ 词汇级（原方案）：过去 20 篇 AI 课程里 marks=unknown/fuzzy 的 word_key 频次
 *    → Top 10 即为薄弱词汇
 *
 * ⑤ 场景级（原方案）：聚合薄弱词汇的 category
 *    → 如果 60%+ 集中在 food，说明 food 场景是薄弱场景
 *
 * ─── Phase 2+（需 AI 聊天 / 阅读事件） ───
 *
 * ⑥ 语法级：grammar_errors 里频次最高的 tag
 * ⑦ 体裁级：某体裁 stalled_ratio 显著高于其他体裁
 */

/**
 * 4.1 综合水平分 level 计算（事件流驱动版）
 *
 *   基础分（原来的 masteredCount 区间，不变）
 *
 *   词汇广度分：用"Event 加权词数"替代 raw masteredSet.size
 *     effectiveMastered = Σ (trajectory.known_rate * trajectory.inverse_instability)
 *     → 1000 个 known_rate=0.9 且 state_flips=0 的词 ≈ 900 个"真掌握"的词
 *     → 1000 个 known_rate=0.9 但 state_flips=5 的词 ≈ 400 个（被 instability 砍一半）
 *
 *   薄弱点扣分（从上面的诊断维度来）
 *     leech 词占比 > 15%        → level -= 0.5
 *     方向性薄弱词占比 > 25%    → level -= 0.3
 *     慢反应 known 占比 > 20%   → level -= 0.2
 */

/**
 * 4.3 精准推送引擎 RecommendEngine
 *
 * 输入：UserProfile
 * 输出：给 useAiLessons.generate() 的推荐参数
 *
 *   condition.topic        ← weaknesses 里 category 薄弱点的对应 TopicId
 *   condition.difficulty   ← 围绕 level_label 上下浮动 0.2 级
 *   condition.format       ← 避开 weaknesses.kind（如果 poetry 是薄弱体裁就不推诗）
 *   wordsPerLesson         ← 根据 vocabulary.score 动态调整
 *                             score < 0.4 → 每篇 15 词
 *                             score > 0.7 → 每篇 24 词
 *
 * 额外：给 buildLessonMessages() 新增 weaknesses 参数
 *   → prompt 里追加"重点覆盖这些薄弱词 / 场景 / 语法点"
 *   → 以及"避开这些已经过度练习的内容"
 */

// ============================================================
// 五、新增接口（落地时要写进 db.ts / lib/ 里）
// ============================================================

// db.ts 新增三张表（Phase 1 就需要）
//
//   ① word_events（事件流，Phase 1 核心基础设施）
//      id, word_key, word, at, direction, source, grade, reaction_ms, context_id
//      → 这是整个诊断系统的"原始日志"，每次判级 append 一条，永不删除
//
//   ② user_profile（画像快照，每次刷新覆盖更新）
//      id, generated_at, level, level_label, scores JSON, weaknesses JSON, strengths JSON
//
//   ③ chat_sessions（Phase 2+）
//      id, created_at, analysis JSON, messages JSON

// lib/ 新增四个模块
//   lib/events.ts         appendWordEvent() — StudyView / AI 阅读器每次判级都调这个
//                         trajectoryOf(key) — 从事件流聚合一个词的 WordTrajectory
//
//   lib/profile.ts        computeUserProfile() — 读全部 trajectory → 算 UserProfile
//   lib/diagnosis.ts      findWeaknesses(profile) — 七种薄弱点维度
//   lib/recommend.ts      recommend(profile) — 把画像转成 generate() 的参数

// sql.ts 新增三张建表语句（word_events / user_profile / chat_sessions）

// ============================================================
// 六、分阶段落地建议
// ============================================================
//
// ─── Phase 1（现在就能做，零 AI 聊天依赖）────────────────
//
//   基础设施：
//   ✅ db.ts 加 word_events 表（SQL + IndexedDB）
//   ✅ lib/events.ts 两个函数：appendWordEvent / trajectoryOf
//   ✅ StudyView 每次判级 → appendWordEvent（direction 从 displayMode 推）
//   ✅ LessonReader 每次三态标记 → appendWordEvent
//   ✅ lib/profile.ts + lib/diagnosis.ts + lib/recommend.ts
//   ✅ WeakPoint 接口加 leech / direction / slow 三种 type
//
//   分析维度（Phase 1 全从 WordEvent 事件流算）：
//   ✅ 不稳定词 leech（state_flips >= 3）
//   ✅ 方向性薄弱 known_rate_en→zh 与 zh→en 差 > 0.3
//   ✅ 慢反应词（avg_reaction > 5s 且 grade='known'）
//   ✅ AI 阅读器 marks 高频 unknown（已有数据）
//   ✅ 场景级 category 聚合（已有数据）
//
//   UI：
//   ✅ AiView 顶部新增"我的当前水平：A1.5" + "薄弱点 Top 3"展示
//   ✅ "生成条件"Sheet 里加「自动选（推荐）」选项
//   ✅ StudyView 里"反应 > 3s 点 known"强制弹追问
//   ✅ 方向性薄弱词在 StudyView 里默认反向展示
//
// ─── Phase 2（需新增 AI 聊天功能）─────────────────────────
//
//   ⬜ AI 口语聊天模块（独立界面）
//   ⬜ 每轮聊天后离线 LLM analyze() → ChatAnalysis
//   ⬜ 接入 grammar_errors → 语法级薄弱点诊断
//   ⬜ 新增语法分维度到 UserProfile
//
// ─── Phase 3（高级自适应）──────────────────────────────────
//
//   ⬜ 记录 WordEvent.reaction_ms（StudyView 从展示时间戳算）
//   ⬜ LessonReadingEvent（段落卡顿 / 点词 / 朗读次数）
//   ⬜ 体裁级薄弱点诊断
//   ⬜ profile 自适应重算（每生成一篇自动跑一次 computeUserProfile）
//   ⬜ 推送提醒（隔天没生成 → "你的词汇置信度在下降"）
