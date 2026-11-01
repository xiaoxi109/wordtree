import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'
import { App as CapApp } from '@capacitor/app'
import { runBack } from './lib/back'
import { LEVELS } from './data'
import type { Level, Word } from './data'
import { GRADES, type GradeId } from './data/grades'
import { useSpeech } from './hooks/useSpeech'
import HomeView from './views/HomeView'
import GradesView from './views/GradesView'
import BrowseView from './views/BrowseView'
import GradeView from './views/GradeView'
import SettingsView, { LlmSettingsView } from './views/SettingsView'
import StudyView from './views/StudyView'
import AiView from './views/AiView'
import { WordModal } from './components/word'
import {
  ArrowLeftIcon,
  BookOpenIcon,
  CheckIcon,
  HomeIcon,
  ListIcon,
  SparklesIcon,
  UserIcon,
  XIcon,
} from './components/icons'

type View = 'home' | 'grades' | 'learn' | 'ai' | 'me'
type Theme = 'light' | 'dark'

/**
 * 全局页面栈只承载全屏沉浸式二级页：
 * 大模型设置、等级词表、年级词表、搜索、AI 课程阅读。
 * 听单已内联到阅读器（mode: read|listen），无需独立栈。
 * 生成条件 / 课程集操作等轻量交互用底部 Sheet / ActionSheet，不进栈。
 */
