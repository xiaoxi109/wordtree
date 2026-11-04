import { useMemo, useState } from 'react'
import type { CategoryId, Word } from '../data'
import { GRADE_STYLE, GRADES, getWordsByGrade, type GradeId } from '../data/grades'
import { FilterBar, WordGrid } from '../components/word'
import { useDisplayMode } from '../components/display'
import { countPos, matchesPos, type PosId } from '../lib/pos'

/**
 * 人教版单年级词表（二级页）：年级 → 词条。
 * 搜索、场景、掌握状态与词性筛选都在本页完成。
 */
export default function GradeView({
  grade,
  masteredSet,
  onOpen,
  onToggleMastered,
}: {
  grade: GradeId
  masteredSet: Set<string>
  onOpen: (w: Word) => void
  onToggleMastered: (w: Word) => void
}) {
  const [catFilter, setCatFilter] = useState<CategoryId | 'all'>('all')
  const [commonOnly, setCommonOnly] = useState(false)
  const [showUnmastered, setShowUnmastered] = useState(true)
  const [showMastered, setShowMastered] = useState(false)
  const [search, setSearch] = useState('')
  const [posFilter, setPosFilter] = useState<Set<PosId>>(() => new Set())
  const [displayMode, setDisplayMode] = useDisplayMode()

  const byGrade = getWordsByGrade()
  const scope = byGrade[grade]
  const meta = GRADES.find((g) => g.id === grade)!
  const style = GRADE_STYLE[grade]

  const base = useMemo(() => {
    const q = search.trim().toLowerCase()
    return scope.filter((w) => {
      if (catFilter !== 'all' && (w.category ?? 'thinking') !== catFilter) return false
      if (commonOnly && !w.common) return false
      if (!showUnmastered && !showMastered) return false
      if (!showUnmastered && showMastered && !masteredSet.has(w.word)) return false
      if (showUnmastered && !showMastered && masteredSet.has(w.word)) return false
      if (!q) return true
      return w.word.toLowerCase().includes(q) || w.meaning.includes(q) || w.ipa.toLowerCase().includes(q)
    })
  }, [scope, catFilter, commonOnly, showUnmastered, showMastered, masteredSet, search])

  const filtered = useMemo(() => base.filter((w) => matchesPos(w, posFilter)), [base, posFilter])
  const posCounts = useMemo(() => countPos(base), [base])
  const done = scope.filter((w) => masteredSet.has(w.word)).length
  const pct = scope.length ? Math.round((done / scope.length) * 100) : 0

  return (
    <>
      <section className="surface mb-3 flex items-center gap-3 px-3 py-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] text-sm font-bold ${style.badge}`}>
          {meta.label}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-[13px] font-bold text-slate-800 dark:text-slate-100">{meta.desc}</p>
            <p className="shrink-0 text-[11px] font-semibold text-slate-400">
              {done}/{scope.length} · {pct}%
            </p>
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-900/[0.07] dark:bg-white/10">
            <div className={`h-full rounded-full transition-all duration-500 ease-spring ${style.bar}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
      </section>

      <FilterBar
        levelFilter="all"
        setLevelFilter={() => {}}
        hideLevel
        catFilter={catFilter}
        setCatFilter={setCatFilter}
        commonOnly={commonOnly}
        setCommonOnly={setCommonOnly}
        search={search}
        setSearch={setSearch}
        showMasterChips
        showUnmastered={showUnmastered}
        setShowUnmastered={setShowUnmastered}
        showMastered={showMastered}
        setShowMastered={setShowMastered}
        displayMode={displayMode}
        setDisplayMode={setDisplayMode}
        posFilter={posFilter}
        setPosFilter={setPosFilter}
        posCounts={posCounts}
      />

      {/* FilterBar 是 fixed(~72px)，需额外让开，否则首批词卡被压住 */}
      <div className="pt-[76px]">
        <WordGrid
          words={filtered}
          masteredSet={masteredSet}
          mode={displayMode}
          onOpen={onOpen}
          onToggleMastered={onToggleMastered}
        />
      </div>
    </>
  )
}
