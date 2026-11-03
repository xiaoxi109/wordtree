import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'
import { App as CapApp } from '@capacitor/app'
import { runBack } from './lib/back'
import { LEVELS } from './data'
import type { Level, Word } from './data'
import { GRADES, type GradeId } from './data/grades'
import {
  DEFAULT_GRADE,
  DEFAULT_LEVEL,
  activeLevels,
  gradeToLevel,
  type Route,
  type GradeRung,
  type LevelRung,
} from './data/levels'
import { useSpeech } from './hooks/useSpeech'
import HomeDashboard from './views/HomeDashboard'
import BrowseView from './views/BrowseView'
import GradeView from './views/GradeView'
import SettingsView, { LlmSettingsView } from './views/SettingsView'
import StudyView from './views/StudyView'
import AiView from './views/AiView'
import { WordModal } from './components/word'
import { AdvancementQuiz } from './components/AdvancementQuiz'
import { checkAdvancement } from './lib/advancement'
import { ArrowLeftIcon, HomeIcon, SparklesIcon, UserIcon, CheckIcon, XIcon } from './components/icons'

type View = 'home' | 'ai' | 'me'
type Theme = 'light' | 'dark'

/**
 * 全局页面栈只承载全屏沉浸式二级页：
 * 大模型设置、等级词表、年级词表、搜索、AI 课程阅读、闯关晋级、
 * 背词浏览（BrowseView 全场景）、复习（StudyView）。
 * 生成条件 / 课程集操作等轻量交互用底部 Sheet / ActionSheet，不进栈。
 */
type Page =
  | { kind: 'llm' }
  | { kind: 'search' }
  | { kind: 'level'; level: Level }
  | { kind: 'grade'; grade: GradeId }
  | { kind: 'browse-all' }
  | { kind: 'study' }
  | { kind: 'ai-reader'; lessonId: string }
  | { kind: 'quiz' }

/**
 * AI 课程在 Web 与原生端都开放；Web 端能否请求成功取决于接口是否允许跨域，
 * 原生 APK 走 CapacitorHttp 不受此限制。
 */
const AI_ENABLED = true

/* ----------------------------- Toast ----------------------------- */
type Toast = { id: number; msg: string; type: 'success' | 'error' | 'info' }
let toastId = 0

