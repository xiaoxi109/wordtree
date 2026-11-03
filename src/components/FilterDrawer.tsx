import { GRADES, POS, POS_CN, SCENES, type GradeWindow } from '../data/lexicon'

interface Props {
  open: boolean
  scenes: string[]
  pos: string[]
  gradeWindow: GradeWindow
  onToggleScene: (s: string) => void
  onTogglePos: (p: string) => void
  onSetGrade: (g: GradeWindow) => void
  onClose: () => void
  onApply: () => void
  onReset: () => void
}

/** 筛选抽屉：场景（多选）/ 词性（多选）/ 等级（单选·软默认）。 */
export function FilterDrawer({
  open,
  scenes,
  pos,
  gradeWindow,
  onToggleScene,
  onTogglePos,
  onSetGrade,
  onClose,
  onApply,
  onReset,
}: Props) {
  if (!open) return null

  const gradeOpts: { v: GradeWindow; t: string }[] = [
    { v: 'myLevel', t: '我的等级及以下' },
    { v: 'all', t: '全部等级' },
    ...GRADES.map((g) => ({ v: g as GradeWindow, t: g })),
  ]

  return (
    <div className="mask drawer show" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet">
        <div className="topbar" style={{ marginBottom: 6 }}>
          <h1 style={{ fontSize: 17 }}>筛选</h1>
          <span className="pill" onClick={onClose}>✕</span>
        </div>

        <div className="ftitle">场景分类（可多选）</div>
        <div className="frow">
          {Object.keys(SCENES).map((s) => (
            <div
              key={s}
              className={'fchip' + (scenes.includes(s) ? ' on' : '')}
              onClick={() => onToggleScene(s)}
            >
              {SCENES[s].i} {SCENES[s].n}
            </div>
          ))}
        </div>

        <div className="ftitle">词性（可多选）</div>
        <div className="frow">
          {POS.map((p) => (
            <div
              key={p}
              className={'fchip' + (pos.includes(p) ? ' on' : '')}
              onClick={() => onTogglePos(p)}
            >
              {POS_CN[p] || p}
            </div>
          ))}
        </div>

        <div className="ftitle">等级（单选 · 软默认）</div>
        <div className="frow">
          {gradeOpts.map((o) => (
            <div
              key={o.v}
              className={'fchip single' + (gradeWindow === o.v ? ' on' : '')}
              onClick={() => onSetGrade(o.v)}
            >
              {o.t}
            </div>
          ))}
        </div>

        <div className="drawer-actions">
          <button className="btn-block ghost" onClick={onReset}>重置</button>
          <button className="btn-block" onClick={onApply}>应用</button>
        </div>
      </div>
    </div>
  )
}
