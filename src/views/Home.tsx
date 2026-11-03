import { inWindow, WORDS, type GradeWindow } from '../data/lexicon'

interface TileIconProps {
  paths: string[]
}

function TileIcon({ paths }: TileIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      {paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  )
}

const TILE_ICONS: Record<string, string[]> = {
  book: ['M12 5.6C10.4 4.6 8 4.1 5.5 4.6L4 5v12l1.5-.5C8 15.6 10.4 16.1 12 17.1c1.6-1 4-1.5 6.5-1L20 5l-1.5-.5C16 4.1 13.6 4.6 12 5.6z', 'M12 5.6V17.1'],
  refresh: ['M20 11a8 8 0 1 0-1.8 5', 'M20 5v6h-6'],
  doc: ['M6 3h9l4 4v14H6z', 'M14 3v5h5', 'M9 12h7M9 16h7'],
  trophy: ['M7 4h10v4a5 5 0 0 1-10 0z', 'M12 13v4', 'M9 21h6'],
}

interface Props {
  active?: boolean
  mastered: Set<string>
  gradeWindow: GradeWindow
  myLevelCn: string
  dueCount: number
  onBrowse: () => void
  onReview: () => void
  onLesson: () => void
  onChallenge: () => void
}

export function Home({ active, mastered, gradeWindow, myLevelCn, dueCount, onBrowse, onReview, onLesson, onChallenge }: Props) {
  const winWords = WORDS.filter((w) => inWindow(w, gradeWindow, myLevelCn))
  const winTotal = winWords.length
  const winMastered = winWords.filter((w) => mastered.has(w.id)).length
  const goal = Math.max(winTotal, 1)
  const newCnt = winTotal - winMastered
  const ringNum = winMastered
  const circ = 2 * Math.PI * 34
  const offset = circ * (1 - Math.min(winMastered / goal, 1))

  const tiles = [
    { key: 'book', cls: 'green', title: '背词', sub: `${newCnt} 个本级新词待学`, link: '开始学习 →', onClick: onBrowse },
    { key: 'refresh', cls: 'orange', title: '复习', sub: `${dueCount} 词待复习`, link: '去复习 →', onClick: onReview },
    { key: 'doc', cls: 'blue', title: '课文', sub: '分级阅读 · AI 互动', link: '进入 →', onClick: onLesson },
    { key: 'trophy', cls: 'rose', title: '闯关晋级', sub: '临界词抽检 · 80% 通过', link: '挑战 →', onClick: onChallenge },
  ]

  return (
    <section className={'screen' + (active ? ' active' : '')} id="s-home">
      <div className="hero">
        <div className="streak">🔥 连续 7 天</div>
        <div className="hero-row">
          <div className="ring-wrap">
            <svg viewBox="0 0 80 80" className="ring">
              <circle cx="40" cy="40" r="34" className="ring-bg" />
              <circle cx="40" cy="40" r="34" className="ring-fg" style={{ strokeDasharray: circ, strokeDashoffset: offset }} />
            </svg>
            <div className="ring-num">
              <b>{ringNum}</b>
              <div className="ring-lbl">已掌握</div>
            </div>
          </div>
          <div className="hero-right">
            <div className="hero-lab">当前等级总词汇量</div>
            <div className="hero-big">{winTotal}</div>
            <div className="hero-lab" style={{ marginTop: 7 }}>
              当前等级 · <b>{myLevelCn}</b>
            </div>
          </div>
        </div>
        <div className="hero-stats">
          <div className="hstat">
            <b>{winMastered}</b>
            <span>当前等级已掌握</span>
          </div>
          <div className="hstat">
            <b>{mastered.size}</b>
            <span>累计掌握(全部)</span>
          </div>
        </div>
      </div>

      <div className="tile-grid">
        {tiles.map((t) => (
          <div key={t.key} className={'qtile ' + t.cls} onClick={t.onClick}>
            <div className="qicon">
              <TileIcon paths={TILE_ICONS[t.key]} />
            </div>
            <h3>{t.title}</h3>
            <div className="qsub">{t.sub}</div>
            <div className="qlink">{t.link}</div>
          </div>
        ))}
      </div>
    </section>
  )
}
