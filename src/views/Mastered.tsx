import { useMemo, useState } from 'react'
import { WORDS } from '../data/lexicon'
import { WordCard, type DisplayMode } from '../components/WordCard'

interface Props {
  active?: boolean
  displayMode: DisplayMode
  mastered: Set<string>
  toggleMastered: (id: string) => void
  onOpen: (id: string) => void
  onSpeak: (t: string) => void
  onHome: () => void
}

export function Mastered({ active, displayMode, mastered, toggleMastered, onOpen, onSpeak, onHome }: Props) {
  const [q, setQ] = useState('')
  const list = useMemo(() => {
    let l = WORDS.filter((w) => mastered.has(w.id))
    const lq = q.trim().toLowerCase()
    if (lq) l = l.filter((w) => w.word.toLowerCase().includes(lq) || w.m.join(' ').toLowerCase().includes(lq))
    return l
  }, [mastered, q])

  return (
    <section className={'screen' + (active ? ' active' : '')} id="s-mastered">
      <div className="sticky-head">
        <div className="topbar">
          <div className="lead">
            <span className="back" onClick={onHome}>‹</span>
          </div>
          <h1>已掌握单词</h1>
          <span className="pill">{mastered.size} 词</span>
        </div>
        <div className="search">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="在已掌握中搜索" />
        </div>
      </div>
      <div className="muted" style={{ margin: '2px 2px 10px', fontSize: 12 }}>
        点任意词可查看详情；在详情里可回退为未掌握。
      </div>

      {list.length ? (
        <div className="grid">
          {list.map((w) => (
            <WordCard key={w.id} w={w} q={q.trim()} displayMode={displayMode} mastered={true} onToggle={toggleMastered} onOpen={onOpen} onSpeak={onSpeak} />
          ))}
        </div>
      ) : (
        <div className="empty">
          <div className="ico">📭</div>
          <div className="t">{mastered.size ? '没有匹配的结果' : '这里还没有已掌握的单词'}</div>
          <div className="muted">{mastered.size ? '试试别的搜索词' : '去首页点「背词」开始学习吧'}</div>
        </div>
      )}
    </section>
  )
}
