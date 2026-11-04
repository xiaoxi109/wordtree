export type Level = 'Pre-A1' | 'A1' | 'A2' | 'B1' | 'B2'

/** 中式阶梯 rung 顺序（由低到高）—— 从 levels.ts 重导出，保持 Word.grade 类型稳定 */
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

export interface Word {
  word: string
  level: Level
  ipa: string
  pos: string
  meaning: string
  examples: Example[]
  /** Scene category (assigned from categories.ts); used for grouped display. */
  category?: CategoryId
  /** High-frequency / everyday word — shown as 常用. */
  common?: boolean
  /** COCA 扩展包标记。扩展包当前未并入词库（见 index.ts Step 1），字段保留供日后接入。 */
  extended?: boolean
  /** Marked true for words that exist in the 人教版 (PEP) grade list but are NOT
   *  in the main word library — their 音标/释义 come from PEP data (no examples / category). */
  pepOnly?: boolean
  /** 中式阶梯 rung（primary / g7 / g8 / g9 / g10 / g11 / g12 / cet4 / cet6 / kaoyan），每个词必须同时有 grade 和 level。 */
  grade?: GradeRung
}

export interface LevelMeta {
  id: Level
  label: string
  desc: string
  /** Tailwind-ish accent color token */
  accent: string
}
