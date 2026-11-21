/**
 * 词形归一化的唯一口径。
 *
 * App 内多处需要把「同一个词的不同写法」收敛成同一个键
 * （大小写、全角字符、连字符/撇号差异、末尾符号），例如：
 *   - 富字典（public/dicts/rich）的键
 *   - 词库 bundle 的词键
 *   - 掌握进度 localStorage 的词键
 *
 * 这里只保留一份实现，避免各处口径漂移。
 */

/** 小写 + NFKC + 只保留字母数字连字符撇号。 */
export function normWord(raw: string): string {
  return String(raw ?? '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^a-z0-9'-]/g, '')
}