type Page =
  | { kind: 'llm' }
  | { kind: 'search' }
  | { kind: 'level'; level: Level }
  | { kind: 'grade'; grade: GradeId }
  | { kind: 'ai-reader'; setId: string }

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
  const [masteredArr, setMasteredArr] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('lexicore-mastered') || '[]')
    } catch {
      return []
    }
  })
  const [toasts, setToasts] = useState<Toast[]>([])
  const [view, setView] = useState<View>('home')

  /** 已访问过的主页面：首次进入才挂载，之后常驻（保留筛选与滚动位置） */
  const [visited, setVisited] = useState<Set<View>>(() => new Set<View>(['home']))
  const viewRef = useRef(view)
  viewRef.current = view
  const scrollRef = useRef<Record<View, number>>({ home: 0, grades: 0, learn: 0, ai: 0, me: 0 })
  const rootScrollRef = useRef<HTMLDivElement>(null)

  const [pages, setPages] = useState<Page[]>([])
  const pagesRef = useRef(pages)
  pagesRef.current = pages
  /** 每进一层页面记录当时的滚动位置，返回时恢复 */
  const pageScrollRef = useRef<number[]>([])

  /** 单词详情走弹层（不跳页）：点哪张卡就弹哪个词，关掉仍停在原列表位置 */
  const [wordModal, setWordModal] = useState<Word | null>(null)
  const openWord = useCallback((w: Word) => setWordModal(w), [])

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
  const aiReaderSetId = useMemo<string | null>(() => {
    const top = pages[pages.length - 1]
    return top?.kind === 'ai-reader' ? top.setId : null
  }, [pages])
  const aiPageOpen = aiReaderSetId !== null

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
    setMasteredArr((prev) => (prev.includes(word) ? prev.filter((w) => w !== word) : [...prev, word]))
  }, [])

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
    { id: 'home', label: 'CEFR', icon: (s) => <HomeIcon width={s} height={s} /> },
    { id: 'grades', label: '人教', icon: (s) => <ListIcon width={s} height={s} /> },
    { id: 'learn', label: '学习', icon: (s) => <BookOpenIcon width={s} height={s} /> },
    { id: 'ai', label: 'AI', icon: (s) => <SparklesIcon width={s} height={s} /> },
    { id: 'me', label: '我', icon: (s) => <UserIcon width={s} height={s} /> },
  ]

  const pageMeta = useMemo(() => {
    const page = pages[pages.length - 1]
    if (!page) return null
    switch (page.kind) {
      case 'llm':
        return { title: '大模型设置', sub: 'OpenAI 兼容接口 · Key 不出设备' }
      case 'search':
        return { title: '搜索单词', sub: '全部 CEFR 分级词库' }
      case 'level': {
        const l = LEVELS.find((x) => x.id === page.level)!
        return { title: `CEFR ${l.label}`, sub: l.desc }
      }
      case 'grade': {
        const g = GRADES.find((x) => x.id === page.grade)!
        return { title: g.label, sub: g.desc }
      }
      case 'ai-reader':
        return { title: '课程阅读', sub: '点或长按单词查词，读完自动记录' }
    }
  }, [pages])

  const renderPage = (page: Page) => {
    switch (page.kind) {
      case 'llm':
        return <LlmSettingsView onToast={pushToast} />
      case 'search':
        return (
          <BrowseView
            masteredSet={masteredSet}
            onOpen={openWord}
            onToggleMastered={(w) => toggleMastered(w.word)}
          />
        )
      case 'level':
        return (
          <BrowseView
            level={page.level}
            masteredSet={masteredSet}
            onOpen={openWord}
            onToggleMastered={(w) => toggleMastered(w.word)}
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
    }
  }

  return (
    <div
      ref={rootScrollRef}
      className={`h-screen overflow-y-auto bg-transparent text-slate-900 transition-colors dark:text-slate-100 ${theme === 'dark' ? 'dark' : ''}`}
    >
      <main
        className={`mx-auto max-w-5xl px-4 pb-[calc(env(safe-area-inset-bottom)+78px)] pt-[calc(env(safe-area-inset-top)+16px)] ${
          pageMeta ? 'mt-[56px]' : ''
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

        {/* 五个主页面首次进入后常驻（hidden 切换）：保留筛选、滚动与 AI 生成进度 */}
        <div className={pageMeta && !aiPageOpen ? 'hidden' : ''}>
          <div className={view === 'home' ? '' : 'hidden'} aria-hidden={view !== 'home'}>
            {visited.has('home') && (
              <HomeView
                masteredSet={masteredSet}
                onOpenLevel={(level) => pushPage({ kind: 'level', level })}
                onOpenSearch={() => pushPage({ kind: 'search' })}
              />
            )}
          </div>

          <div className={view === 'grades' ? '' : 'hidden'} aria-hidden={view !== 'grades'}>
            {visited.has('grades') && (
              <GradesView
                masteredSet={masteredSet}
                onOpenGrade={(grade) => pushPage({ kind: 'grade', grade })}
              />
            )}
          </div>

          <div className={view === 'learn' ? '' : 'hidden'} aria-hidden={view !== 'learn'}>
            {visited.has('learn') && (
              <StudyView
                masteredSet={masteredSet}
                onApplyMark={applyMastered}
                active={view === 'learn' && !pageMeta}
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
                readerSetId={aiReaderSetId}
                onOpenReader={(setId) => pushPage({ kind: 'ai-reader', setId })}
                onBack={popPage}
              />
            )}
          </div>

          <div className={view === 'me' ? '' : 'hidden'} aria-hidden={view !== 'me'}>
            {visited.has('me') && (
              <div>
                <div className="mb-3 flex items-baseline justify-between gap-2">
                  <h1 className="font-display text-[18px] font-semibold tracking-tight text-slate-900 dark:text-slate-50">
                    我的
                  </h1>
                  <span className="text-[11px] font-semibold text-slate-400">
                    已掌握 {masteredArr.length} 词
                  </span>
                </div>
                <SettingsView
                  theme={theme}
                  aiEnabled={AI_ENABLED}
                  onToggleTheme={toggleTheme}
                  onOpenLlm={() => pushPage({ kind: 'llm' })}
                  onToast={pushToast}
                  onImport={importMastered}
                />
              </div>
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

      {wordModal && (
        <WordModal
          word={wordModal}
          mastered={masteredSet.has(wordModal.word)}
          onClose={() => setWordModal(null)}
          onToggleMastered={() => toggleMastered(wordModal.word)}
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
