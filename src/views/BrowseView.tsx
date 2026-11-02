import { useMemo, useState } from 'react'
import { ALL_WORDS } from '../data'
import type { CategoryId, Level, Word } from '../data'
import type { GradeRung, Route } from '../data/levels'
import { FilterBar, WordGrid } from '../components/word'
import { useDisplayMode } from '../components/display'
import { countPos, matchesPos, type PosId } from '../lib/pos'

/**
 * 词库浏览页（二级页）：按 route 自动切换等级筛选（中式/西式）。
 * 筛选条件、显示语言都在本页内，不再挤在首页。
 *
 * 激活窗口（软默认 B）：
 *   - 传了 activeLevels + defaultFilter='active' 时，初始显示窗口范围内的词
 *   - 用户可随时切换到「全部」，是"软默认"而非强制
 *   - 场景分组永远完整，等级筛选不切碎分组
 */
export default function BrowseView({
  route = 'level',
  level,
  masteredSet,
  onOpen,
  onToggleMastered,
  activeLevels,
  defaultFilter = 'all',
}: {
  route?: Route
  level?: Level
  masteredSet: Set<string>
  onOpen: (w: Word) => void
  onToggleMastered: (w: Word) => void
  /** 激活窗口：初始只显示这些等级及以下；不传则显示全部。是软默认，用户可放宽。 */
  activeLevels?: Level[]
  /** browse-all 模式下设为 'active' 可让初始范围限定在激活窗口 */
  defaultFilter?: 'all' | 'active'
}) {
  // route-aware 初始筛选：根据 route 类型选对应的等级字段
  const initialLevelFilter: Level | 'all' =
    level ||
    (route === 'level' && defaultFilter === 'active' && activeLevels?.length
      ? activeLevels[activeLevels.length - 1]
      : 'all')

  const initialGradeFilter: GradeRung | 'all' =
    route === 'grade' && defaultFilter === 'active' && activeLevels?.length
      ? 'all' // grade 路线下初始也显示全部，让软默认自然过滤
      : 'all'

  const [levelFilter, setLevelFilter] = useState<Level | 'all'>(initialLevelFilter)
  const [gradeFilter, setGradeFilter] = useState<GradeRung | 'all'>(initialGradeFilter)
  const [catFilter, setCatFilter] = useState<CategoryId | 'all'>('all')
  const [commonOnly, setCommonOnly] = useState(false)
  const [showUnmastered, setShowUnmastered] = useState(true)
  const [showMastered, setShowMastered] = useState(false)
  const [search, setSearch] = useState('')
  const [posFilter, setPosFilter] = useState<Set<PosId>>(() => new Set())
  const [displayMode, setDisplayMode] = useDisplayMode()

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
