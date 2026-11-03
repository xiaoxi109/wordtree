import type { Word } from '../data/lexicon'
import { posText } from '../lib/posText'
import { Highlight } from './Highlight'

export type DisplayMode = 'both' | 'en' | 'zh'

interface Props {
  w: Word
  q?: string
  displayMode: DisplayMode
  mastered: boolean
  onToggle: (id: string) => void
  onOpen: (id: string) => void
  onSpeak: (text: string) => void
}

/** 词库/已掌握/搜索结果共用的两列词卡，与原型 gridHTML 一一对应。 */
export function WordCard({ w, q, displayMode, mastered, onToggle, onOpen, onSpeak }: Props) {
  const showEn = displayMode !== 'zh'
  const showZh = displayMode !== 'en'
  const allM = w.m.join('；')

  return (
    <div
      className={'wcard' + (mastered ? ' mastered' : '')}
      onClick={(e) => {
        const t = e.target as HTMLElement
        if (t.closest('.spk') || t.closest('.wc-check')) return
        onOpen(w.id)
      }}
    >
      <div className="wc-top">
        <button
          className={'wc-check' + (mastered ? ' on' : '')}
          data-check={w.id}
          title={mastered ? '已掌握，点击回退' : '标记为已掌握'}
          aria-label="标记为已掌握"
          onClick={(e) => {
            e.stopPropagation()
            onToggle(w.id)
          }}
        >
          ✓
        </button>
        <div className="wc-badges">
          <span className="badge">{w.grade || w.level}</span>
          {w.freq <= 8 && <span className="badge common">常用</span>}
          <span className="badge">{posText(w.pos)}</span>
        </div>
      </div>

      <div className="wc-mid">
        {showEn ? (
          <span className="en">
            <Highlight text={w.word} q={q} />
          </span>
        ) : (
          <span className="zh main">
            <Highlight text={allM} q={q} />
          </span>
        )}
      </div>

      {showEn && <span className="ipa">/{w.ipa}/</span>}

      <div className="wc-foot">
        {showEn && showZh && <div className="wc-zh">{<Highlight text={allM} q={q} />}</div>}
        <button
          className="spk"
          data-spk={w.word}
          title="朗读"
          onClick={(e) => {
            e.stopPropagation()
            onSpeak(w.word)
          }}
        >
          🔊
        </button>
      </div>
    </div>
  )
}
