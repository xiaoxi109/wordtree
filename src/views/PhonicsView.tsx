import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  PHONEMES,
  PHONEME_BY_ID,
  PHONEME_GROUPS,
  PHONICS_RULES,
  PHONICS_STAGES,
  collectClipTokens,
  exampleIpa,
  primaryIpaToken,
  rulesOfStage,
  type PhonemeGroup,
  type PhonicsExample,
  type PhonicsRule,
  type PhonicsStageId,
} from '../data/phonics'
import {
  getDrillBest,
  getPhonemeMastered,
  getPhonicsStats,
  getRuleMastered,
  saveDrillBest,
  subscribePhonicsProgress,
  togglePhonemeMastered,
  toggleRuleMastered,
  type DrillMode,
} from '../lib/phonicsProgress'
import { playIpaToken, prefetchIpaClips, stopIpaClip } from '../lib/ipaAudio'
import { Sheet } from '../components/Sheet'
import { useSpeech } from '../hooks/useSpeech'
import {
  CheckIcon,
  ChevronRightIcon,
  GridIcon,
  PuzzleIcon,
  SpeakerIcon,
  WavesIcon,
} from '../components/icons'

type Tab = 'ipa' | 'rules' | 'drill'
type IpaFilter = 'all' | PhonemeGroup

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'ipa', label: '音标表', icon: <GridIcon width={14} height={14} /> },
  { id: 'rules', label: '自然拼读', icon: <PuzzleIcon width={14} height={14} /> },
  { id: 'drill', label: '听辨练习', icon: <WavesIcon width={14} height={14} /> },
]

const DRILL_SIZE = 10

/* ───────────────────────── 小工具 ───────────────────────── */

function shuffle<T>(list: readonly T[]): T[] {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = a[i]
    a[i] = a[j]
    a[j] = tmp
  }
  return a
}

/** 把例词里发目标音的那几个字母标记成品牌色，一眼看到「是哪几个字母在发音」。 */
function Highlighted({ word, hi }: { word: string; hi?: string }) {
  if (!hi) return <>{word}</>
  const idx = word.toLowerCase().indexOf(hi.toLowerCase())
  if (idx < 0) return <>{word}</>
  return (
    <>
      {word.slice(0, idx)}
      <span className="text-brand-600 dark:text-accent-lime">{word.slice(idx, idx + hi.length)}</span>
      {word.slice(idx + hi.length)}
    </>
  )
}

/** 例词小卡：单词（目标字母高亮）+ 整词音标 + 中文，点喇叭跟读 */
function ExampleTile({
  ex,
  onSpeak,
  compact = false,
}: {
  ex: PhonicsExample
  onSpeak: (word: string) => void
  compact?: boolean
}) {
  const ipa = exampleIpa(ex)
  return (
    <div
      className={`min-w-0 rounded-[14px] border border-slate-200/60 bg-white/60 dark:border-white/10 dark:bg-white/[0.04] ${
        compact ? 'px-2 py-1.5' : 'px-2.5 py-2'
      }`}
    >
      <div className="flex items-center justify-between gap-1">
        <p
          className={`min-w-0 truncate font-display font-semibold text-slate-900 dark:text-slate-50 ${
            compact ? 'text-[12.5px]' : 'text-[14.5px]'
          }`}
        >
          <Highlighted word={ex.w} hi={ex.hi} />
        </p>
        <button
          type="button"
          onClick={() => onSpeak(ex.w)}
          aria-label={`朗读 ${ex.w}`}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-brand-50 hover:text-brand-600 active:scale-90 dark:text-slate-500 dark:hover:bg-brand-400/15 dark:hover:text-brand-200"
        >
          <SpeakerIcon width={12} height={12} />
        </button>
      </div>
      {ipa && (
        <p className={`-mt-0.5 font-display leading-tight text-brand-600 dark:text-brand-300 ${compact ? 'text-[10px]' : 'text-[11px]'}`}>
          {ipa}
        </p>
      )}
      <p className={`mt-0.5 truncate text-slate-400 ${compact ? 'text-[9.5px]' : 'text-[10.5px]'}`}>{ex.zh}</p>
    </div>
  )
}

