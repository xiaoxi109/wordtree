import { useCallback, useEffect, useMemo, useState } from 'react'
import { findWord, type GradeWindow } from './data/lexicon'
import { dueList, type SpacedState } from './lib/spaced'
import {
  db,
  loadSettings,
  loadAllProgress,
  seedUserDbIfEmpty,
  setMasteredFlag,
  recordReview as persistReview,
  type UserSettingsRow,
} from './lib/localDb'
import { speak } from './lib/speak'
import { StatusBar } from './components/StatusBar'
import { TabBar, type TabId } from './components/TabBar'
import { WordDetail } from './components/WordDetail'
import { FilterDrawer } from './components/FilterDrawer'
import { ChallengeOverlay } from './components/ChallengeOverlay'
import { Home } from './views/Home'
import { Browse } from './views/Browse'
import { Mastered } from './views/Mastered'
import { Review } from './views/Review'
import { Lesson } from './views/Lesson'
import { Settings } from './views/Settings'
import type { DisplayMode } from './components/WordCard'

type ScreenId = 'home' | 'browse' | 'mastered' | 'review' | 'lesson' | 'settings'

export default function App() {
  const [screen, setScreen] = useState<ScreenId>('home')
  const [ready, setReady] = useState(false)
  const [mastered, setMastered] = useState<Set<string>>(new Set())
  const [displayMode, setDisplayModeState] = useState<DisplayMode>('both')
  const [ladder, setLadderState] = useState<'cn' | 'en'>('cn')
  const [myLevelCn] = useState('小学')
  const [gradeWindow, setGradeWindow] = useState<GradeWindow>('myLevel')
  const [filterScenes, setFilterScenes] = useState<string[]>([])
  const [filterPos, setFilterPos] = useState<string[]>([])
  const [mfState, setMfState] = useState<'all' | 'un' | 'ma'>('all')
  const [spaced, setSpaced] = useState<SpacedState>({ streaks: {}, dueAt: {} })

  const [detailId, setDetailId] = useState<string | null>(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const [challengeOpen, setChallengeOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [toastTimer, setToastTimer] = useState<number | null>(null)

  /* ----------------- 从本地数据库水合（替代 localStorage） ----------------- */
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      await seedUserDbIfEmpty()
      const [settings, rows] = await Promise.all([loadSettings(), loadAllProgress()])
      if (cancelled) return
      const m = new Set<string>()
      const streaks: Record<string, number> = {}
      const dueAt: Record<string, number> = {}
      rows.forEach((r) => {
        if (r.mastered) m.add(r.wordId)
        streaks[r.wordId] = r.streak
        dueAt[r.wordId] = r.dueAt
      })
      if (settings) {
        setLadderState(settings.ladder)
        setDisplayModeState(settings.display)
      }
      setMastered(m)
      setSpaced({ streaks, dueAt })
      setReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  /* ----------------------------- 持久化 ----------------------------- */
  const persistSettings = useCallback(
    (patch: Partial<UserSettingsRow>) => {
      const row: UserSettingsRow = {
        id: 1,
        ladder: patch.ladder ?? ladder,
        myLevel: patch.myLevel ?? myLevelCn,
        display: patch.display ?? displayMode,
        updatedAt: Date.now(),
      }
      void db.userSettings.put(row)
    },
    [ladder, myLevelCn, displayMode],
  )

  const pushToast = useCallback((msg: string) => {
    setToast(msg)
    if (toastTimer) window.clearTimeout(toastTimer)
    const t = window.setTimeout(() => setToast(null), 1600)
    setToastTimer(t)
  }, [toastTimer])

  const switchTab = useCallback((s: ScreenId) => setScreen(s), [])
  const openDetail = useCallback((id: string) => setDetailId(id), [])
  const closeDetail = useCallback(() => setDetailId(null), [])

  const toggleMastered = useCallback(
    (id: string) => {
      const was = mastered.has(id)
      const next = new Set(mastered)
      if (was) {
        next.delete(id)
        pushToast('已回退为未掌握')
      } else {
        next.add(id)
        pushToast('已标记为已掌握')
      }
      setMastered(next)
      if (was) {
        // 取消掌握：重置连对并把该词置为现在可复习，保证本地状态与 DB 一致
        setSpaced((p) => ({
          streaks: { ...p.streaks, [id]: 0 },
          dueAt: { ...p.dueAt, [id]: Date.now() },
        }))
      }
      void setMasteredFlag(id, !was)
    },
    [mastered, pushToast],
  )

  const updateLadder = useCallback(
    (l: 'cn' | 'en') => {
      setLadderState(l)
      persistSettings({ ladder: l })
    },
    [persistSettings],
  )

  const updateDisplay = useCallback(
    (d: DisplayMode) => {
      setDisplayModeState(d)
      persistSettings({ display: d })
    },
    [persistSettings],
  )

  const challengeAnswered = useCallback(
    (id: string, correct: boolean) => {
      const next = new Set(mastered)
      if (correct) next.add(id)
      else next.delete(id)
      setMastered(next)
      void setMasteredFlag(id, correct)
    },
    [mastered],
  )

  /** 复习作答：落库 + 更新内存中的间隔重复状态与掌握集。 */
  const recordReview = useCallback(async (id: string, correct: boolean) => {
    const row = await persistReview(id, correct)
    setSpaced((p) => ({
      streaks: { ...p.streaks, [id]: row.streak },
      dueAt: { ...p.dueAt, [id]: row.dueAt },
    }))
    setMastered((prev) => {
      const has = prev.has(id)
      if (correct && !has) {
        const n = new Set(prev)
        n.add(id)
        return n
      }
      if (!correct && has) {
        const n = new Set(prev)
        n.delete(id)
        return n
      }
      return prev
    })
  }, [])

  const openFilter = useCallback(() => setFilterOpen(true), [])
  const closeFilter = useCallback(() => setFilterOpen(false), [])
  const applyFilter = useCallback(() => {
    setFilterOpen(false)
    pushToast('筛选已应用')
  }, [pushToast])
  const resetFilter = useCallback(() => {
    setFilterScenes([])
    setFilterPos([])
    setGradeWindow('myLevel')
  }, [])

  const toggleScene = useCallback(
    (s: string) => {
      setFilterScenes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))
    },
    [],
  )
  const togglePos = useCallback(
    (p: string) => {
      setFilterPos((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]))
    },
    [],
  )

  const startChallenge = useCallback(() => setChallengeOpen(true), [])
  const closeChallenge = useCallback(() => setChallengeOpen(false), [])

  const dueCount = useMemo(() => dueList(spaced.dueAt, Date.now()).length, [spaced.dueAt])
  const filterActive = filterScenes.length > 0 || filterPos.length > 0
  const detailWord = detailId ? findWord(detailId) : undefined

  if (!ready) {
    return (
      <div className="phone">
        <StatusBar />
        <div className="screen">
          <div className="box" style={{ textAlign: 'center', marginTop: 48 }}>
            加载本地数据中…
          </div>
        </div>
        <TabBar tab={'home' as TabId} onChange={() => {}} />
      </div>
    )
  }

  return (
    <div className="phone">
      <StatusBar />

      <Home
        active={screen === 'home'}
        mastered={mastered}
        gradeWindow={gradeWindow}
        myLevelCn={myLevelCn}
        dueCount={dueCount}
        onBrowse={() => switchTab('browse')}
        onReview={() => switchTab('review')}
        onLesson={() => switchTab('lesson')}
        onChallenge={startChallenge}
      />

      <Browse
        active={screen === 'browse'}
        displayMode={displayMode}
        setDisplayMode={updateDisplay}
        mfState={mfState}
        setMfState={setMfState}
        filterScenes={filterScenes}
        filterPos={filterPos}
        gradeWindow={gradeWindow}
        myLevelCn={myLevelCn}
        mastered={mastered}
        toggleMastered={toggleMastered}
        onOpen={openDetail}
        onSpeak={speak}
        onHome={() => switchTab('home')}
        onOpenFilter={openFilter}
        filterActive={filterActive}
      />

      <Mastered
        active={screen === 'mastered'}
        displayMode={displayMode}
        mastered={mastered}
        toggleMastered={toggleMastered}
        onOpen={openDetail}
        onSpeak={speak}
        onHome={() => switchTab('home')}
      />

      <Review
        active={screen === 'review'}
        mastered={mastered}
        spaced={spaced}
        onRecord={recordReview}
        onHome={() => switchTab('home')}
        onBrowse={() => switchTab('browse')}
        onSpeak={speak}
      />

      <Lesson active={screen === 'lesson'} onOpen={openDetail} onToast={pushToast} />

      <Settings
        active={screen === 'settings'}
        ladder={ladder}
        setLadder={updateLadder}
        myLevelCn={myLevelCn}
        masteredCount={mastered.size}
        onBrowseMastered={() => switchTab('mastered')}
        onChallenge={startChallenge}
        onToast={pushToast}
      />

      <TabBar tab={screen as TabId} onChange={(t) => switchTab(t as ScreenId)} />

      {detailWord && (
        <WordDetail
          w={detailWord}
          mastered={mastered.has(detailWord.id)}
          onClose={closeDetail}
          onToggle={toggleMastered}
          onSpeak={speak}
        />
      )}

      <FilterDrawer
        open={filterOpen}
        scenes={filterScenes}
        pos={filterPos}
        gradeWindow={gradeWindow}
        onToggleScene={toggleScene}
        onTogglePos={togglePos}
        onSetGrade={setGradeWindow}
        onClose={closeFilter}
        onApply={applyFilter}
        onReset={resetFilter}
      />

      <ChallengeOverlay
        open={challengeOpen}
        onClose={closeChallenge}
        onResult={(ok) => pushToast(ok ? '已晋升，进度更新' : '未达阈值，再复习一下')}
        onAnswered={challengeAnswered}
      />

      {toast && <div className="toast show">{toast}</div>}
    </div>
  )
}
