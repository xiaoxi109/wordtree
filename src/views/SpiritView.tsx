import { useEffect, useMemo, useState } from 'react'
import type { ChallengeWord } from '../lib/challenge'
import {
  applyBattleResult,
  canEvolve,
  ensureSpirit,
  evolveSpirit,
  expProgress,
  expToLevel,
  generateSpiritStory,
  getLine,
  getSpirits,
  getSpiritLine,
  getStories,
  recentSpirits,
  subscribeSpirits,
  type SpiritStory,
} from '../lib/spirit'
import { Sheet } from '../components/Sheet'
import { SparklesIcon, BoltIcon, ChevronRightIcon, RotateCcwIcon, XIcon } from '../components/icons'

/**
 * AI 词灵图鉴
 *
 * 每个词灵的档案（名字 / 种族 / 外观 / 性格 / 技能 / 口头禅）都由 AI 创作并缓存；
 * 等级、血量、战绩来自真实的复习与闯关结果；进化形态和台词也由 AI 现场生成。
 */

const RARITY_STYLE: Record<string, string> = {
  N: 'bg-slate-100 text-slate-600 dark:bg-slate-500/20 dark:text-slate-300',
  R: 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300',
  SR: 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300',
  SSR: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
}

const ELEMENT_COLOR: Record<string, string> = {
  火: 'text-rose-500', 水: 'text-sky-500', 木: 'text-emerald-500', 光: 'text-amber-500',
  影: 'text-violet-500', 雷: 'text-yellow-500', 风: 'text-teal-500', 土: 'text-orange-600',
}

/** 功能词没有画面感，不适合做成词灵；只收实词。 */
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
  'my', 'your', 'his', 'its', 'our', 'their', 'is', 'am', 'are', 'was', 'were', 'be', 'been',
  'have', 'has', 'had', 'do', 'does', 'did', "don't", "doesn't", 'yes', 'no', 'not', 'and', 'or',
  'but', 'in', 'on', 'at', 'to', 'of', 'for', 'with', 'this', 'that', 'these', 'those', 'one',
  'two', 'three', 'there', 'here', 'what', 'which', 'who', 'how', 'when', 'where', 'why',
])