function Bar({ pct, className = '' }: { pct: number; className?: string }) {
  return (
    <span className={`block h-1.5 overflow-hidden rounded-full bg-slate-200/80 dark:bg-white/10 ${className}`}>
      <span
        className="block h-full rounded-full bg-brand-500 transition-all duration-500 dark:bg-brand-400"
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </span>
  )
}

/* ───────────────────────── 主页面 ───────────────────────── */

/**
 * 自然拼读 + 音标学习页。
 *
 * 三块：
 *   音标表 —— 47 个美式音标，按元音/辅音分组，点开看口型要诀、字母组合与例词；
 *   自然拼读 —— 7 个阶段的 99 条「字母组合 → 音」规则，例词可点读；
 *   听辨练习 —— 看字母选音标 / 看拼写选发音，10 题一组，记录最好成绩。
 */
export default function PhonicsView({ active = true }: { active?: boolean }) {
  const [tab, setTab] = useState<Tab>('ipa')
  const [version, setVersion] = useState(0)
  const { speak, stop } = useSpeech()

  /** 单词朗读与音标小音频是两条通道，一起停才干净 */
  const stopAll = useCallback(() => {
    stop()
    stopIpaClip()
  }, [stop])

  /** 播放音标音频（/ʃ/、/sp/ 这种）；没有对应音频时退回朗读第一个例词 */
  const playIpa = useCallback(
    async (token: string | null, fallbackWord?: string) => {
      if (!token) return
      stopAll()
      const ok = await playIpaToken(token)
      if (!ok && fallbackWord) void speak(fallbackWord, 0.8)
    },
    [speak, stopAll],
  )

  /** 朗读单词：先掐掉音标音，避免两个声音叠在一起 */
  const speakWord = useCallback(
    (word: string) => {
      stopIpaClip()
      void speak(word, 0.85)
    },
    [speak],
  )

  useEffect(() => subscribePhonicsProgress(() => setVersion((v) => v + 1)), [])
  // 进页面就把当前 tab 要用的音频取到本地：移动端点按后不必等网络，也不会丢用户手势
  useEffect(() => {
    if (tab === 'ipa') prefetchIpaClips(PHONEMES.map((p) => `/${p.id}/`))
    if (tab === 'rules') prefetchIpaClips(collectClipTokens([], PHONICS_RULES.map((r) => r.sound)))
  }, [tab])
  useEffect(() => {
    if (!active) stopAll()
  }, [active, stopAll])
  useEffect(() => () => stopAll(), [stopAll])
  // 切 tab 时停掉正在读的声音，避免声音跟着页面跑
  useEffect(() => {
    stopAll()
  }, [tab, stopAll])

  const stats = useMemo(() => getPhonicsStats(), [version])
  const phonemeMastered = useMemo(() => getPhonemeMastered(), [version])
  const ruleMastered = useMemo(() => getRuleMastered(), [version])

  return (
    <div className="pb-4">
      {/* 总览 */}
      <div className="mb-3 rounded-[22px] border border-slate-900/[0.04] bg-white p-3.5 shadow-soft dark:border-white/10 dark:bg-white/[0.04]">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[12px] font-bold text-slate-800 dark:text-slate-100">看词能读 · 听音能写</p>
          <span className="text-[11px] font-semibold text-brand-600 dark:text-brand-300">{stats.pct}%</span>
        </div>
        <Bar pct={stats.pct} className="mt-2" />
        <div className="mt-2.5 flex items-center gap-3 text-[11px] text-slate-400">
          <span>
            音标 <b className="font-bold text-slate-700 dark:text-slate-200">{stats.phonemeDone}</b>/{stats.phonemeTotal}
          </span>
          <span className="text-slate-300 dark:text-slate-600">·</span>
          <span>
            拼读规则 <b className="font-bold text-slate-700 dark:text-slate-200">{stats.ruleDone}</b>/{stats.ruleTotal}
          </span>
        </div>
      </div>

      {/* 三个分段 */}
      <div className="mb-3 flex gap-1 rounded-[16px] border border-slate-200/70 bg-white/60 p-1 dark:border-white/10 dark:bg-white/[0.04]">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-pressed={tab === t.id}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-[12px] py-2 text-[12px] font-bold transition active:scale-95 ${
              tab === t.id
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'ipa' && (
        <IpaSection mastered={phonemeMastered} onSpeak={speakWord} onPlayIpa={playIpa} />
      )}
      {tab === 'rules' && (
        <RulesSection mastered={ruleMastered} onSpeak={speakWord} onPlayIpa={playIpa} />
      )}
      {tab === 'drill' && <DrillSection onSpeak={speakWord} />}
    </div>
  )
}

