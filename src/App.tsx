import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'
import { App as CapApp } from '@capacitor/app'
import { runBack } from './lib/back'
import { ensureExtraLoaded } from './data/lexicon'
import {
  LEXICONS,
  getLexiconMeta,
  inferLexiconLevel,
  isLexiconId,
  loadMastered,
  masteredKey,
} from './data/lexicons'
import { loadDictWords } from './data/dictLoader'
import { BOOK_CATALOG } from './data/generated/book-catalog'
import type { Word } from './data'
import type { LexiconId } from './data/types'
import { useSpeech } from './hooks/useSpeech'
import HomeDashboard from './views/HomeDashboard'
import BrowseView from './views/BrowseView'
import LexiconPickerView from './views/LexiconPickerView'
import SettingsView, { LlmSettingsView } from './views/SettingsView'
import StudyView from './views/StudyView'
import SentenceView from './views/SentenceView'
import PhoneticsView from './views/PhoneticsView'
import AiView from './views/AiView'
import { WordModal } from './components/word'
import { ErrorBoundary } from './components/ErrorBoundary'
import { pushReviewWord, removeReviewWord } from './lib/review'
import { MASTERED_EVENT, setWordMastered } from './lib/bookProgress'
import { wordKey } from './lib/cluster'
import {
  THEME_STORAGE_KEY,
  getSystemTheme,
  isThemePreference,
  type ResolvedTheme,
  type ThemePreference,
} from './lib/theme'

import { ArrowLeftIcon, HomeIcon, SparklesIcon, UserIcon, CheckIcon, XIcon } from './components/icons'
import { PageActiveContext } from './components/Sheet'

type View = 'home' | 'ai' | 'me'

/**
 * 全局页面栈只承载全屏沉浸式二级页：
 * 大模型设置、AI 课程阅读、词库（BrowseView，浏览与查词共用同一入口）、复习（StudyView）。
 * 词库选择统一在设置的「词库管理」完成，不再有分级页面。
 */
type Page =
  | { kind: 'llm' }
  | { kind: 'lexicons' }
  | { kind: 'browse-all' }
  | { kind: 'study' }
  | { kind: 'sentences' }
  | { kind: 'phonetics' }
  | { kind: 'ai-reader'; lessonId: string }
  | { kind: 'book-lesson'; bookId: string }

/**
 * AI 课程在 Web 与原生端都开放；Web 端能否请求成功取决于接口是否允许跨域，
 * 原生 APK 走 CapacitorHttp 不受此限制。
 */
const AI_ENABLED = true

/* ----------------------------- Toast ----------------------------- */
type Toast = { id: number; msg: string; type: 'success' | 'error' | 'info' }
let toastId = 0

