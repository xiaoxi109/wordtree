export type Level = 'Pre-A1' | 'A1' | 'A2' | 'B1' | 'B2' | 'C1'

/** 年级档位（内部兼容字段，不再作为用户可选学习路线） */
export type GradeRung =
  | 'primary'   // 小学
  | 'g7'        // 初一
  | 'g8'        // 初二
  | 'g9'        // 初三
  | 'g10'       // 高一
  | 'g11'       // 高二
  | 'g12'       // 高三
  | 'cet4'      // 四级
  | 'cet6'      // 六级
  | 'kaoyan'    // 考研

// Scene / thematic category groups used for associative learning (v3 生活场景版).
export type CategoryId =
  | 'people'      // 人物与关系
  | 'body'        // 身体部位
  | 'health'      // 健康医疗
  | 'clothes'     // 衣着配饰
  | 'food'        // 食物与饮料
  | 'home'        // 家居与生活
  | 'animals'     // 动物
  | 'nature'      // 自然与天气
  | 'space'       // 方位与空间
  | 'time'        // 时间与频率
  | 'numbers'     // 数字与数量
  | 'colors'      // 颜色
  | 'size'        // 外形与尺寸
  | 'actions'     // 动作行为
  | 'emotions'    // 情感与感受
  | 'communication' // 沟通与语言
  | 'education'   // 学习教育
  | 'work'        // 工作与职业
  | 'travel'      // 旅行与交通
  | 'shopping'    // 购物与金钱
  | 'society'     // 社会与世界
  | 'science'     // 科学与技术
  | 'media'       // 媒体与网络
  | 'arts'        // 艺术与娱乐
  | 'thinking'    // 思维与概念
  | 'grammar'     // 基础功能词
  | 'questions'   // 疑问词
  | 'toys'        // 玩具与游戏
  | 'idioms'      // 常用短语与口语表达
  | 'sports'      // 运动与健身
  | 'music'       // 音乐与乐器
  | 'tech'        // 科技与数码
  | 'city'        // 城市与建筑
  | 'festival'    // 节日与庆祝
  | 'law'         // 法律与制度
  | 'military'    // 战争与军事
  | 'religion'    // 宗教与信仰
  | 'weather'     // 天气与气候

export interface CategoryMeta {
  id: CategoryId
  label: string   // 中文场景名
  en: string      // 英文场景名
  order: number   // 显示顺序
}

export interface Example {
  en: string
  zh: string
}

/** 短语搭配：英文短语 + 中文释义（来自 TypeWords 词库的 phrases）。 */
export interface WordPhrase {
  en: string
  zh: string
}

/** 近义词：词性 + 该词性下的中文释义 + 近义词列表（来自 TypeWords 词库的 synos）。 */
export interface WordSynonym {
  pos: string
  meaning: string
  words: string[]
}

/** 词库标识：core 为默认词树词库；其余为 TypeWords 词库目录中的 enName。 */
export type LexiconId = string

export interface Word {
  word: string
  level: Level
  ipa: string
  pos: string
  meaning: string
  examples: Example[]
  /** 短语搭配（富字典补齐后才有）。 */
  phrases?: WordPhrase[]
  /** 近义词（富字典补齐后才有）。 */
  synonyms?: WordSynonym[]
  /** Scene category (assigned from categories.ts); used for grouped display. */
  category?: CategoryId
  /** High-frequency / everyday word — shown as 常用. */
  common?: boolean
  /** 历史字段：旧 COCA 扩展包标记。扩展包已移除，补充词层改由 ECDICT 生成。 */
  extended?: boolean
  /**
   * 词层：
   *   core  = 课程词表（教材 / 牛津 / 考纲词），参与学习队列、进度、晋级
   *   extra = 词典扩展词（按词频补充），只用于查词与 AI 生成，不参与晋级统计
   * 缺省视为 core。
   */
  tier?: 'core' | 'extra'
  /** Marked true for words that exist in the 人教版 (PEP) grade list but are NOT
   *  in the main word library — their 音标/释义 come from PEP data (no examples / category). */
  pepOnly?: boolean
  /** 年级档位（内部兼容字段，不参与 UI 筛选），每个词同时保留 grade 和 level。 */
  grade?: GradeRung
  /** 所属词库；缺省视为 core。 */
  lexiconId?: LexiconId
}

export interface LevelMeta {
  id: Level
  label: string
  desc: string
  /** Tailwind-ish accent color token */
  accent: string
}