function ToastContainer({ toasts, offset = '12px' }: { toasts: Toast[]; offset?: string }) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[60] flex flex-col items-center gap-2 px-4"
      style={{ top: `calc(env(safe-area-inset-top) + ${offset})` }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex max-w-sm animate-toast-in items-center gap-2.5 rounded-[18px] border border-white/10 bg-slate-900/95 px-4 py-3 text-sm font-medium text-white shadow-float backdrop-blur-xl dark:bg-slate-800/95"
        >
          <span
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
              t.type === 'success'
                ? 'bg-accent-lime/20 text-accent-lime'
                : t.type === 'error'
                  ? 'bg-rose-400/20 text-rose-300'
                  : 'bg-white/10 text-white'
            }`}
          >
            {t.type === 'success' && <CheckIcon width={14} height={14} />}
            {t.type === 'error' && <XIcon width={14} height={14} />}
            {t.type === 'info' && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
          </span>
          <span className="min-w-0">{t.msg}</span>
        </div>
      ))}
    </div>
  )
}

/* ----------------------------- App ----------------------------- */
export default function App() {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('lexicore-theme')
    if (saved) return saved as Theme
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })
  const [route, setRoute] = useState<Route>(() => {
    return (localStorage.getItem('lexicore-route') as Route) || 'level'
  })
  const [currentRung, setCurrentRung] = useState<GradeRung | LevelRung>(() => {
    const saved = localStorage.getItem('lexicore-rung')
    if (saved) return saved as GradeRung | LevelRung
    return route === 'grade' ? DEFAULT_GRADE : DEFAULT_LEVEL
  })
  const [masteredArr, setMasteredArr] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('lexicore-mastered') || '[]')
    } catch {
      return []
    }
  })
  const [toasts, setToasts] = useState<Toast[]>([])
  const [view, setView] = useState<View>('home')

  /** 连续学习天数：每次标记掌握 / 完成复习 → 今天日期 vs yesterday 比对 */
  const [streak, setStreak] = useState<number>(() => {
    const saved = localStorage.getItem('lexicore-streak')
    if (!saved) return 0
    try {
      const { count, lastDate } = JSON.parse(saved) as { count: number; lastDate: string }
      const today = new Date().toISOString().slice(0, 10)
      const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
      if (lastDate === today) return count
      if (lastDate === yesterday) return count
      return 0
    } catch {
      return 0
    }
  })

  /** 记录一次学习行为 → 更新连续天数 */
  const recordStudyDay = useCallback(() => {
    const today = new Date().toISOString().slice(0, 10)
    setStreak((prev) => {
      const saved = localStorage.getItem('lexicore-streak')
      let lastDate = ''
      let count = 0
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as { count: number; lastDate: string }
          count = parsed.count
          lastDate = parsed.lastDate
        } catch {
          /* ignore */
        }
      }
      if (lastDate === today) return prev // 今天已记过
      const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
      const newCount = lastDate === yesterday ? count + 1 : 1
      localStorage.setItem('lexicore-streak', JSON.stringify({ count: newCount, lastDate: today }))
      return newCount
    })
  }, [])

  // 首次进入首页、闯关成功、完成一轮复习 → 都算"今日学习"
  useEffect(() => {
    recordStudyDay()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 已访问过的主页面：首次进入才挂载，之后常驻（保留筛选与滚动位置） */
  const [visited, setVisited] = useState<Set<View>>(() => new Set<View>(['home']))
  const viewRef = useRef(view)
  viewRef.current = view
  const scrollRef = useRef<Record<View, number>>({ home: 0, ai: 0, me: 0 })
  const rootScrollRef = useRef<HTMLDivElement>(null)

  const [pages, setPages] = useState<Page[]>([])
  const pagesRef = useRef(pages)
  pagesRef.current = pages
  /** 每进一层页面记录当时的滚动位置，返回时恢复 */
  const pageScrollRef = useRef<number[]>([])

  /** 单词详情走弹层（不跳页）：点哪张卡就弹哪个词，关掉仍停在原列表位置 */
  const [wordModalStack, setWordModalStack] = useState<Word[]>([])
  const openWord = useCallback(
    (w: Word) => setWordModalStack((prev) => [...prev, w]),
    [],
  )
  const popWordModal = useCallback(() => {
    setWordModalStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : []))
  }, [])
  const closeWordModal = useCallback(() => setWordModalStack([]), [])

  const pushPage = useCallback((page: Page) => {
    pageScrollRef.current.push(rootScrollRef.current?.scrollTop ?? 0)
    setPages((prev) => [...prev, page])
    requestAnimationFrame(() => {
      if (rootScrollRef.current) rootScrollRef.current.scrollTop = 0
    })
  }, [])

  const popPage = useCallback(() => {
    const y = pageScrollRef.current.pop() ?? 0
    setPages((prev) => prev.slice(0, -1))
    requestAnimationFrame(() => {
      if (rootScrollRef.current) rootScrollRef.current.scrollTop = y
    })
  }, [])

  /**
   * AI 课程阅读页走同一条页面栈，由栈顶驱动 AiView 显示阅读器；返回一律 popPage。
   * 轻量交互（生成条件 / 课程集操作 / 听单切换）留在 AiView 内部处理，不入栈。
   */
  const aiReaderLessonId = useMemo<string | null>(() => {
    const top = pages[pages.length - 1]
    return top?.kind === 'ai-reader' ? top.lessonId : null
  }, [pages])
  const aiPageOpen = aiReaderLessonId !== null

  const switchView = useCallback((next: View) => {
    if (next === viewRef.current) return
    scrollRef.current[viewRef.current] = rootScrollRef.current?.scrollTop ?? 0
    setVisited((prev) => (prev.has(next) ? prev : new Set(prev).add(next)))
    setView(next)
    requestAnimationFrame(() => {
      if (rootScrollRef.current) {
        rootScrollRef.current.scrollTop = scrollRef.current[next] ?? 0
      }
    })
  }, [])

  const masteredSet = useMemo(() => new Set(masteredArr), [masteredArr])
  const toggleTheme = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), [])

  // App 启动即预加载 Piper 模型（不播放）。模型尽早就绪，可使后续用户手势内的
  // 朗读同步播放，避免首次 await 加载模型后 audio.play() 失去手势被 Android WebView 拦截。
  const { preload } = useSpeech()
  useEffect(() => {
    preload().catch(() => {})
  }, [preload])

  const toggleMastered = useCallback((word: string) => {
    setMasteredArr((prev) => {
      const isAdd = !prev.includes(word)
      if (isAdd) recordStudyDay() // 标记掌握 → 今日学习
      return isAdd ? [...prev, word] : prev.filter((w) => w !== word)
    })
  }, [recordStudyDay])

  /** 批量增删掌握词（AI 教程点词三态回流 / 导入进度）。 */
  const applyMastered = useCallback((words: string[], mode: 'add' | 'remove') => {
    setMasteredArr((prev) => {
      const next = new Set(prev)
      for (const w of words) {
        if (mode === 'add') next.add(w)
        else next.delete(w)
      }
      if (next.size === prev.length) return prev
      return Array.from(next)
    })
  }, [])

  const importMastered = useCallback((words: string[]) => {
    setMasteredArr((prev) => Array.from(new Set([...prev, ...words])))
  }, [])

  const pushToast = useCallback((msg: string, type: Toast['type'] = 'success') => {
    const id = ++toastId
    setToasts((prev) => [...prev, { id, msg, type }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2600)
  }, [])

  useEffect(() => {
    const dark = theme === 'dark'
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('lexicore-theme', theme)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0e100c' : '#f6f3ea')

    // Android 状态栏跟随应用内主题：深色→浅色图标，浅色→深色图标。
    // 失败时静默忽略（Web 端 / 旧系统不支持）。
    if (Capacitor.isNativePlatform()) {
      StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => {})
      StatusBar.setBackgroundColor({ color: dark ? '#0e100c' : '#f6f3ea' }).catch(() => {})
    }
  }, [theme])

  useEffect(() => {
    localStorage.setItem('lexicore-mastered', JSON.stringify(masteredArr))
  }, [masteredArr])

  useEffect(() => {
    localStorage.setItem('lexicore-route', route)
  }, [route])

  useEffect(() => {
    localStorage.setItem('lexicore-rung', currentRung)
  }, [currentRung])

  /**
   * 激活窗口（软默认筛选 B）：
   *   - 用户选了路线 + 我的等级后，词表默认只显示当前等级及以下的词
   *   - 等级作为"软默认筛选"，不切碎场景分组（BrowseView 自己按 category 分组）
   *   - 用户可以一键放宽到「全部」（BrowseView 的 levelFilter = 'all'）
   *   - 注：activeLevelsList 过滤掉 C1/C2（词库上限 B2）
   */
  const activeLevelsList = useMemo(
    () => activeLevels(route, currentRung).filter((l) => l !== 'C1' && l !== 'C2') as Level[],
    [route, currentRung],
  )

  /** 晋级检测：当前激活窗口内全部掌握 + 有下一级可去 */
  const advancement = useMemo(
    () => checkAdvancement(route, currentRung, new Set(masteredArr)),
    [route, currentRung, masteredArr],
  )

  /** AiView 用的目标 CEFR 等级：晋级目标 → 否则取激活窗口最高等级 */
  const aiTargetLevel = useMemo<Level | null>(() => {
    if (!advancement.nextRung) {
      // 没下一级 → 取当前激活窗口最高等级
      const highest = activeLevelsList[activeLevelsList.length - 1]
      return highest ?? null
    }
    // grade 路线 → 映射
    const levelRung = route === 'grade'
      ? gradeToLevel(advancement.nextRung as any)
      : advancement.nextRung
    if (!levelRung || levelRung === 'C1' || levelRung === 'C2') return null
    return levelRung as Level
  }, [advancement.nextRung, route, activeLevelsList])

  // 安卓系统返回键：先交给弹层 / 阅读器，再逐层退页面栈，然后回首页，最后退出应用
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let remove: (() => void) | undefined
    void CapApp.addListener('backButton', () => {
      if (runBack()) return
      if (pagesRef.current.length > 0) {
        popPage()
        return
      }
      if (viewRef.current !== 'home') {
        switchView('home')
        return
      }
      void CapApp.exitApp()
    }).then((handle) => {
      remove = () => void handle.remove()
    })
    return () => remove?.()
  }, [popPage, switchView])

  const navItems: { id: View; label: string; icon: (size: number) => React.ReactNode }[] = [
    { id: 'home', label: '首页', icon: (s) => <HomeIcon width={s} height={s} /> },
    { id: 'ai', label: 'AI', icon: (s) => <SparklesIcon width={s} height={s} /> },
    { id: 'me', label: '我的', icon: (s) => <UserIcon width={s} height={s} /> },
  ]

  const pageMeta = useMemo(() => {
    const page = pages[pages.length - 1]
    if (!page) return null
    switch (page.kind) {
      case 'llm':
        return { title: '大模型设置', sub: 'OpenAI 兼容接口 · Key 不出设备' }
      case 'search':
        return { title: '搜索单词', sub: '全部分级词库' }
      case 'level': {
        const l = LEVELS.find((x) => x.id === page.level)!
        return { title: `西式 ${l.label}`, sub: l.desc }
      }
      case 'grade': {
        const g = GRADES.find((x) => x.id === page.grade)!
        return { title: g.label, sub: g.desc }
      }
      case 'browse-all':
        return { title: '全部词库', sub: '按场景分组 · 可叠加等级 / 词性筛选' }
      case 'study':
        return { title: '复习', sub: '间隔重复队列 · 到期即练' }
      case 'ai-reader':
        return { title: '课程阅读', sub: '点或长按单词查词，读完自动记录' }
      case 'quiz':
        return { title: '晋级闯关', sub: '抽检当前级单词 · 通过可晋级' }
    }
  }, [pages])

  const renderPage = (page: Page) => {
    switch (page.kind) {
      case 'llm':
        return <LlmSettingsView onToast={pushToast} />
      case 'search':
        return (
          <BrowseView
            route={route}
            masteredSet={masteredSet}
            onOpen={openWord}
            onToggleMastered={(w) => toggleMastered(w.word)}
            activeLevels={activeLevelsList}
          />
        )
      case 'browse-all':
        return (
          <BrowseView
            route={route}
            masteredSet={masteredSet}
            onOpen={openWord}
            onToggleMastered={(w) => toggleMastered(w.word)}
            activeLevels={activeLevelsList}
            defaultFilter="active"
          />
        )
      case 'study':
        return (
          <StudyView
            route={route}
            masteredSet={masteredSet}
            onApplyMark={applyMastered}
            active={false /* 页面栈内不走 tab，主动管理 */}
          />
        )
      case 'level':
        return (
          <BrowseView
            route={route}
            level={page.level}
            masteredSet={masteredSet}
            onOpen={openWord}
            onToggleMastered={(w) => toggleMastered(w.word)}
            activeLevels={activeLevelsList}
          />
        )
      case 'grade':
        return (
          <GradeView
            grade={page.grade}
            masteredSet={masteredSet}
            onOpen={openWord}
            onToggleMastered={(w) => toggleMastered(w.word)}
          />
        )
      // AI 阅读全屏页由 AiView 内部按 setId 渲染，这里只登记页面层级
      case 'ai-reader':
        return null
      case 'quiz':
        return (
          <AdvancementQuiz
            route={route}
            currentRung={currentRung}
            masteredSet={new Set(masteredArr)}
            onComplete={(passed, nextRung) => {
              if (passed && nextRung) {
                setCurrentRung(nextRung)
                pushToast(`🎉 晋级到 ${nextRung}`, 'success')
              } else if (!passed) {
                pushToast('闯关未通过，继续加油 💪', 'info')
              }
              popPage()
            }}
            onCancel={popPage}
          />
        )
    }
  }

  return (
    <div
      ref={rootScrollRef}
      className={`h-screen overflow-y-auto bg-transparent text-slate-900 transition-colors dark:text-slate-100 ${theme === 'dark' ? 'dark' : ''}`}
    >
      <main
        className={`mx-auto max-w-5xl px-4 pt-[calc(env(safe-area-inset-top)+16px)] ${
          pageMeta ? 'mt-[56px]' : ''
        } ${
          pages[pages.length - 1]?.kind === 'study'
            ? 'pb-[env(safe-area-inset-bottom)]'
            : 'pb-[calc(env(safe-area-inset-bottom)+78px)]'
        }`}
      >
        {/* 二级 / 三级页面：顶部返回栏 fixed 吸顶，搜索/筛选 FilterBar 接着吸在下方 */}
        {pageMeta && (
          <div
            className="fixed inset-x-0 top-[env(safe-area-inset-top)] z-30 border-b border-slate-900/[0.06] bg-[#f6f3ea]/95 backdrop-blur-xl dark:border-white/10 dark:bg-[#0e100c]/95"
          >
            <div className="mx-auto max-w-5xl px-4 pb-2 pt-3">
              <div className="flex items-center gap-2.5">
                <button onClick={popPage} aria-label="返回" className="icon-btn !h-9 !w-9">
                  <ArrowLeftIcon width={18} height={18} />
                </button>
                <div className="min-w-0">
                  <h1 className="truncate text-[16px] font-bold tracking-tight text-slate-900 dark:text-slate-50">
                    {pageMeta.title}
                  </h1>
                  <p className="mt-0.5 truncate text-[11px] text-slate-400">{pageMeta.sub}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 三个主页面首次进入后常驻（hidden 切换）：保留筛选、滚动与 AI 生成进度 */}
        <div className={pageMeta && !aiPageOpen ? 'hidden' : ''}>
          <div className={view === 'home' ? '' : 'hidden'} aria-hidden={view !== 'home'}>
            {visited.has('home') && (
              <HomeDashboard
                masteredSet={masteredSet}
                masteredArr={masteredArr}
                route={route}
                currentRung={currentRung}
                activeLevels={activeLevelsList}
                canAdvance={advancement.canAdvance}
                onOpenBrowse={() => pushPage({ kind: 'browse-all' })}
                onOpenStudy={() => pushPage({ kind: 'study' })}
                onOpenSearch={() => pushPage({ kind: 'search' })}
                onStartQuiz={() => pushPage({ kind: 'quiz' })}
                streak={streak}
              />
            )}
          </div>

          <div className={view === 'ai' ? '' : 'hidden'} aria-hidden={view !== 'ai'}>
            {visited.has('ai') && (
              <AiView
                masteredSet={masteredSet}
                onApplyMark={applyMastered}
                onToast={pushToast}
                active={view === 'ai'}
                readerLessonId={aiReaderLessonId}
                onOpenReader={(lessonId) => pushPage({ kind: 'ai-reader', lessonId })}
                onBack={popPage}
                activeLevels={activeLevelsList}
                targetLevel={aiTargetLevel}
              />
            )}
          </div>

          <div className={view === 'me' ? '' : 'hidden'} aria-hidden={view !== 'me'}>
            {visited.has('me') && (
              <SettingsView
                theme={theme}
                aiEnabled={AI_ENABLED}
                masteredCount={masteredArr.length}
                onToggleTheme={toggleTheme}
                onOpenLlm={() => pushPage({ kind: 'llm' })}
                onToast={pushToast}
                onImport={importMastered}
                route={route}
                setRoute={setRoute}
                currentRung={currentRung}
                setCurrentRung={setCurrentRung}
              />
            )}
          </div>
        </div>

        {/* 页面栈：只显示栈顶，其余保活（保留筛选与已加载的列表） */}
        {pages.map((page, i) => (
          <div key={i} className={i === pages.length - 1 ? '' : 'hidden'}>
            {renderPage(page)}
          </div>
        ))}
      </main>

      {/* 底部通栏导航：整条贴着屏幕底边固定，二级页内隐藏 */}
      {!pageMeta && (
        <nav
          className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-900/[0.08] bg-[#f6f3ea]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl dark:border-white/10 dark:bg-[#0e100c]/95"
          aria-label="底部导航"
        >
          <div className="mx-auto flex h-[58px] max-w-5xl items-stretch px-1">
            {navItems.map((item) => (
              <NavBtn
                key={item.id}
                active={view === item.id}
                onClick={() => switchView(item.id)}
                icon={item.icon(22)}
                label={item.label}
              />
            ))}
          </div>
        </nav>
      )}

      {wordModalStack.length > 0 && (
        <WordModal
          word={wordModalStack[wordModalStack.length - 1]}
          mastered={masteredSet.has(wordModalStack[wordModalStack.length - 1].word)}
          onClose={closeWordModal}
          onPop={wordModalStack.length > 1 ? popWordModal : undefined}
          onToggleMastered={() => toggleMastered(wordModalStack[wordModalStack.length - 1].word)}
          onOpenWord={(w) => openWord(w)}
        />
      )}

      <ToastContainer toasts={toasts} />

    </div>
  )
}

function NavBtn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`relative flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-semibold transition duration-200 active:scale-95 ${
        active ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-500'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}