function ToastContainer({ toasts, bottomOffset = '24px' }: { toasts: Toast[]; bottomOffset?: string }) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[60] flex flex-col items-center gap-2 px-4"
      style={{ bottom: `calc(env(safe-area-inset-bottom) + ${bottomOffset})` }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex max-w-[300px] animate-toast-in items-center gap-2 rounded-[14px] border border-slate-200/70 bg-white/95 px-3 py-2 text-xs font-semibold leading-snug text-slate-700 shadow-card backdrop-blur-xl dark:border-slate-700/60 dark:bg-slate-800/95 dark:text-slate-100"
        >
          <span
            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
              t.type === 'success'
                ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                : t.type === 'error'
                  ? 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300'
                  : 'bg-slate-100 text-slate-500 dark:bg-slate-700/60 dark:text-slate-300'
            }`}
          >
            {t.type === 'success' && <CheckIcon width={11} height={11} />}
            {t.type === 'error' && <XIcon width={11} height={11} />}
            {t.type === 'info' && <span className="h-1 w-1 rounded-full bg-current" />}
          </span>
          <span className="min-w-0 break-words">{t.msg}</span>
        </div>
      ))}
    </div>
  )
}

/* ----------------------------- App ----------------------------- */
export default function App() {
  /** 用户外观偏好：跟随系统 / 浅色 / 深色，默认跟随系统。 */
  const [themePref, setThemePref] = useState<ThemePreference>(() => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY)
    return isThemePreference(saved) ? saved : 'system'
  })
  /** 系统外观偏好：仅在 pref === 'system' 时参与生效主题，变化需实时响应。 */
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => getSystemTheme())
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mq) return
    const onChange = (e: MediaQueryListEvent) => setSystemTheme(e.matches ? 'dark' : 'light')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  /** 实际生效的浅 / 深主题。 */
  const theme: ResolvedTheme = themePref === 'system' ? systemTheme : themePref
  /** 当前词库：core 沿用旧 key；其余词库进度按 id 独立保存。 */
  const [lexiconId, setLexiconIdState] = useState<LexiconId>(() => {
    const saved = localStorage.getItem('lexicore-lexicon')
    return isLexiconId(saved) ? saved : 'core'
  })
  const [masteredMap, setMasteredMap] = useState<Record<LexiconId, string[]>>(() =>
    Object.fromEntries(LEXICONS.map((l) => [l.id, loadMastered(l.id)])) as Record<LexiconId, string[]>,
  )
  const masteredArr = masteredMap[lexiconId]
  const [dictWords, setDictWords] = useState<Word[]>([])
  /** core 传 undefined， BrowseView 继续用 ALL_WORDS（含懒加载词典层）。 */
  const activePool = lexiconId === 'core' ? undefined : dictWords
  const allMasteredCount = useMemo(
    () => Object.values(masteredMap).reduce((n, arr) => n + arr.length, 0),
    [masteredMap],
  )
  const lexiconLevel = useMemo(() => inferLexiconLevel(lexiconId), [lexiconId])
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

  // 词典扩展词（约 1.9 万）延迟加载：首屏只带课程词表，空闲后再并入，查词随即覆盖全库
  useEffect(() => {
    const id = window.setTimeout(() => { void ensureExtraLoaded() }, 1200)
    return () => window.clearTimeout(id)
  }, [])

  // 首次进入首页、完成一轮复习 → 都算"今日学习"
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

  /**
   * 单词详情走弹层（不跳页）：点哪张卡就弹哪个词，关掉仍停在原列表位置。
   * lexiconId 为可选的词表覆盖：书籍课程内查词时传入配套词表 id，
   * 弹层里的「加入已掌握」写回该配套词表，而不是当前全局选中的词表。
   */
  const [wordModalStack, setWordModalStack] = useState<{ word: Word; lexiconId?: string }[]>([])
  const openWord = useCallback(
    (w: Word, lexiconId?: string) => setWordModalStack((prev) => [...prev, { word: w, lexiconId }]),
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

  /** 列表连播切篇：替换栈顶，避免每切一篇就在返回栈里多压一层 */
  const replaceTopPage = useCallback((page: Page) => {
    setPages((prev) => (prev.length ? [...prev.slice(0, -1), page] : [page]))
  }, [])

  /**
   * AI 课程阅读页走同一条页面栈，由栈顶驱动 AiView 显示阅读器；返回一律 popPage。
   * 轻量交互（生成条件 / 课程集操作 / 听单切换）留在 AiView 内部处理，不入栈。
   */
  const aiReaderLessonId = useMemo<string | null>(() => {
    const top = pages[pages.length - 1]
    return top?.kind === 'ai-reader' ? top.lessonId : null
  }, [pages])
  /** 书籍课程的书页同样走页面栈：栈顶是它时由 AiView 渲染书页（底部导航隐藏）。 */
  const bookLessonBookId = useMemo<string | null>(() => {
    const top = pages[pages.length - 1]
    return top?.kind === 'book-lesson' ? top.bookId : null
  }, [pages])
  const aiPageOpen = aiReaderLessonId !== null || bookLessonBookId !== null

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

  /** 栈顶词条：带配套词表覆盖时，掌握状态从该词表的存储里读 */
  const topModalEntry = wordModalStack[wordModalStack.length - 1]
  const topModalMastered = topModalEntry
    ? topModalEntry.lexiconId
      ? (masteredMap[topModalEntry.lexiconId] ?? []).includes(topModalEntry.word.word)
      : masteredSet.has(topModalEntry.word.word)
    : false
  // App 启动即预加载 Piper 模型（不播放）。模型尽早就绪，可使后续用户手势内的
  // 朗读同步播放，避免首次 await 加载模型后 audio.play() 失去手势被 Android WebView 拦截。
  const { preload } = useSpeech()
  useEffect(() => {
    // 预加载是 APK 专属：Android WebView 要求 audio.play() 处在用户手势链内，
    // 所以启动时就把英文模型备好；中文模型改为首次中文朗读时按需加载。
    // 非原生平台（本地 vite 预览）走系统 SpeechSynthesis，不加载离线模型。
    if (!Capacitor.isNativePlatform()) return
    preload().catch(() => {})
  }, [preload])

  const toggleMastered = useCallback((word: string) => {
    setMasteredMap((prev) => {
      const arr = prev[lexiconId] ?? []
      const isAdd = !arr.includes(word)
      if (isAdd) recordStudyDay() // 标记掌握 → 今日学习
      const next = isAdd ? [...arr, word] : arr.filter((w) => w !== word)
      return { ...prev, [lexiconId]: next }
    })
  }, [lexiconId, recordStudyDay])

  /**
   * 查词弹层的二态切换：加入已掌握时移出复习队列；取消已掌握时按「未掌握」记入复习队列，
   * 后续 AI 课程会重点复现。等价于原先的「加入已掌握 / 加入未掌握」两个按钮。
   * overrideLexiconId 存在时（书籍课程内查词）：掌握状态写回该册配套词表，不触碰复习队列。
   */
  const toggleMasteredFromModal = useCallback((w: Word, overrideLexiconId?: string) => {
    if (overrideLexiconId) {
      const list = masteredMap[overrideLexiconId] ?? []
      setWordMastered(overrideLexiconId, w.word, !list.includes(w.word))
      return
    }
    const willBeMastered = !masteredSet.has(w.word)
    toggleMastered(w.word)
    if (willBeMastered) removeReviewWord(wordKey(w.word))
    else pushReviewWord({ key: wordKey(w.word), word: w.word, ipa: w.ipa, meaning: w.meaning }, 'unknown')
  }, [masteredMap, masteredSet, toggleMastered])

  /**
   * 书籍课程里标记的掌握词直接写在对应词表的存储里：
   * 这里监听事件同步内存状态，保证词库页 / 复习页立刻看到最新进度。
   */
  useEffect(() => {
    const onMastered = (e: Event) => {
      const detail = (e as CustomEvent<{ lexiconId?: string }>).detail
      const id = detail?.lexiconId
      if (!id) return
      setMasteredMap((prev) => ({ ...prev, [id]: loadMastered(id) }))
      recordStudyDay()
    }
    window.addEventListener(MASTERED_EVENT, onMastered)
    return () => window.removeEventListener(MASTERED_EVENT, onMastered)
  }, [recordStudyDay])

  /** 批量增删掌握词（复习判级回流 / 导入进度）。 */
  const applyMastered = useCallback((words: string[], mode: 'add' | 'remove') => {
    setMasteredMap((prev) => {
      const arr = prev[lexiconId] ?? []
      const next = new Set(arr)
      for (const w of words) {
        if (mode === 'add') next.add(w)
        else next.delete(w)
      }
      if (next.size === arr.length) return prev
      return { ...prev, [lexiconId]: Array.from(next) }
    })
  }, [lexiconId])

  const importMastered = useCallback((words: string[]) => {
    setMasteredMap((prev) => ({
      ...prev,
      [lexiconId]: Array.from(new Set([...(prev[lexiconId] ?? []), ...words])),
    }))
  }, [lexiconId])

  const pushToast = useCallback((msg: string, type: Toast['type'] = 'success') => {
    const id = ++toastId
    setToasts((prev) => [...prev, { id, msg, type }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2600)
  }, [])

  /** 切换词库：先从内置 JSON 装载词表，成功后再切换，避免空白页。 */
  const selectLexicon = useCallback(async (id: LexiconId) => {
    if (id === lexiconId) return
    try {
      if (id !== 'core') await loadDictWords(id)
      setLexiconIdState(id)
      pushToast(`已切换到 ${getLexiconMeta(id)?.name ?? id}`)
    } catch {
      pushToast('词库加载失败，请重试', 'error')
    }
  }, [lexiconId, pushToast])

  // 启动时若上次选的是外部词库，先把它装进内存
  useEffect(() => {
    if (lexiconId === 'core') {
      setDictWords([])
      return
    }
    let alive = true
    loadDictWords(lexiconId)
      .then((words) => { if (alive) setDictWords(words) })
      .catch(() => { if (alive) pushToast('词库加载失败，可到设置里重新选择', 'error') })
    return () => { alive = false }
  }, [lexiconId, pushToast])

  /** 持久化用户偏好（含 system），与 index.html 内联初始化读取同一 key。 */
  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, themePref)
  }, [themePref])

  useEffect(() => {
    const dark = theme === 'dark'
    document.documentElement.classList.toggle('dark', dark)
    // 与 index.html 的内联初始化同步，避免系统深色 + 应用浅色时原生控件混色。
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0d1117' : '#f6f3ea')

    // Android 状态栏跟随应用内主题：深色→浅色图标，浅色→深色图标。
    // 失败时静默忽略（Web 端 / 旧系统不支持）。
    if (Capacitor.isNativePlatform()) {
      StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => {})
      StatusBar.setBackgroundColor({ color: dark ? '#0d1117' : '#f6f3ea' }).catch(() => {})
    }
  }, [theme])

  useEffect(() => {
    localStorage.setItem(masteredKey(lexiconId), JSON.stringify(masteredArr))
  }, [lexiconId, masteredArr])

  useEffect(() => {
    localStorage.setItem('lexicore-lexicon', lexiconId)
  }, [lexiconId])

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
        return { title: '大模型设置', sub: '' }
      case 'lexicons':
        return { title: '词库管理', sub: '选择当前使用的词库 · 进度独立保存' }
      case 'browse-all':
        return {
          title: getLexiconMeta(lexiconId)?.name ?? '词库',
          sub: lexiconId === 'core' ? '背词 · 查词 · 按场景分组与筛选' : '背词 · 查词 · 已掌握 / 未掌握独立统计',
        }
      case 'study':
        return { title: '复习', sub: '只练已掌握的词 · 到期即练' }
      case 'sentences':
        return { title: '短句', sub: '按使用场景分类 · 中文想，英文说' }
      case 'phonetics':
        return { title: '音标', sub: '48 音标 · 点击听发音 · 离线可用' }
      case 'ai-reader':
        return { title: '课程阅读', sub: '' }
      case 'book-lesson':
        return {
          title: BOOK_CATALOG.find((b) => b.id === page.bookId)?.name ?? '书籍课程',
          sub: '',
        }
    }
  }, [pages, lexiconId])

  const renderPage = (page: Page) => {
    switch (page.kind) {
      case 'llm':
        return <LlmSettingsView onToast={pushToast} />
      case 'lexicons':
        return (
          <LexiconPickerView
            lexiconId={lexiconId}
            onSelect={selectLexicon}
            onDone={popPage}
          />
        )
      case 'browse-all':
        return (
          <BrowseView
            key={lexiconId}
            pool={activePool}
            masteredSet={masteredSet}
            onOpen={openWord}
            onToggleMastered={(w) => toggleMastered(w.word)}
          />
        )
      case 'study':
        return (
          <StudyView
            key={lexiconId}
            pool={activePool}
            masteredSet={masteredSet}
            onApplyMark={applyMastered}
            active={pages[pages.length - 1]?.kind === 'study'}
          />
        )
      case 'sentences':
        return <SentenceView active={pages[pages.length - 1]?.kind === 'sentences'} />
      case 'phonetics':
        return <PhoneticsView active={pages[pages.length - 1]?.kind === 'phonetics'} />
      // AI 阅读全屏页由 AiView 内部按 setId 渲染，这里只登记页面层级
      case 'ai-reader':
        return null
      // 书籍课程书页同样由 AiView 内部渲染
      case 'book-lesson':
        return null
    }
  }

  return (
    <div
      id="app-scroll"
      ref={rootScrollRef}
      className={`h-[100dvh] overflow-y-auto bg-transparent text-slate-900 transition-colors dark:text-slate-100 ${theme === 'dark' ? 'dark' : ''}`}
    >
      <main
        className={`mx-auto max-w-5xl px-4 pt-[calc(env(safe-area-inset-top)+16px)] ${
          pageMeta ? 'mt-[56px]' : ''
        } ${
          pages[pages.length - 1]?.kind === 'study'
            ? 'pb-[env(safe-area-inset-bottom)]'
            : pages[pages.length - 1]?.kind === 'ai-reader' ||
                pages[pages.length - 1]?.kind === 'book-lesson'
              ? 'pb-0'
              : 'pb-[calc(env(safe-area-inset-bottom)+78px)]'
        }`}
      >
        {/* 二级 / 三级页面：顶部返回栏 fixed 吸顶，搜索/筛选 FilterBar 接着吸在下方 */}
        {pageMeta && (
          <div
            className="fixed inset-x-0 top-[env(safe-area-inset-top)] z-30 border-b border-slate-900/[0.06] bg-[#f6f3ea]/95 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/95"
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
                  {pageMeta.sub ? (
                    <p className="mt-0.5 truncate text-[11px] text-slate-400">{pageMeta.sub}</p>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 三个主页面首次进入后常驻（hidden 切换）：保留筛选、滚动与 AI 生成进度 */}
        <div className={pageMeta && !aiPageOpen ? 'hidden' : ''}>
          <PageActiveContext.Provider value={view === 'home' && !(pageMeta && !aiPageOpen)}>
          <div className={view === 'home' ? '' : 'hidden'} aria-hidden={view !== 'home'}>
            {visited.has('home') && (
              <HomeDashboard
                key={lexiconId}
                pool={activePool}
                lexiconName={getLexiconMeta(lexiconId)?.name ?? '词库'}
                totalMastered={allMasteredCount}
                masteredSet={masteredSet}
                masteredArr={masteredArr}
                onOpenBrowse={() => pushPage({ kind: 'browse-all' })}
                onOpenSentences={() => pushPage({ kind: 'sentences' })}
                onOpenStudy={() => pushPage({ kind: 'study' })}
                onOpenPhonetics={() => pushPage({ kind: 'phonetics' })}
                streak={streak}
              />
            )}
          </div>
          </PageActiveContext.Provider>

          <PageActiveContext.Provider value={view === 'ai' && !(pageMeta && !aiPageOpen)}>
          <div className={view === 'ai' ? '' : 'hidden'} aria-hidden={view !== 'ai'}>
            {visited.has('ai') && (
              <AiView
                masteredSet={masteredSet}
                onOpenWord={openWord}
                onToast={pushToast}
                active={view === 'ai'}
                readerLessonId={aiReaderLessonId}
                onOpenReader={(lessonId) => pushPage({ kind: 'ai-reader', lessonId })}
                onSwitchReader={(lessonId) => replaceTopPage({ kind: 'ai-reader', lessonId })}
                bookLessonBookId={bookLessonBookId}
                onOpenBookLesson={(bookId) => pushPage({ kind: 'book-lesson', bookId })}
                onBack={popPage}
                lexiconLevel={lexiconLevel}
              />
            )}
          </div>
          </PageActiveContext.Provider>

          <PageActiveContext.Provider value={view === 'me' && !(pageMeta && !aiPageOpen)}>
          <div className={view === 'me' ? '' : 'hidden'} aria-hidden={view !== 'me'}>
            {visited.has('me') && (
              <SettingsView
                themePref={themePref}
                aiEnabled={AI_ENABLED}
                masteredCount={masteredArr.length}
                lexiconId={lexiconId}
                currentLexiconName={getLexiconMeta(lexiconId)?.name ?? '词库'}
                onOpenLexicons={() => pushPage({ kind: 'lexicons' })}
                onThemeChange={setThemePref}
                onOpenLlm={() => pushPage({ kind: 'llm' })}
                onToast={pushToast}
                onImport={importMastered}
              />
            )}
          </div>
          </PageActiveContext.Provider>
        </div>

        {/* 页面栈：只显示栈顶，其余保活（保留筛选与已加载的列表） */}
        {pages.map((page, i) => (
          <PageActiveContext.Provider key={i} value={i === pages.length - 1}>
            <div className={i === pages.length - 1 ? '' : 'hidden'}>
              <ErrorBoundary resetKey={`${i}-${page.kind}`} onReset={popPage}>
                {renderPage(page)}
              </ErrorBoundary>
            </div>
          </PageActiveContext.Provider>
        ))}
      </main>

      {/* 底部通栏导航：整条贴着屏幕底边固定，二级页内隐藏 */}
      {!pageMeta && (
        <nav
          className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-900/[0.08] bg-[#f6f3ea]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/95"
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

      {topModalEntry && (
        <WordModal
          word={topModalEntry.word}
          mastered={topModalMastered}
          onClose={closeWordModal}
          onPop={wordModalStack.length > 1 ? popWordModal : undefined}
          onBack={wordModalStack.length > 1 ? popWordModal : closeWordModal}
          onToggleMastered={() => toggleMasteredFromModal(topModalEntry.word, topModalEntry.lexiconId)}
          onOpenWord={(w) => openWord(w, topModalEntry.lexiconId)}
        />
      )}

      <ToastContainer toasts={toasts} bottomOffset={pageMeta ? '24px' : '78px'} />

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
