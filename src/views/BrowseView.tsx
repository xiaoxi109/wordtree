import { useMemo, useState } from 'react'
import { ALL_WORDS } from '../data'
import type { CategoryId, Level, Word } from '../data'
import { FilterBar, WordGrid } from '../components/word'
import { useDisplayMode } from '../components/display'
import { countPos, matchesPos, type PosId } from '../lib/pos'

/**
 * 词库浏览页（二级页）：可限定某个 CEFR 等级，也可作为全库搜索页。
 * 筛选条件、显示语言都在本页内，不再挤在首页。
 */
export default function BrowseView({
  level,
  masteredSet,
  onOpen,
  onToggleMastered,
}: {
  level?: Level
  masteredSet: Set<string>
  onOpen: (w: Word) => void
  onToggleMastered: (w: Word) => void
}) {
  const [levelFilter, setLevelFilter] = useState<Level | 'all'>(level ?? 'all')
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

  // 先应用等级/场景/掌握/搜索条件，再按词性过滤（词数统计基于前者）。
  const base = useMemo(() => {
    const q = search.trim().toLowerCase()
    return scope.filter((w) => {
      if (levelFilter !== 'all' && w.level !== levelFilter) return false
      if (catFilter !== 'all' && (w.category ?? 'thinking') !== catFilter) return false
      if (commonOnly && !w.common) return false
      if (!showUnmastered && !showMastered) return false
      if (!showUnmastered && showMastered && !masteredSet.has(w.word)) return false
      if (showUnmastered && !showMastered && masteredSet.has(w.word)) return false
      if (!q) return true
      return w.word.toLowerCase().includes(q) || w.meaning.includes(q) || w.ipa.toLowerCase().includes(q)
    })
  }, [scope, levelFilter, catFilter, commonOnly, showUnmastered, showMastered, masteredSet, search])

  const filtered = useMemo(() => base.filter((w) => matchesPos(w, posFilter)), [base, posFilter])
  const posCounts = useMemo(() => countPos(base), [base])

  return (
    <>
      <FilterBar
        levelFilter={levelFilter}
        setLevelFilter={setLevelFilter}
        hideLevel={!!level}
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
