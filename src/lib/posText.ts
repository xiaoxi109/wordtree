/**
 * 词性文本规范化（与高保真原型一致）。
 *
 * 输入可能是 `n.`、`n., v.`、`n./v.`、`modal v.`、`number` 等杂格式；
 * 统一处理为「恰好一个句点结尾的缩写」，并以 ` / ` 连接复合词性，杜绝
 * `n..` / `n. ` 这类多余句点或空格。
 */
const POS_CANON: Record<string, string> = {
  n: 'n.',
  noun: 'n.',
  pl: 'n.',
  v: 'v.',
  verb: 'v.',
  vt: 'v.',
  vi: 'v.',
  adj: 'adj.',
  adjective: 'adj.',
  adv: 'adv.',
  adverb: 'adv.',
  pron: 'pron.',
  pronoun: 'pron.',
  prep: 'prep.',
  preposition: 'prep.',
  conj: 'conj.',
  conjunction: 'conj.',
  int: 'int.',
  interj: 'int.',
  interjection: 'int.',
  exclam: 'int.',
  exclamation: 'int.',
  num: 'num.',
  number: 'num.',
  numeral: 'num.',
  det: 'det.',
  determiner: 'det.',
  art: 'art.',
  article: 'art.',
  modal: 'modal v.',
  modalv: 'modal v.',
  aux: 'aux.',
  auxiliary: 'aux.',
  phr: 'phr.',
  phrase: 'phr.',
  abbr: 'abbr.',
  abbrev: 'abbr.',
}

export function posText(raw: string | string[] | undefined): string {
  const list = Array.isArray(raw) ? raw : raw == null ? [] : [raw]
  const out: string[] = []
  list.forEach((item) => {
    String(item)
      .split(/[,/;，、|&+]+/)
      .forEach((p) => {
        let key = String(p).toLowerCase().trim().replace(/[.\s]+$/, '').trim() // 去掉尾部多余句点与空格
        if (!key) return
        let canon = POS_CANON[key]
        if (!canon) canon = POS_CANON[key.replace(/\s+/g, ' ')]
        if (!canon) canon = POS_CANON[key.split(/\s+/)[0]] // 'modal v' → modal v.
        if (!canon) canon = key + '.' // 未知词性：补一个规范句点
        if (out.indexOf(canon) < 0) out.push(canon)
      })
  })
  return out.join(' / ')
}
