/**
 * 词库质量过滤（保守版）
 * ======================
 * 只剔除**明确不是单词**的条目，避免误伤 news / children / tired / left 这类正常词：
 *   - 缩写 / 符号：USA、GPS、RSVP、p.m.、kg（释义第一段以 abbr./symb. 开头）
 *   - 缩略形式：we'll、aren't、let's（含撇号）
 *   - 专名：Eric、Hemingway、Cusco（释义标注人名/姓氏/城市/峰）
 *   - 变体：longer、leant（释义没有词性前缀，且写着「…的比较级 / 的过去式」）
 *   - 空释义：chiwen、Buñol（只有「无」）
 *
 * 被剔除的词仍留在词典扩展层，查词照样能查到。
 */

/** 释义第一段（第一个分号前）以缩写标记开头 */
const ABBR_HEAD = /^\s*(abbr|symb|abbrev|symbol)\./i
/** 释义里标注了专名属性 */
const PROPER_MARK = /\[人名\]|人名）|姓氏|城市\]|峰[；;]|峰$|自治区|男子名|女子名/
/** 释义明确标注「是某个词的变体」 */
const INFLECT_MEANING = /的(过去式|过去分词|现在分词|复数|比较级|最高级|第三人称单数)/

/** 零散缩写/量词，点名剔除 */
const DROP_WORDS = new Set([
  'km', 'mm', 'cm', 'kg', 'mg', 'gm', 'pt', 'ct', 'vcd', 'hb', 'rsvp', 'cctv',
  'laughed', 'leant', 'longer',
  // 已过时且带有冒犯性的种族称谓：不适合作为学习词条
  'negro',
  // ECDICT 里的拼写错误 / 非英文条目 / 与已有词重复的写法
  'cance', 'protend', 'seminate', 'reservior', 'vitamine', 'handtruck', 'beddings',
  'accessary', 'equipe', 'outskirt', 'sideway', 'systematical', 'uptodate', 'attent',
  // 明确的历史人物专名：不是可学习的普通词汇
  'hitler',
  // ECDICT 把人名当普通词条收录（释义是误解析的普通名词），不适合作为学习词条
  'bob', 'jill', 'tony', 'becky', 'nancy', 'jimmy', 'matt', 'minnie', 'scrooge',
])

/**
 * 明确要保留的词：正常词汇、常用缩写，或释义被源数据错标（如 sitcom 被标成 abbr.）。
 * 这些词命中任何剔除规则都不剔除。
 */
const KEEP_WORDS = new Set([
  'i', 'a', 'it', 'ok', 'tv', 'cd', 'dvd', 'pc', 'app', 'apps',
  'email', 'pop', 'sitcom', 'wifi', 'wi-fi', 'sir', 'madam',
  'china', 'chinese', 'english', 'american', 'america', 'britain', 'british',
  'canada', 'australia', 'japan', 'japanese', 'france', 'french', 'germany', 'german',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december',
  'christmas', 'easter', 'thanksgiving', 'halloween',
])

/** 正常但缺少词性标注的词 → 手工补词性，避免落进「其他 / 未标注」 */
export const POS_OVERRIDE: Record<string, string> = {
  sitcom: 'n.',
  corridor: 'n.',
  café: 'n.',
  cafe: 'n.',
  bagpipes: 'n.',
  rainforest: 'n.',
  cyberspace: 'n.',
  zipper: 'n.',
  organiser: 'n.',
  organizer: 'n.',
  reflexion: 'n.',
  antisocial: 'adj.',
  bipedal: 'adj.',
  attent: 'adj.',
  artemisinin: 'n.',
  'wi-fi': 'n.',
  wifi: 'n.',
}

/** 释义是否带词性前缀（如 "n. 苹果" / "vt. 完成"） */
const HAS_POS_PREFIX = /^\s*(n|v|vt|vi|a|adj|ad|adv|prep|conj|pron|num|art|det|int|interj|abbr|symb|aux|modal)\b\./i

/**
 * 是否应当从「课程词表」中剔除。
 * @param word    原词
 * @param meaning 中文释义
 */
export function isJunkWord(word: string, meaning: string): boolean {
  if (!word) return true
  const m = (meaning || '').trim()
  const firstSense = m.split(/[；;]/)[0] ?? ''
  if (!m || m === '无') return true

  const lower = word.toLowerCase()
  // 明确保留的词直接放行（含 TV / CD / OK 这类日常缩写与被源数据错标的词）
  if (KEEP_WORDS.has(lower)) return false
  const isCommonAbbr = KEEP_WORDS.has(lower)

  // 缩略形式 / 带点的缩写：we'll、aren't、p.m.、J.K.Rowling
  if (/['’.]/.test(word)) return true
  // 单字母（a / I 是正常词）
  if (word.replace(/[^A-Za-z]/g, '').length <= 1 && !['a', 'i'].includes(lower)) return true
  // 全大写缩写：USA、GPS、RSVP、CCTV、WWF（OK/TV 等保留）
  if (/^[A-Z]{2,}$/.test(word) && !isCommonAbbr) return true
  // 释义第一段就是缩写/符号
  if (ABBR_HEAD.test(firstSense) && !isCommonAbbr) return true
  // 点名剔除
  if (DROP_WORDS.has(word.toLowerCase())) return true
  // 释义标注专名（人名/姓氏/城市/群岛/女名）
  if (PROPER_MARK.test(m)) return true
  // 首字母大写、不在白名单、且释义没有词性前缀 → 专名（Giverny / Dollywood / Soyuz）
  if (/^[A-Z]/.test(word) && !KEEP_WORDS.has(lower) && !HAS_POS_PREFIX.test(m)) return true
  // 没有词性前缀，且释义写明「…的过去式 / 的比较级」→ 纯变体条目
  if (!HAS_POS_PREFIX.test(m) && INFLECT_MEANING.test(m)) return true

  return false
}
