import { useEffect, useMemo, useRef, useState } from 'react'
import { ALL_WORDS } from '../data'
import type { CategoryId, Level, Word } from '../data'
import type { GradeRung, LevelRung, Route } from '../data/levels'
import { rungToFilters } from '../data/levels'
import { FilterBar, WordGrid } from '../components/word'
import { useDisplayMode } from '../components/display'
import { countPos, matchesPos, type PosId } from '../lib/pos'

/**
 * 词库浏览页（二级页）：按 route 自动切换等级筛选（中式/西式）。
 * 筛选条件、显示语言都在本页内，不再挤在首页。
 *
 * 默认等级（首页「背词」入口）：
 *   - 传 currentRung + defaultFilter='active' 时，筛选条默认选中设置里的「我的等级」
 *   - 用户可随时切换到「全部」或其他等级；手动改过之后不再被设置的变更覆盖
 *   - 页面栈保活时，若设置里的等级 / 路线变化且用户未改过筛选，自动同步选中项
 */
export default function BrowseView({
  route = 'level',
  level,
  masteredSet,
  onOpen,
  onToggleMastered,
  activeLevels,
  defaultFilter = 'all',
  currentRung,
}: {
  route?: Route
  level?: Level
  masteredSet: Set<string>
  onOpen: (w: Word) => void
  onToggleMastered: (w: Word) => void
  /** 未传 currentRung 的旧入口兜底：初始取激活窗口的最高等级 */
  activeLevels?: Level[]
  /** browse-all 模式下设为 'active'，让等级筛选默认跟随设置里的「我的等级」 */
  defaultFilter?: 'all' | 'active'
  /** 设置里的「我的等级」（中式年级或西式等级） */
  currentRung?: GradeRung | LevelRung
}) {
  const rungFilters = useMemo(
    () => (currentRung ? rungToFilters(route, currentRung) : null),
    [route, currentRung],
  )
  // 指定等级的二级页（level 入口）优先用它自己的等级；词库页才跟随设置
  const rungDefault = !level && defaultFilter === 'active' ? rungFilters : null

  const fallbackLevelFilter: Level | 'all' =
    route === 'level' && defaultFilter === 'active' && activeLevels?.length
      ? activeLevels[activeLevels.length - 1]
      : 'all'
  const initialLevelFilter: Level | 'all' = level ?? rungDefault?.levelFilter ?? fallbackLevelFilter
  const initialGradeFilter: GradeRung | 'all' = rungDefault?.gradeFilter ?? 'all'

  const [levelFilter, setLevelFilter] = useState<Level | 'all'>(initialLevelFilter)
  const [gradeFilter, setGradeFilter] = useState<GradeRung | 'all'>(initialGradeFilter)
  const [catFilter, setCatFilter] = useState<CategoryId | 'all'>('all')
  const [commonOnly, setCommonOnly] = useState(false)
  const [showUnmastered, setShowUnmastered] = useState(true)
  const [showMastered, setShowMastered] = useState(false)
  const [search, setSearch] = useState('')
  const [posFilter, setPosFilter] = useState<Set<PosId>>(() => new Set())
  const [displayMode, setDisplayMode] = useDisplayMode()

  // 页面栈保活：设置变更时同步默认等级，前提是用户没手动改过该项筛选
  const prevRungDefault = useRef(rungDefault)
  useEffect(() => {
    const prev = prevRungDefault.current
    if (prev && rungDefault) {
      setLevelFilter((v) => (v === prev.levelFilter ? rungDefault.levelFilter : v))
      setGradeFilter((v) => (v === prev.gradeFilter ? rungDefault.gradeFilter : v))
    }
    prevRungDefault.current = rungDefault
  }, [rungDefault])

  const scope = useMemo(
    () => (level ? ALL_WORDS.filter((w) => w.level === level) : ALL_WORDS),
    [level],
  )

  // 双轨等级筛选：route === 'level' 用 levelFilter；route === 'grade' 用 gradeFilter
  const base = useMemo(() => {
    const q = search.trim().toLowerCase()
    return scope.filter((w) => {
      if (route === 'level') {
        if (levelFilter !== 'all' && w.level !== levelFilter) return false
      } else {
        if (gradeFilter !== 'all' && w.grade !== gradeFilter) return false
      }
      if (catFilter !== 'all' && (w.category ?? 'thinking') !== catFilter) return false
      if (commonOnly && !w.common) return false
      if (!showUnmastered && !showMastered) return false
      if (!showUnmastered && showMastered && !masteredSet.has(w.word)) return false
      if (showUnmastered && !showMastered && masteredSet.has(w.word)) return false
      if (!q) return true
      return w.word.toLowerCase().includes(q) || w.meaning.includes(q) || w.ipa.toLowerCase().includes(q)
    })
  }, [scope, route, levelFilter, gradeFilter, catFilter, commonOnly, showUnmastered, showMastered, masteredSet, search])

  const filtered = useMemo(() => base.filter((w) => matchesPos(w, posFilter)), [base, posFilter])
  const posCounts = useMemo(() => countPos(base), [base])

  return (
    <>
      <FilterBar
        route={route}
        levelFilter={levelFilter}
        setLevelFilter={setLevelFilter}
        gradeFilter={gradeFilter}
        setGradeFilter={(v) => setGradeFilter(v as GradeRung | 'all')}
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

      {/* fixed 的 PageBar(~56px) 已由 main mt-[56px] 让开；FilterBar(~72px) 需额外让开 */}
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
