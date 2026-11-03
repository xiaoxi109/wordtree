import { useMemo, useState } from 'react'
import { inWindow, SCENES, WORDS, type GradeWindow, type Word } from '../data/lexicon'
import { WordCard, type DisplayMode } from '../components/WordCard'

interface Props {
  active?: boolean
  displayMode: DisplayMode
  setDisplayMode: (m: DisplayMode) => void
  mfState: 'all' | 'un' | 'ma'
  setMfState: (s: 'all' | 'un' | 'ma') => void
  filterScenes: string[]
  filterPos: string[]
  gradeWindow: GradeWindow
  myLevelCn: string
  mastered: Set<string>
  toggleMastered: (id: string) => void
  onOpen: (id: string) => void
  onSpeak: (t: string) => void
  onHome: () => void
  onOpenFilter: () => void
  filterActive: boolean
}

function matchQuery(w: Word, q: string): boolean {
  const lq = q.toLowerCase()
  return (
    w.word.toLowerCase().includes(lq) ||
    w.m.join(' ').toLowerCase().includes(lq) ||
    w.ipa.toLowerCase().includes(lq)
  )
}

export function Browse(props: Props) {
  const { active, displayMode, setDisplayMode, mfState, setMfState, filterScenes, filterPos, gradeWindow, myLevelCn, mastered, toggleMastered, onOpen, onSpeak, onHome, onOpenFilter, filterActive } = props
  const [q, setQ] = useState('')

  const words = useMemo(() => {
    let list = WORDS.filter((w) => inWindow(w, gradeWindow, myLevelCn))
    if (filterScenes.length) list = list.filter((w) => filterScenes.includes(w.scene))
    if (filterPos.length) list = list.filter((w) => w.pos.some((p) => filterPos.includes(p)))
    if (mfState === 'un') list = list.filter((w) => !mastered.has(w.id))
    else if (mfState === 'ma') list = list.filter((w) => mastered.has(w.id))
    if (q.trim()) list = list.filter((w) => matchQuery(w, q.trim()))
    return list
  }, [gradeWindow, myLevelCn, filterScenes, filterPos, mfState, mastered, q])

  const toggleMf = (state: 'un' | 'ma') => setMfState(mfState === state ? 'all' : state)

  return (
    <section className={'screen' + (active ? ' active' : '')} id="s-browse">
      <div className="sticky-head">
        <div className="topbar">
          <div className="lead">
            <span className="back" onClick={onHome}>‹</span>
          </div>
          <h1>词库</h1>
        </div>

        <div className="toolbar">
          <div className="seg" id="dm">
            <button className={displayMode === 'both' ? 'on' : ''} onClick={() => setDisplayMode('both')}>中英</button>
            <button className={displayMode === 'en' ? 'on' : ''} onClick={() => setDisplayMode('en')}>英文</button>
            <button className={displayMode === 'zh' ? 'on' : ''} onClick={() => setDisplayMode('zh')}>中文</button>
          </div>
          <div className="mfilter">
            <button className={'un' + (mfState === 'un' ? ' on' : '')} onClick={() => toggleMf('un')}>未掌握</button>
            <button className={'ma' + (mfState === 'ma' ? ' on' : '')} onClick={() => toggleMf('ma')}>已掌握</button>
          </div>
        </div>

        <div className="search">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索单词 / 释义 / 音标" />
          <button className="filter-btn" onClick={onOpenFilter}>
            <span className="dot" style={{ display: filterActive ? 'block' : 'none' }} />
            筛选
          </button>
        </div>
      </div>

      {q.trim() ? (
        <div>
          <div className="muted" style={{ margin: '6px 2px 10px' }}>找到 {words.length} 个结果</div>
          {words.length ? (
            <div className="grid">
              {words.map((w) => (
                <WordCard key={w.id} w={w} q={q.trim()} displayMode={displayMode} mastered={mastered.has(w.id)} onToggle={toggleMastered} onOpen={onOpen} onSpeak={onSpeak} />
              ))}
            </div>
          ) : (
            <div className="empty">
              <div className="ico">🔍</div>
              <div className="t">没有找到匹配的单词</div>
              <div className="muted">试试更换关键词或清除筛选</div>
            </div>
          )}
        </div>
      ) : words.length ? (
        Object.keys(SCENES).map((sid) => {
          const grp = words.filter((w) => w.scene === sid)
          if (!grp.length) return null
          const sc = SCENES[sid]
          return (
            <div className="scene" key={sid}>
              <div className="scene-h">
                <span className="dot" style={{ background: sc.c }} />
                <b>{sc.n}</b>
                <span>{sc.en}</span>
                <em>{grp.length} 词</em>
              </div>
              <div className="grid">
                {grp.map((w) => (
                  <WordCard key={w.id} w={w} displayMode={displayMode} mastered={mastered.has(w.id)} onToggle={toggleMastered} onOpen={onOpen} onSpeak={onSpeak} />
                ))}
              </div>
            </div>
          )
        })
      ) : (
        <div className="empty">
          <div className="ico">📭</div>
          <div className="t">这个范围内还没有单词</div>
          <div className="muted">放宽等级筛选或清除场景/词性筛选</div>
        </div>
      )}
    </section>
  )
}
