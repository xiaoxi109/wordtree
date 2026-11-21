/**
 * 把「拼成一段」的中文释义还原成「按词性分组」的释义。
 *
 * 词库里的 meaning 是一整串：
 *   "v. 取消（计划好的事情）；终止，废除；n. 取消，撤销；邮票注销章"
 * 词性前缀只在每组开头出现一次，组内用「；」分隔多条释义。
 * 这里按同样口径切分，供词卡按「词性 + 正文」两列展示（正文悬挂缩进对齐）。
 */
import { isKnownPosToken } from './pos'

export interface MeaningGroup {
  /** 词性标签（原文，如 'v.' 'adj.'）；没有词性时为空串 */
  pos: string
  /** 该词性下的释义（多条以「；」连接） */
  text: string
}

/** 段首的词性前缀，如 "v." "vt." "aux.v." */
const POS_PREFIX = /^([A-Za-z]{1,8}\.(?:\s*[A-Za-z]{1,8}\.)?)\s*/

/**
 * 解析释义文本 → 按词性分组。
 * 识别不出词性时整段归到一个无词性分组，交给调用方原样展示。
 */
export function meaningGroups(meaning: string): MeaningGroup[] {
  const raw = (meaning ?? '').trim()
  if (!raw) return []
  const segments = raw
    .split('；')
    .map((s) => s.trim())
    .filter(Boolean)

  const groups: MeaningGroup[] = []
  for (const seg of segments) {
    const m = POS_PREFIX.exec(seg)
    let pos = ''
    let text = seg
    if (m) {
      const parts = m[1]
        .split('.')
        .map((p) => p.trim())
        .filter(Boolean)
      if (parts.length > 0 && parts.every((p) => isKnownPosToken(p))) {
        pos = m[1]
        text = seg.slice(m[0].length).trim()
      }
    }
    if (!text) continue
    const last = groups[groups.length - 1]
    if (!pos && last) {
      // 无词性的续行属于上一组（上游把同一词性的多条释义用「；」串起来）
      last.text = last.text ? `${last.text}；${text}` : text
    } else if (last && last.pos === pos) {
      last.text = last.text ? `${last.text}；${text}` : text
    } else {
      groups.push({ pos, text })
    }
  }
  return groups
}