/* ───────────────────────── 音标表 ───────────────────────── */

function IpaSection({
  mastered,
  onSpeak,
  onPlayIpa,
}: {
  mastered: Set<string>
  onSpeak: (word: string) => void
  onPlayIpa: (token: string | null, fallbackWord?: string) => Promise<void>
}) {
  const [filter, setFilter] = useState<IpaFilter>('all')
  const [detailId, setDetailId] = useState<string | null>(null)

  const groups = filter === 'all' ? PHONEME_GROUPS : PHONEME_GROUPS.filter((g) => g.id === filter)
  const detail = detailId ? PHONEME_BY_ID[detailId] ?? null : null
  const detailIndex = detail ? PHONEMES.findIndex((p) => p.id === detail.id) : -1

  const go = (delta: number) => {
    if (detailIndex < 0) return
    const next = PHONEMES[(detailIndex + delta + PHONEMES.length) % PHONEMES.length]
    setDetailId(next.id)
  }

  return (
    <>
      <div className="no-scrollbar mb-3 flex gap-1.5 overflow-x-auto pb-0.5">
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
          全部 {PHONEMES.length}
        </FilterChip>
        {PHONEME_GROUPS.map((g) => (
          <FilterChip key={g.id} active={filter === g.id} onClick={() => setFilter(g.id)}>
            {g.label}
          </FilterChip>
        ))}
      </div>

      {groups.map((group) => {
        const items = PHONEMES.filter((p) => p.group === group.id)
        const done = items.filter((p) => mastered.has(p.id)).length
        return (
          <section key={group.id} className="mb-4">
            <div className="mb-1.5 flex items-baseline gap-2 px-1">
              <h3 className="text-[13px] font-bold text-slate-800 dark:text-slate-100">{group.label}</h3>
              <span className="text-[10px] text-slate-400">{group.hint}</span>
              <span className="ml-auto text-[10px] font-semibold text-brand-600 dark:text-brand-300">
                {done}/{items.length}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {items.map((p) => {
                const on = mastered.has(p.id)
                return (
                  <div key={p.id} className="relative">
                    <button
                      type="button"
                      onClick={() => setDetailId(p.id)}
                      className={`flex w-full flex-col items-center gap-0.5 rounded-[14px] border px-1 py-2.5 pr-5 transition active:scale-95 ${
                        on
                          ? 'border-brand-300/70 bg-brand-50/80 dark:border-brand-400/40 dark:bg-brand-400/15'
                          : 'border-slate-200/70 bg-white/70 hover:bg-white dark:border-white/10 dark:bg-white/[0.04]'
                      }`}
                    >
                      <span className="font-display text-[16px] font-semibold leading-none text-slate-900 dark:text-slate-50">
                        {p.id}
                      </span>
                      <span className="mt-0.5 max-w-full truncate text-[9px] text-slate-400">{p.zh}</span>
                    </button>
                    {/* 小喇叭：直接播这个音（卡片本身是按钮，喇叭必须放成兄弟节点，不能嵌套） */}
                    <button
                      type="button"
                      onClick={() => void onPlayIpa(`/${p.id}/`, p.examples[0]?.w)}
                      aria-label={`播放音标 ${p.ipa}`}
                      title="听这个音"
                      className="absolute bottom-1 right-1 flex h-6 w-6 items-center justify-center rounded-full text-slate-400 transition hover:bg-brand-50 hover:text-brand-600 active:scale-90 dark:text-slate-500 dark:hover:bg-brand-400/15 dark:hover:text-brand-200"
                    >
                      <SpeakerIcon width={12} height={12} />
                    </button>
                    {on && (
                      <span className="pointer-events-none absolute right-1 top-1 flex h-3 w-3 items-center justify-center rounded-full bg-brand-600 text-white">
                        <CheckIcon width={8} height={8} />
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}

      <Sheet
        open={!!detail}
        onClose={() => setDetailId(null)}
        title={detail ? `${detail.ipa}  ${detail.zh}` : ''}
        subtitle={detail ? PHONEME_GROUPS.find((g) => g.id === detail.group)?.label : ''}
        headerExtra={
          detail ? (
            <button
              type="button"
              onClick={() => void onPlayIpa(`/${detail.id}/`, detail.examples[0]?.w)}
              aria-label={`播放音标 ${detail.ipa}`}
              title="听这个音"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-brand-700 transition active:scale-95 dark:bg-brand-400/15 dark:text-brand-200"
            >
              <SpeakerIcon width={17} height={17} />
            </button>
          ) : null
        }
        footer={
          detail ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => go(-1)}
                className="btn-soft !px-3 !py-2.5 text-[12px]"
                aria-label="上一个音标"
              >
                上一个
              </button>
              <button
                type="button"
                onClick={() => togglePhonemeMastered(detail.id)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-[18px] px-4 py-2.5 text-[13px] font-bold transition active:scale-[0.98] ${
                  mastered.has(detail.id)
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-400/15 dark:text-brand-200'
                    : 'bg-brand-600 text-white shadow-float'
                }`}
              >
                <CheckIcon width={14} height={14} />
                {mastered.has(detail.id) ? '已掌握（点击取消）' : '标记为已掌握'}
              </button>
              <button
                type="button"
                onClick={() => go(1)}
                className="btn-soft !px-3 !py-2.5 text-[12px]"
                aria-label="下一个音标"
              >
                下一个
              </button>
            </div>
          ) : null
        }
      >
        {detail && (
          <div className="space-y-4 pb-1">
            <div className="surface-inset p-3.5">
              <p className="eyebrow">发音要诀</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-slate-700 dark:text-slate-200">
                {detail.mouth}
              </p>
            </div>

            <div>
              <p className="eyebrow mb-2">常见字母组合</p>
              <div className="flex flex-wrap gap-1.5">
                {detail.spellings.map((s) => (
                  <span
                    key={s}
                    className="rounded-full border border-slate-200/70 bg-white/70 px-2.5 py-1 font-display text-[12px] font-semibold text-slate-700 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-200"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <p className="eyebrow mb-2">例词（点喇叭跟读 · 音标为整词读音）</p>
              <div className="grid grid-cols-2 gap-2">
                {detail.examples.map((ex) => (
                  <ExampleTile key={ex.w} ex={ex} onSpeak={onSpeak} />
                ))}
              </div>
            </div>

            {detail.contrast && detail.contrast.length > 0 && (
              <div>
                <p className="eyebrow mb-2">易混音（点开对照）</p>
                <div className="flex flex-wrap gap-1.5">
                  {detail.contrast.map((id) => {
                    const target = PHONEME_BY_ID[id]
                    if (!target) return null
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setDetailId(id)}
                        className="flex items-center gap-1 rounded-full border border-rose-200/70 bg-rose-50/70 px-2.5 py-1 font-display text-[12px] font-semibold text-rose-600 transition active:scale-95 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-200"
                      >
                        {target.ipa}
                        <span className="font-sans text-[10px] font-normal opacity-70">{target.zh}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </Sheet>
    </>
  )
}

/* ───────────────────────── 自然拼读规则 ───────────────────────── */

function RulesSection({
  mastered,
  onSpeak,
  onPlayIpa,
}: {
  mastered: Set<string>
  onSpeak: (word: string) => void
  onPlayIpa: (token: string | null, fallbackWord?: string) => Promise<void>
}) {
  const [stage, setStage] = useState<PhonicsStageId>(1)
  const rules = useMemo(() => rulesOfStage(stage), [stage])
  const stageInfo = PHONICS_STAGES.find((s) => s.id === stage)
  const done = rules.filter((r) => mastered.has(r.id)).length

  return (
    <>
      <div className="no-scrollbar mb-3 flex gap-1.5 overflow-x-auto pb-0.5">
        {PHONICS_STAGES.map((s) => {
          const on = s.id === stage
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setStage(s.id)}
              aria-pressed={on}
              className={`flex shrink-0 items-center gap-1 rounded-full px-3 py-2 text-[12px] font-semibold transition active:scale-95 ${
                on
                  ? 'border border-brand-400/70 bg-brand-50 text-brand-700 shadow-sm dark:border-brand-400/45 dark:bg-brand-400/20 dark:text-brand-100'
                  : 'border border-slate-200/70 bg-white/60 text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300'
              }`}
            >
              <span className={`text-[10px] font-bold ${on ? 'opacity-70' : 'text-slate-400'}`}>{s.id}</span>
              {s.label}
            </button>
          )
        })}
      </div>

      <div className="mb-2 flex items-center gap-2 px-1">
        <p className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">{stageInfo?.hint}</p>
        <span className="ml-auto text-[10px] font-semibold text-brand-600 dark:text-brand-300">
          {done}/{rules.length}
        </span>
      </div>

      <div className="space-y-2">
        {rules.map((rule) => (
          <RuleCard
            key={rule.id}
            rule={rule}
            mastered={mastered.has(rule.id)}
            onToggle={() => toggleRuleMastered(rule.id)}
            onSpeak={onSpeak}
            onPlayIpa={onPlayIpa}
          />
        ))}
      </div>
    </>
  )
}

function RuleCard({
  rule,
  mastered,
  onToggle,
  onSpeak,
  onPlayIpa,
}: {
  rule: PhonicsRule
  mastered: boolean
  onToggle: () => void
  onSpeak: (word: string) => void
  onPlayIpa: (token: string | null, fallbackWord?: string) => Promise<void>
}) {
  const clipToken = primaryIpaToken(rule.sound)
  return (
    <div
      className={`rounded-[18px] border p-3 transition ${
        mastered
          ? 'border-brand-200/70 bg-brand-50/40 dark:border-brand-500/25 dark:bg-brand-500/[0.07]'
          : 'border-slate-200/60 bg-white/70 dark:border-white/[0.06] dark:bg-slate-800/40'
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="min-w-0 break-words font-display text-[15px] font-bold text-slate-900 dark:text-slate-50">
          {rule.grapheme}
        </span>
        <ChevronRightIcon width={12} height={12} className="shrink-0 text-slate-300 dark:text-slate-600" />
        {/* 音标 chip 里带喇叭：直接听这组字母读什么音 */}
        <span className="flex items-center gap-1 whitespace-nowrap rounded-full bg-brand-50 py-0.5 pl-2 pr-1 dark:bg-brand-400/15">
          <span className="font-display text-[12px] font-semibold text-brand-700 dark:text-brand-200">
            {rule.sound}
          </span>
          {clipToken && (
            <button
              type="button"
              onClick={() => void onPlayIpa(clipToken, rule.examples[0]?.w)}
              aria-label={`播放 ${clipToken}`}
              title="听这个音"
              className="flex h-5 w-5 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-100/70 active:scale-90 dark:text-brand-200 dark:hover:bg-brand-400/20"
            >
              <SpeakerIcon width={11} height={11} />
            </button>
          )}
        </span>
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={mastered}
          aria-label={mastered ? '已掌握' : '标记为已掌握'}
          className={`ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition ${
            mastered
              ? 'border-brand-600 bg-brand-600 text-white'
              : 'border-slate-300/70 bg-white/40 text-transparent hover:border-brand-400 hover:text-brand-400 dark:border-slate-600 dark:bg-slate-900/30'
          }`}
        >
          <CheckIcon width={13} height={13} />
        </button>
      </div>

      <p className="mt-1.5 text-[11.5px] leading-relaxed text-slate-500 dark:text-slate-400">{rule.tip}</p>

      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {rule.examples.map((ex) => (
          <ExampleTile key={ex.w} ex={ex} onSpeak={onSpeak} compact />
        ))}
      </div>
    </div>
  )
}

/* ───────────────────────── 听辨练习 ───────────────────────── */

interface DrillQuestion {
  /** 题干主内容：规则题放字母组合 */
  prompt: string
  /** 题干上方的小提示 */
  cue: string
  /** 音标题：展示 + 朗读的单词，以及其中发目标音的字母 */
  word?: string
  hi?: string
  options: string[]
  answer: string
  explain: string
}

function buildIpaQuestions(count: number): DrillQuestion[] {
  return shuffle(PHONEMES)
    .slice(0, count)
    .map((p) => {
      const ex = p.examples[Math.floor(Math.random() * p.examples.length)]
      const pool = shuffle(
        PHONEMES.filter((x) => x.group === p.group && x.id !== p.id).map((x) => x.ipa),
      ).slice(0, 3)
      return {
        prompt: '',
        cue: p.group === 'consonant' || p.group === 'cluster' ? '看划线字母，选出这个辅音音标' : '看划线字母，选出这个元音音标',
        word: ex.w,
        hi: ex.hi,
        options: shuffle([p.ipa, ...pool]),
        answer: p.ipa,
        explain: `${ex.w}（${ex.zh}）里${ex.hi ? `「${ex.hi}」` : ''}读 ${p.ipa}`,
      }
    })
}

/** 只挑「一个字母组合对上一个音」的规则，避免 /t/ /d/ /ɪd/ 这类多音选项无法判分 */
const SINGLE_SOUND_RULES = PHONICS_RULES.filter((r) => /^\/[^/\s]+\/$/.test(r.sound))

function buildRuleQuestions(count: number): DrillQuestion[] {
  return shuffle(SINGLE_SOUND_RULES)
    .slice(0, count)
    .map((rule) => {
      const pool = shuffle(
        Array.from(new Set(SINGLE_SOUND_RULES.filter((r) => r.sound !== rule.sound).map((r) => r.sound))),
      ).slice(0, 3)
      const ex = rule.examples[0]
      return {
        prompt: rule.grapheme,
        cue: '这组字母读哪个音？',
        options: shuffle([rule.sound, ...pool]),
        answer: rule.sound,
        explain: `${rule.grapheme} 读 ${rule.sound}，例：${ex ? `${ex.w}（${ex.zh}）` : ''}`,
      }
    })
}

function DrillSection({ onSpeak }: { onSpeak: (word: string) => void }) {
  const [mode, setMode] = useState<DrillMode>('ipa')
  const [questions, setQuestions] = useState<DrillQuestion[] | null>(null)
  const [index, setIndex] = useState(0)
  const [picked, setPicked] = useState<string | null>(null)
  const [score, setScore] = useState(0)
  const [finished, setFinished] = useState(false)
  const [best, setBest] = useState(() => getDrillBest())
  const [newRecord, setNewRecord] = useState(false)

  const start = (nextMode: DrillMode) => {
    setMode(nextMode)
    setQuestions(nextMode === 'ipa' ? buildIpaQuestions(DRILL_SIZE) : buildRuleQuestions(DRILL_SIZE))
    setIndex(0)
    setPicked(null)
    setScore(0)
    setFinished(false)
    setNewRecord(false)
  }

  const question = questions?.[index] ?? null
  const total = questions?.length ?? DRILL_SIZE
  const correct = picked !== null && question !== null && picked === question.answer

  const choose = (option: string) => {
    if (!question || picked !== null) return
    setPicked(option)
    if (option === question.answer) setScore((s) => s + 1)
  }

  const next = () => {
    if (!questions) return
    if (index + 1 >= questions.length) {
      setFinished(true)
      setNewRecord(saveDrillBest(mode, score, questions.length))
      setBest(getDrillBest())
      return
    }
    setIndex((i) => i + 1)
    setPicked(null)
  }

  /* 模式选择 */
  if (!questions) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-2.5">
          <ModeCard
            active={mode === 'ipa'}
            title="看字母选音标"
            desc="看划线字母组合，从 4 个音标里选出正确读音"
            best={best.ipa}
            total={best.total}
            onClick={() => setMode('ipa')}
          />
          <ModeCard
            active={mode === 'rule'}
            title="看拼写选发音"
            desc="看到 sh / a_e / -tion，选出它读什么音"
            best={best.rule}
            total={best.total}
            onClick={() => setMode('rule')}
          />
        </div>

        <div className="surface-inset p-3.5">
          <p className="eyebrow">练习说明</p>
          <ul className="mt-1.5 space-y-1 text-[12px] leading-relaxed text-slate-600 dark:text-slate-300">
            <li>· 每轮 {DRILL_SIZE} 题，答完立刻给解析与例词。</li>
            <li>· 最佳成绩会保留，用于对照进步。</li>
            <li>· 想练口型就去「音标表」，想练规则就去「自然拼读」。</li>
          </ul>
        </div>

        <button type="button" onClick={() => start(mode)} className="btn-ink w-full">
          开始练习（{DRILL_SIZE} 题）
        </button>
      </div>
    )
  }

  /* 结果页 */
  if (finished) {
    const pct = Math.round((score / total) * 100)
    const comment =
      pct >= 90 ? '音标准确率很高，可以开始带拼读读长词了。'
        : pct >= 70 ? '已经抓住大部分对应关系，错的那几个再回顾一遍。'
          : pct >= 40 ? '有基础，但清浊、长短元音还容易混，建议回音标表跟读。'
            : '先把 26 个字母音和 5 个短元音练熟，再回来做这组题。'
    return (
      <div className="space-y-3">
        <div className="rounded-[22px] border border-slate-200/70 bg-white p-5 text-center shadow-soft dark:border-white/10 dark:bg-white/[0.04]">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
            {mode === 'ipa' ? '看字母选音标' : '看拼写选发音'} · 本轮成绩
          </p>
          <p className="mt-2 font-display text-[40px] font-bold leading-none text-slate-900 dark:text-slate-50">
            {score}
            <span className="text-[18px] font-medium text-slate-400"> / {total}</span>
          </p>
          <p className="mt-2 text-[13px] font-semibold text-brand-600 dark:text-brand-300">{pct}% 正确</p>
          <p className="mt-1 text-[11px] text-slate-400">
            历史最好 {best[mode]}/{best.total}
          </p>
          {newRecord && (
            <p className="mt-1 text-[11px] font-bold text-accent-coral">🎉 新纪录</p>
          )}
          <p className="mt-3 text-[12px] leading-relaxed text-slate-500 dark:text-slate-400">{comment}</p>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <button type="button" onClick={() => setQuestions(null)} className="btn-soft">
            换一组 / 换模式
          </button>
          <button type="button" onClick={() => start(mode)} className="btn-ink">
            再来一组
          </button>
        </div>
      </div>
    )
  }

  /* 答题页 */
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[11px] font-semibold text-slate-400">
          第 {index + 1} / {total} 题
        </span>
        <Bar pct={((index + (picked ? 1 : 0)) / total) * 100} className="flex-1" />
        <span className="text-[11px] font-bold text-brand-600 dark:text-brand-300">✔ {score}</span>
      </div>

      <div className="rounded-[22px] border border-slate-200/70 bg-white p-4 shadow-soft dark:border-white/10 dark:bg-white/[0.04]">
        <p className="text-[11px] font-semibold text-slate-400">{question?.cue}</p>

        {question?.word ? (
          <div className="mt-3">
            <div className="flex items-center justify-center gap-2.5">
              <p className="font-display text-[30px] font-bold leading-none text-slate-900 dark:text-slate-50">
                <Highlighted word={question.word} hi={question.hi} />
              </p>
              <button
                type="button"
                onClick={() => onSpeak(question.word!)}
                aria-label="播放单词发音"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700 transition active:scale-95 dark:bg-brand-400/15 dark:text-brand-200"
              >
                <SpeakerIcon width={16} height={16} />
              </button>
            </div>
            <p className="mt-1.5 text-center text-[10px] text-slate-400">点喇叭听整词，注意划线字母</p>
          </div>
        ) : (
          <p className="mt-3 text-center font-display text-[34px] font-bold leading-none text-slate-900 dark:text-slate-50">
            {question?.prompt}
          </p>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          {question?.options.map((opt) => {
            const isAnswer = opt === question.answer
            const isPicked = opt === picked
            const state = picked === null
              ? 'border-slate-200/70 bg-white/70 text-slate-700 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-100'
              : isAnswer
                ? 'border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-400/60 dark:bg-brand-400/15 dark:text-brand-100'
                : isPicked
                  ? 'border-rose-300 bg-rose-50 text-rose-600 dark:border-rose-400/40 dark:bg-rose-400/10 dark:text-rose-200'
                  : 'border-slate-200/60 bg-white/40 text-slate-400 dark:border-white/5 dark:bg-white/[0.02] dark:text-slate-500'
            return (
              <button
                key={opt}
                type="button"
                onClick={() => choose(opt)}
                disabled={picked !== null}
                className={`rounded-[16px] border px-3 py-3 font-display text-[15px] font-semibold transition active:scale-[0.98] ${state}`}
              >
                {opt}
              </button>
            )
          })}
        </div>

        {picked !== null && question && (
          <div className="mt-3">
            <div
              className={`rounded-[14px] px-3 py-2.5 text-[12px] leading-relaxed ${
                correct
                  ? 'bg-brand-50/80 text-brand-800 dark:bg-brand-400/10 dark:text-brand-100'
                  : 'bg-rose-50/80 text-rose-700 dark:bg-rose-400/10 dark:text-rose-200'
              }`}
            >
              <b>{correct ? '对了 · ' : `答案 ${question.answer} · `}</b>
              {question.explain}
            </div>
            {question.word && (
              <button
                type="button"
                onClick={() => onSpeak(question.word!)}
                className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-600 dark:text-brand-300"
              >
                <SpeakerIcon width={13} height={13} />
                再听一遍 {question.word}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => setQuestions(null)} className="btn-soft !px-4">
          退出
        </button>
        <button
          type="button"
          onClick={next}
          disabled={picked === null}
          className="btn-ink flex-1"
        >
          {index + 1 >= total ? '看成绩' : '下一题'}
        </button>
      </div>
    </div>
  )
}

function ModeCard({
  active,
  title,
  desc,
  best,
  total,
  onClick,
}: {
  active: boolean
  title: string
  desc: string
  best: number
  total: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-3 rounded-[18px] border px-3.5 py-3 text-left transition active:scale-[0.99] ${
        active
          ? 'border-brand-400/70 bg-brand-50/70 shadow-sm dark:border-brand-400/45 dark:bg-brand-400/15'
          : 'border-slate-200/70 bg-white/70 dark:border-white/10 dark:bg-white/[0.04]'
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-bold text-slate-900 dark:text-slate-50">{title}</p>
        <p className="mt-0.5 text-[11px] leading-snug text-slate-400">{desc}</p>
      </div>
      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500 dark:bg-white/10 dark:text-slate-300">
        最好 {best}/{total}
      </span>
    </button>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 rounded-full px-3 py-1.5 text-[11.5px] font-semibold transition active:scale-95 ${
        active
          ? 'border border-brand-400/70 bg-brand-50 text-brand-700 shadow-sm dark:border-brand-400/45 dark:bg-brand-400/20 dark:text-brand-100'
          : 'border border-slate-200/70 bg-white/60 text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300'
      }`}
    >
      {children}
    </button>
  )
}
