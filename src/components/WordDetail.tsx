import { useState } from 'react'
import { POS_CN, findWordByText, type Word } from '../data/lexicon'
import { posText } from '../lib/posText'

interface Props {
  w: Word
  mastered: boolean
  onClose: () => void
  onToggle: (id: string) => void
  onSpeak: (text: string) => void
}

/** 把例句英文按词切开，受控词库里存在的词可点（点击弹出小释义）。 */
function linkEx(en: string, onTap: (w: Word) => void) {
  return en.split(/(\s+)/).map((tok, i) => {
    const w = findWordByText(tok)
    return w ? (
      <span
        key={i}
        className="tap"
        onClick={(e) => {
          e.stopPropagation()
          onTap(w)
        }}
      >
        {tok}
      </span>
    ) : (
      <span key={i}>{tok}</span>
    )
  })
}

export function WordDetail({ w, mastered, onClose, onToggle, onSpeak }: Props) {
  const [pop, setPop] = useState<Word | null>(null)

  const posBadges = w.pos
    .map((p) => posText(p))
    .map((t) => (t ? <span className="pos" key={t}>{t + (POS_CN[t] ? ' ' + POS_CN[t] : '')}</span> : null))

  return (
    <div className="mask show" onClick={(e) => {
      if (e.target === e.currentTarget) onClose()
    }}>
      <div className="sheet" onClick={() => setPop(null)}>
        <button className="sheet-x" onClick={onClose} aria-label="关闭">×</button>

        <div className="sheet-head">
          <h2>{w.word}</h2>
          <button className="spk" data-spk={w.word} title="朗读" onClick={(e) => { e.stopPropagation(); onSpeak(w.word) }}>
            🔊
          </button>
        </div>

        <div className="sheet-ipa">
          <span className="ipa2">/{w.ipa}/</span>
          {posBadges}
        </div>

        <div className="meaning">{w.m.map((x, i) => (i ? '；' : '') + x).join('')}</div>

        <div className="ex-list">
          {w.ex.map((e, i) => (
            <div className="ex" key={i}>
              <div className="ex-row">
                <div className="en">{linkEx(e.en, (tw) => setPop(tw))}</div>
                <button
                  className="spk"
                  data-exi={i}
                  title="朗读例句"
                  onClick={(ev) => {
                    ev.stopPropagation()
                    onSpeak(e.en)
                  }}
                >
                  🔊
                </button>
              </div>
              <div className="zh">{e.zh}</div>
            </div>
          ))}
        </div>

        <button
          className={'btn-block ' + (mastered ? 'ok' : '')}
          onClick={() => onToggle(w.id)}
        >
          {mastered ? '✓ 已掌握（点击回退）' : '标记为已掌握'}
        </button>

        {pop && (
          <div className="pop show" style={{ position: 'static', marginTop: 12, display: 'block' }}>
            <span className="ppos">{posText(pop.pos[0])}</span>
            {pop.m[0]}
            <div className="pspk" onClick={(e) => { e.stopPropagation(); onSpeak(pop.word) }}>
              🔊 朗读
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