export default function SpiritView({
  masteredWords,
  activeWords,
  onStudy,
}: {
  /** 已掌握的词：优先收服为词灵 */
  masteredWords: ChallengeWord[]
  /** 正在学的词：也可以收服 */
  activeWords: ChallengeWord[]
  /** 去复习（陪练） */
  onStudy: () => void
}) {
  const [version, setVersion] = useState(0)
  useEffect(() => subscribeSpirits(() => setVersion((v) => v + 1)), [])

  const [selectedWord, setSelectedWord] = useState<string | null>(null)
  const [busyWord, setBusyWord] = useState<string | null>(null)
  const [line, setLine] = useState<string>('')
  const [story, setStory] = useState<SpiritStory | null>(() => getStories()[0] ?? null)
  const [storyOpen, setStoryOpen] = useState(false)
  const [storyLoading, setStoryLoading] = useState(false)
  const [toast, setToast] = useState('')

  const spirits = useMemo(() => getSpirits(), [version])

  // 可收服队列：已掌握词优先，再补正在学的词，按释义去重
  const candidates = useMemo(() => {
    const seen = new Set<string>()
    const out: ChallengeWord[] = []
    for (const w of [...masteredWords, ...activeWords]) {
      if (!w.word || !w.meaning) continue
      const key = w.word.toLowerCase()
      if (seen.has(key) || STOP_WORDS.has(key)) continue
      seen.add(key)
      out.push(w)
    }
    return out.slice(0, 60)
  }, [masteredWords, activeWords])

  const owned = Object.values(spirits)
  const totalExp = owned.reduce((n, s) => n + s.exp, 0)
  const topLevel = owned.reduce((n, s) => Math.max(n, s.level), 0)
  const selected = selectedWord ? spirits[selectedWord.toLowerCase()] : undefined

  const catchSpirit = async (w: ChallengeWord) => {
    if (busyWord) return
    setBusyWord(w.word.toLowerCase())
    setToast('')
    try {
      const s = await ensureSpirit(w.word, w.meaning, w.pos)
      setToast(s ? `${s.name} 收服成功！` : '收服失败，请稍后再试')
      if (s) setSelectedWord(w.word.toLowerCase())
    } finally {
      setBusyWord(null)
    }
  }

  const battle = (correct: boolean) => {
    if (!selected) return
    applyBattleResult(selected.word, correct)
    void getSpiritLine(selected.word, correct ? 'attack' : 'hurt').then(setLine)
    setToast(correct ? `${selected.name} 命中！+12 EXP` : `${selected.name} 掉血了…`)
  }

  const doEvolve = async () => {
    if (!selected) return
    setBusyWord(selected.word.toLowerCase())
    const next = await evolveSpirit(selected.word)
    setBusyWord(null)
    if (next) {
      setToast(`${next.name} 进化成功！`)
      void getSpiritLine(next.word, 'evolve').then(setLine)
    } else {
      setToast('进化失败，请稍后再试')
    }
  }

  const openStory = async () => {
    const words = recentSpirits(5).map((s) => s.word)
    if (words.length < 2) {
      setToast('先收服至少两只词灵吧')
      return
    }
    setStoryLoading(true)
    const next = await generateSpiritStory(words)
    setStoryLoading(false)
    if (next) {
      setStory(next)
      setStoryOpen(true)
    } else {
      setToast('故事生成失败，请稍后再试')
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="rounded-[20px] border border-violet-200/50 bg-gradient-to-br from-violet-50 via-white to-white p-4 dark:border-violet-500/20 dark:from-violet-500/10 dark:via-slate-800/40 dark:to-slate-800/40">
        <div className="flex items-center gap-2">
          <SparklesIcon width={18} height={18} className="text-violet-600 dark:text-violet-300" />
          <h2 className="font-display text-[16px] font-bold tracking-tight text-slate-900 dark:text-slate-50">我的词灵</h2>
          <span className="ml-auto text-[11px] text-slate-400">AI 生成设定 · 真实战绩养成</span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div><p className="font-display text-[18px] font-bold text-slate-900 dark:text-slate-50">{owned.length}</p><p className="text-[10px] text-slate-400">已收服</p></div>
          <div><p className="font-display text-[18px] font-bold text-slate-900 dark:text-slate-50">{totalExp}</p><p className="text-[10px] text-slate-400">总经验</p></div>
          <div><p className="font-display text-[18px] font-bold text-slate-900 dark:text-slate-50">Lv.{topLevel}</p><p className="text-[10px] text-slate-400">最高等级</p></div>
        </div>
        <button
          onClick={() => void openStory()}
          disabled={storyLoading}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-[12px] bg-violet-600 py-2 text-[12px] font-bold text-white transition active:scale-[0.98] disabled:opacity-50"
        >
          <SparklesIcon width={14} height={14} />
          {storyLoading ? 'AI 正在写剧本…' : '看一段词灵小剧场'}
          <ChevronRightIcon width={14} height={14} />
        </button>
      </div>

      {toast && (
        <p className="mt-2 rounded-[12px] bg-slate-900/[0.04] px-3 py-2 text-center text-[12px] font-semibold text-slate-600 dark:bg-white/[0.06] dark:text-slate-300">
          {toast}
        </p>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2.5">
        {candidates.map((w) => {
          const s = spirits[w.word.toLowerCase()]
          if (!s) {
            return (
              <button
                key={w.word}
                disabled={!!busyWord}
                onClick={() => void catchSpirit(w)}
                className="flex min-h-[104px] flex-col items-center justify-center gap-1 rounded-[16px] border border-dashed border-slate-300/70 bg-white/50 p-2.5 text-center transition active:scale-[0.98] disabled:opacity-50 dark:border-white/15 dark:bg-white/[0.02]"
              >
                <span className="font-display text-[22px] text-slate-300 dark:text-slate-600">?</span>
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  {busyWord === w.word.toLowerCase() ? 'AI 创作中…' : w.word}
                </span>
                <span className="text-[10px] text-slate-400">点击收服</span>
              </button>
            )
          }
          return (
            <button
              key={w.word}
              onClick={() => {
                setSelectedWord(w.word.toLowerCase())
                setLine(getLine(w.word, 'victory') ?? s.catchphrase)
              }}
              className="flex min-h-[104px] flex-col items-start rounded-[16px] border border-slate-900/[0.05] bg-white p-2.5 text-left shadow-card transition active:scale-[0.98] dark:border-white/10 dark:bg-white/[0.04]"
            >
              <div className="flex w-full items-center gap-1">
                <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${RARITY_STYLE[s.rarity] ?? RARITY_STYLE.N}`}>{s.rarity}</span>
                <span className={`text-[12px] ${ELEMENT_COLOR[s.element] ?? 'text-slate-400'}`}>◆</span>
                <span className="ml-auto text-[10px] font-bold text-slate-400">Lv.{s.level}</span>
              </div>
              <p className="mt-1.5 w-full truncate text-[14px] font-bold text-slate-900 dark:text-slate-50">{s.name}</p>
              <p className="w-full truncate text-[11px] text-slate-400">{s.word} · {s.meaning}</p>
              <div className="mt-auto h-1 w-full overflow-hidden rounded-full bg-slate-900/[0.07] dark:bg-white/10">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${s.hp}%` }} />
              </div>
            </button>
          )
        })}
      </div>

      <Sheet
        open={!!selected}
        onClose={() => setSelectedWord(null)}
        title={selected ? `${selected.name} · Lv.${selected.level}` : ''}
        subtitle={selected ? `${selected.word} / ${selected.meaning}` : ''}
      >
        {selected && (
          <div className="space-y-3 pb-4">
            <div className="rounded-[16px] border border-slate-200/70 bg-white/80 p-3 dark:border-white/10 dark:bg-white/[0.04]">
              <p className="eyebrow">AI 形象</p>
              <p className="mt-1 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300">{selected.appearance}</p>
              <p className="mt-2 text-[11px] text-slate-400">
                {selected.species} · {selected.element} 属性 · {selected.rarity}
                {selected.evolved && ' · 已进化'}
              </p>
            </div>

            <div className="rounded-[16px] bg-violet-50 p-3 dark:bg-violet-500/10">
              <p className="eyebrow">专属技能</p>
              <p className="mt-1 text-[14px] font-bold text-violet-800 dark:text-violet-200">{selected.skill.name}</p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-violet-700/80 dark:text-violet-300/80">
                {selected.skill.desc}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-[14px] border border-slate-200/70 p-2.5 dark:border-white/10">
                <p className="eyebrow">性格</p>
                <p className="mt-1 text-[12px] text-slate-600 dark:text-slate-300">{selected.personality}</p>
              </div>
              <div className="rounded-[14px] border border-slate-200/70 p-2.5 dark:border-white/10">
                <p className="eyebrow">口头禅</p>
                <p className="mt-1 text-[12px] text-slate-600 dark:text-slate-300">「{selected.catchphrase}」</p>
              </div>
            </div>

            <div className="rounded-[16px] border border-slate-200/70 p-3 dark:border-white/10">
              <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                <span>经验 {selected.exp} / {selected.level >= 10 ? 'MAX' : expToLevel(selected.level)}</span>
                <span>HP {selected.hp} / 100</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-900/[0.07] dark:bg-white/10">
                <div className="h-full rounded-full bg-violet-500" style={{ width: `${expProgress(selected) * 100}%` }} />
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-900/[0.07] dark:bg-white/10">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${selected.hp}%` }} />
              </div>
              <p className="mt-2 text-[11px] text-slate-400">
                战绩 {selected.wins} 胜 {selected.losses} 负 · 答对涨经验回血，答错掉血
              </p>
            </div>

            <div className="flex items-center gap-2 rounded-[14px] bg-slate-900/[0.04] px-3 py-2.5 dark:bg-white/[0.05]">
              <span className="min-w-0 flex-1 text-[12px] italic text-slate-600 dark:text-slate-300">「{line}」</span>
              <button
                onClick={() => void getSpiritLine(selected.word, 'victory').then(setLine)}
                aria-label="换一句台词"
                className="shrink-0 rounded-[10px] p-1 text-slate-400 active:scale-95"
              >
                <RotateCcwIcon width={14} height={14} />
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              <button onClick={() => battle(true)} className="btn-ink flex items-center gap-1.5 !px-4 !py-2.5">
                <BoltIcon width={15} height={15} />
                答对·加经验
              </button>
              <button onClick={() => battle(false)} className="btn-soft flex items-center gap-1.5 !px-4 !py-2.5">
                <XIcon width={15} height={15} />
                答错·掉血
              </button>
              {canEvolve(selected) && (
                <button onClick={() => void doEvolve()} className="btn-soft !px-4 !py-2.5">AI 进化</button>
              )}
              <button onClick={onStudy} className="btn-soft !px-4 !py-2.5">去复习陪练</button>
            </div>
          </div>
        )}
      </Sheet>

      <Sheet open={storyOpen} onClose={() => setStoryOpen(false)} title={story?.title ?? '词灵小剧场'}>
        {story && (
          <div className="space-y-3 pb-4">
            <p className="whitespace-pre-wrap text-[14px] leading-[1.9] text-slate-700 dark:text-slate-200">
              {story.text}
            </p>
            <p className="text-[11px] text-slate-400">出场：{story.heroes.join(' · ')}</p>
          </div>
        )}
      </Sheet>
    </div>
  )
}
