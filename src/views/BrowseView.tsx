import { useMemo, useState } from 'react'
import { ALL_WORDS } from '../data'
import type { CategoryId, Word } from '../data'
import { FilterBar, WordGrid } from '../components/word'
import { useLexiconVersion } from '../hooks/useLexicon'
import { useDisplayMode } from '../components/display'
import { countPos, matchesPos, type PosId } from '../lib/pos'

/**
 * 词库浏览页（二级页）：只按当前词库组织内容。
 * 输入关键词时检索当前词库全量并忽略筛选；清空后回到已掌握/未掌握 + 场景 + 词性筛选。
 */
export default function BrowseView({
  pool,
  masteredSet,
  onOpen,
  onToggleMastered,
}: {
  /** 外部词库词池；core 传 undefined，继续使用 ALL_WORDS。 */
  pool?: Word[]
  masteredSet: Set<string>
  onOpen: (w: Word) => void
  onToggleMastered: (w: Word) => void
}) {
  const [catFilter, setCatFilter] = useState<CategoryId | 'all'>('all')
  const [showUnmastered, setShowUnmastered] = useState(true)
  const [showMastered, setShowMastered] = useState(false)
  const [search, setSearch] = useState('')
  const [posFilter, setPosFilter] = useState<Set<PosId>>(() => new Set())
  const [displayMode, setDisplayMode] = useDisplayMode()

  // 词典扩展词懒加载完成后 +1，这里重新取一次全量
  const lexV = useLexiconVersion()
  const basePool = pool ?? ALL_WORDS

  const q = search.trim().toLowerCase()
  const searching = q.length > 0

  const base = useMemo(() => {
    return basePool.filter((w) => {
      if (!searching) {
        if (w.tier === 'extra') return false
        if (catFilter !== 'all' && (w.category ?? 'thinking') !== catFilter) return false
        if (!showUnmastered && !showMastered) return false
        if (!showUnmastered && showMastered && !masteredSet.has(w.word)) return false
        if (showUnmastered && !showMastered && masteredSet.has(w.word)) return false
        return true
      }
      return w.word.toLowerCase().includes(q) || w.meaning.includes(q) || w.ipa.toLowerCase().includes(q)
    })
  }, [basePool, lexV, searching, q, catFilter, showUnmastered, showMastered, masteredSet])

  const filtered = useMemo(
    () => (searching ? base : base.filter((w) => matchesPos(w, posFilter))),
    [base, posFilter, searching],
  )
  const posCounts = useMemo(() => countPos(base), [base])

  // 筛选条件签名（不含掌握状态）：只有筛选变化才重置列表的渐进加载批次
  const resetKey = [
    catFilter,
    showUnmastered,
    showMastered,
    search.trim().toLowerCase(),
    Array.from(posFilter).sort().join(','),
  ].join('|')

  return (
    <>
      <FilterBar
        catFilter={catFilter}
        setCatFilter={setCatFilter}
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

      {/* fixed 的 PageBar(~56px) 已由 main mt-[56px] 让开；
          FilterBar 含搜索行 + 掌握/显示语言常驻行（约 100px）需额外让开 */}
      <div className="pt-[116px]">
        <WordGrid
          words={filtered}
          masteredSet={masteredSet}
          mode={displayMode}
          onOpen={onOpen}
          onToggleMastered={onToggleMastered}
          resetKey={resetKey}
        />
      </div>
    </>
  )
}
