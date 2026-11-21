import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ALL_WORDS, CATEGORIES, groupByCategory } from '../data'
import type { CategoryId, Word } from '../data'
import { useSpeech } from '../hooks/useSpeech'
import { useLexiconVersion } from '../hooks/useLexicon'
import { useRichEntry } from '../hooks/useRichEntry'
import { wordKey } from '../lib/cluster'
import { lookupWord } from '../lib/dict'
import { meaningGroups } from '../lib/meaningGroups'
import { textTokens } from '../lib/parse'
import { POS_GROUPS, posLabel, type PosId } from '../lib/pos'
import { DisplayModeToggle, type DisplayMode } from './display'
import { CheckIcon, ChevronRightIcon, SearchIcon, SlidersIcon, SpeakerIcon, XIcon } from './icons'
import { Sheet } from './Sheet'

// Scene category accent dots (used in grouped section headers).
export const CAT_DOT: Record<CategoryId, string> = {
  people: 'bg-pink-500',
  body: 'bg-rose-500',
  health: 'bg-red-400',
  clothes: 'bg-fuchsia-500',
  food: 'bg-orange-500',
  home: 'bg-indigo-500',
  animals: 'bg-amber-500',
  nature: 'bg-green-500',
  space: 'bg-cyan-500',
  time: 'bg-violet-500',
  numbers: 'bg-red-500',
  colors: 'bg-purple-500',
  size: 'bg-teal-500',
  actions: 'bg-lime-500',
  emotions: 'bg-rose-400',
  communication: 'bg-sky-400',
  education: 'bg-teal-400',
  work: 'bg-emerald-500',
  travel: 'bg-cyan-400',
  shopping: 'bg-amber-600',
  society: 'bg-slate-500',
  science: 'bg-emerald-600',
  media: 'bg-rose-500',
  arts: 'bg-fuchsia-600',
  thinking: 'bg-indigo-400',
  grammar: 'bg-slate-400',
  questions: 'bg-blue-500',
  toys: 'bg-yellow-500',
  idioms: 'bg-indigo-500',
  sports: 'bg-lime-600',
  music: 'bg-pink-600',
  tech: 'bg-blue-600',
  city: 'bg-stone-500',
  festival: 'bg-rose-600',
  law: 'bg-slate-700',
  military: 'bg-stone-700',
  religion: 'bg-indigo-600',
  weather: 'bg-sky-600',
}

/**
 * 喇叭播放态只显示在「最近点击的那一个」上。
 * useSpeech 的 speaking 是模块级全局状态，词表里每张卡片的喇叭都会订阅它；
 * 若直接用它驱动 animate-pulse（透明度呼吸 = 变暗再变亮），点一个喇叭会让
 * 所有卡片的喇叭一起呼吸。这里改用实例级 active + 令牌：谁被点击谁 claim，
 * 广播时其他实例立即熄灭自己的播放态，播放结束只熄灭仍持有最新令牌的那个。
 */
let speakerTokenSeq = 0
const speakerTokenSubscribers = new Set<(token: number) => void>()

export function SpeakerBtn({
  text,
  className = '',
  rate,
  iconSize = 18,
}: {
  text: string
  className?: string
  rate?: number
  iconSize?: number
}) {
  const { speak, loading, preload, downloadStatus } = useSpeech()
  const [active, setActive] = useState(false)
  const tokenRef = useRef(0)

  useEffect(() => {
    const subscriber = (token: number) => {
      if (token !== tokenRef.current) setActive(false)
    }
    speakerTokenSubscribers.add(subscriber)
    return () => {
      speakerTokenSubscribers.delete(subscriber)
    }
  }, [])

  return (
    <button
      type="button"
      onClick={async (e) => {
        e.stopPropagation()
        // 模型未就绪时先初始化（首次点击可能加载中，第二次必响）
        if (downloadStatus !== 'ready') {
          try {
            await preload()
          } catch {
            /* ignore */
          }
        }
        const token = ++speakerTokenSeq
        tokenRef.current = token
        speakerTokenSubscribers.forEach((fn) => fn(token))
        setActive(true)
        speak(text, rate, () => {
          if (tokenRef.current === token) setActive(false)
        })
      }}
      title={loading ? '正在加载语音模型…' : '发音'}
      aria-label="朗读"
      className={`inline-flex items-center justify-center rounded-full p-2 text-brand-700 transition hover:bg-brand-50 hover:text-brand-800 active:scale-95 dark:text-brand-300 dark:hover:bg-brand-500/10 ${
        active ? 'animate-pulse' : ''
      } ${className}`}
    >
      <SpeakerIcon width={iconSize} height={iconSize} />
    </button>
  )
}

/* ----------------------------- Progress summary ----------------------------- */
/**
 * 页头掌握进度条：掌握率 + 已掌握/总词数 + 细进度条。
 * 首页与人教主页面用它替代原来的深色进度卡，更轻、不抢内容。
 */
export function ProgressSummary({ done, total, pct }: { done: number; total: number; pct: number }) {
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="font-display text-[30px] font-semibold leading-none tracking-tight text-slate-900 dark:text-slate-50">
          {pct}
          <span className="ml-0.5 text-base font-normal text-slate-400">%</span>
        </span>
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">掌握率</span>
        <span className="ml-auto shrink-0 text-[12px] font-semibold text-slate-500 dark:text-slate-400">
          {done}
          <span className="font-normal text-slate-400"> / {total} 已掌握</span>
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-900/[0.07] dark:bg-white/10">
        <div
          className="h-full rounded-full bg-brand-500 transition-all duration-500 ease-spring"
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
    </div>
  )
}

/* ----------------------------- Browse card ----------------------------- */
export function WordCard({
  word,
  mastered,
  mode = 'both',
  onOpen,
  onToggleMastered,
}: {
  word: Word
  mastered: boolean
  /** 列表显示语言：只影响卡片本身，详情保持完整 */
  mode?: DisplayMode
  onOpen: () => void
  onToggleMastered: () => void
}) {
  const showEn = mode !== 'zh'
  const showZh = mode !== 'en'
  return (
    // 外层不能用 <button>：内部还要放「掌握勾选」和 SpeakerBtn 两个可交互控件，
    // 原生 button 嵌套会让键盘 Tab / Enter 行为错乱。改用带 role 的 div + 键盘处理。
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
      className={`group relative flex flex-col items-start gap-1 overflow-hidden rounded-[16px] border p-3 text-left transition duration-200 hover:-translate-y-0.5 hover:shadow-soft active:scale-[0.995] ${
        mastered
          ? 'border-brand-200/60 bg-brand-50/40 dark:border-brand-500/20 dark:bg-brand-500/5'
          : 'border-slate-200/60 bg-white/65 hover:border-brand-300/60 hover:bg-white dark:border-slate-700/50 dark:bg-slate-800/45 dark:hover:border-brand-500/35 dark:hover:bg-slate-800/70'
      }`}
    >
      <div className="relative flex w-full items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {showEn ? (
            <span className="min-w-0 break-words font-display text-[18px] font-semibold leading-tight tracking-tight text-slate-900 dark:text-slate-50">
              {word.word}
            </span>
          ) : (
            <span className="min-w-0 break-words text-base font-bold leading-snug text-slate-900 dark:text-slate-50">
              {word.meaning}
            </span>
          )}
        </div>
        <button
          type="button"
          title={mastered ? '已掌握' : '标记为已掌握'}
          aria-label={mastered ? '已掌握' : '标记为已掌握'}
          aria-pressed={mastered}
          onClick={(e) => {
            e.stopPropagation()
            onToggleMastered()
          }}
          onKeyDown={(e) => e.stopPropagation()}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition ${
            mastered
              ? 'border-brand-600 bg-brand-600 text-white shadow-sm dark:border-brand-400/50 dark:bg-brand-500/25 dark:text-brand-200'
              : 'border-slate-300/70 bg-white/40 text-transparent hover:border-brand-400 hover:text-brand-400 dark:border-slate-600 dark:bg-slate-900/30'
          }`}
        >
          <CheckIcon width={14} height={14} />
        </button>
      </div>
      {showEn && <span className="relative text-[11px] text-slate-400 dark:text-slate-500">{word.ipa}</span>}
      <div className="relative flex w-full items-end justify-between gap-2">
        {showZh ? (
          <span
            className={`min-w-0 text-[12px] leading-relaxed text-slate-500 dark:text-slate-400 ${
              showEn ? 'line-clamp-1' : 'line-clamp-2'
            }`}
          >
            {word.meaning}
          </span>
        ) : <span className="flex-1" />}
        <SpeakerBtn text={word.word} iconSize={16} className="-mb-1 -mr-1 shrink-0" />
      </div>
    </div>
  )
}

/* ----------------------------- Detail body（整页展示） ----------------------------- */
export function WordDetailBody({
  word,
  mastered,
  onOpenWord,
}: {
  word: Word
  mastered: boolean
  /** 例句中点词回调，打开对应词的详情 */
  onOpenWord?: (w: Word) => void
}) {
  /** 富字典（例句 / 短语 / 近义词）按需补齐：课程词自带例句优先，不足时用富字典兜底。 */
  const rich = useRichEntry(word)
  /** 释义按词性分组展示（词性列 + 正文悬挂缩进） */
  const meaning = useMemo(() => meaningGroups(word.meaning), [word.meaning])

  /** 词键 → Word 的快速索引：例句点词时查词用（扩展词加载后随版本重建） */
  const lexV = useLexiconVersion()
  const wordMap = useMemo(() => {
    const m = new Map<string, Word>()
    for (const w of ALL_WORDS) m.set(wordKey(w.word), w)
    return m
  }, [lexV])

  /** 从例句里的原文 token 找到对应的完整 Word（处理屈折变体） */
  const resolveWord = useMemo(() => {
    return (token: string): Word | null => {
      const entry = lookupWord(token)
      if (!entry) return null
      // entry.key 是 wordKey 格式（小写规范化），用它查 ALL_WORDS 索引拿完整 Word
      return wordMap.get(entry.key) ?? wordMap.get(wordKey(entry.word)) ?? null
    }
  }, [wordMap])

  /** 渲染可点击的英文文本：分词 + 每个英文词可点击查词 */
  const renderClickableEn = useMemo(() => {
    return (en: string) => {
      // textTokens 需要一个变体索引；传空 Map 会走简单分词——任意英文 token 都是 isWord
      const nodes = textTokens(en, new Map())
      return nodes.map((n, i) =>
        n.isWord
          ? (
            <button
              key={i}
              type="button"
              onClick={() => {
                if (!onOpenWord) return
                const hit = resolveWord(n.text)
                if (hit) onOpenWord(hit)
              }}
              className={`rounded px-0.5 transition ${
                onOpenWord && resolveWord(n.text)
                  ? 'hover:bg-brand-100 hover:text-brand-700 active:bg-brand-500/25 dark:hover:bg-brand-500/20 dark:hover:text-brand-300'
                  : ''
              }`}
              title={onOpenWord && resolveWord(n.text) ? '点击查词' : undefined}
            >
              {n.text}
            </button>
          )
          : (
            <span key={i}>{n.text}</span>
          ),
      )
    }
  }, [onOpenWord, resolveWord])

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">词汇级别</p>
          {/* 词形与音标同一行：音标跟在词形右侧、基线对齐，长词自动换行 */}
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <h2 className="break-words font-display text-[34px] font-semibold leading-none tracking-tight text-slate-900 dark:text-slate-50">
              {word.word}
            </h2>
            <span className="shrink-0 text-[15px] text-slate-400">{word.ipa}</span>
          </div>
        </div>
        <SpeakerBtn
          text={word.word}
          rate={0.85}
          iconSize={22}
          className="!h-12 !w-12 shrink-0 !bg-brand-50 !p-0 dark:!bg-brand-500/10"
        />
      </div>

      {/* 徽标行：词性徽标已移除（释义区仍按词性分组展示），仅保留常用词 / 已掌握 */}
      {(word.common || mastered) && (
        <div className="no-scrollbar mt-3 flex min-w-0 items-center gap-1.5 overflow-x-auto">
          {word.common && (
            <span className="shrink-0 whitespace-nowrap rounded-full border border-amber-200/60 bg-amber-100/70 px-2 py-0.5 text-[11px] font-bold text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/15 dark:text-amber-300">
              常用词
            </span>
          )}
          {mastered && (
            <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-brand-200/70 bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-700 dark:border-brand-500/25 dark:bg-brand-500/10 dark:text-brand-300">
              <CheckIcon width={11} height={11} />
              已掌握
            </span>
          )}
        </div>
      )}

      {/* 释义：按词性分组两列展示。词性列宽 auto 自适应本词最长标签：
          短标签（n.）不再留一大截空白，长标签（modal v.）也不会被 34px 挤换行；
          同一卡片内各行释义左缘仍保持对齐 */}
      <div className="surface-inset mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-0.5 px-3.5 py-3">
        {meaning.length > 0 ? (
          meaning.map((g, i) => (
            <Fragment key={i}>
              <span className="shrink-0 text-[13px] font-medium leading-[1.7] text-brand-600 dark:text-brand-400">
                {g.pos}
              </span>
              <span className="min-w-0 text-[14.5px] leading-[1.7] text-slate-700 dark:text-slate-200">
                {g.text}
              </span>
            </Fragment>
          ))
        ) : (
          <p className="col-span-2 text-[14.5px] leading-[1.7] text-slate-700 dark:text-slate-200">（暂无释义）</p>
        )}
      </div>

      <p className="mb-2 mt-4 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
        Examples · 例句{onOpenWord && <span className="ml-2 font-normal tracking-normal text-slate-300">（点词查卡）</span>}
      </p>
      {rich.examples.length > 0 ? (
        <ul className="space-y-2">
          {rich.examples.map((ex, i) => (
            <li key={i} className="surface px-3.5 py-3">
              <div className="flex items-start justify-between gap-2">
                <p className="font-display text-[14.5px] leading-relaxed text-slate-800 dark:text-slate-100">
                  {onOpenWord ? renderClickableEn(ex.en) : ex.en}
                </p>
                <SpeakerBtn text={ex.en} rate={0.9} iconSize={16} className="-mr-1 -mt-1 shrink-0" />
              </div>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-slate-500 dark:text-slate-400">{ex.zh}</p>
            </li>
          ))}
        </ul>
      ) : rich.loading ? (
        <p className="rounded-[18px] border border-dashed border-slate-300/80 py-5 text-center text-sm text-slate-400 dark:border-slate-700/70">
          正在加载例句…
        </p>
      ) : (
        <p className="rounded-[18px] border border-dashed border-slate-300/80 py-5 text-center text-sm text-slate-400 dark:border-slate-700/70">
          暂无例句
        </p>
      )}

      {/* 短语搭配 */}
      {rich.phrases.length > 0 && (
        <>
          <p className="mb-2 mt-4 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
            Phrases · 短语
          </p>
          <ul className="space-y-1.5">
            {rich.phrases.map((ph, i) => (
              <li key={i} className="surface flex items-center gap-3 px-3.5 py-2">
                <div className="min-w-0 flex-1">
                  <p className="font-display text-[14.5px] leading-relaxed text-slate-800 dark:text-slate-100">{ph.en}</p>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-slate-500 dark:text-slate-400">{ph.zh}</p>
                </div>
                <SpeakerBtn text={ph.en} rate={0.9} iconSize={16} className="-mr-1 shrink-0" />
              </li>
            ))}
          </ul>
        </>
      )}

      {/* 近义词（按词性分组，词条可点击查词） */}
      {rich.synonyms.length > 0 && (
        <>
          <p className="mb-2 mt-4 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
            Synonyms · 近义词
          </p>
          <ul className="space-y-1.5">
            {rich.synonyms.map((sy, i) => (
              <li key={i} className="surface px-3.5 py-2.5">
                <div className="flex items-start gap-2">
                  {sy.pos && (
                    <span className="shrink-0 whitespace-nowrap rounded-full border border-slate-200/60 bg-white/70 px-1.5 py-0.5 text-[10.5px] font-bold text-slate-500 dark:border-slate-700/60 dark:bg-slate-800/60 dark:text-slate-300">
                      {sy.pos}
                    </span>
                  )}
                  <p className="min-w-0 text-[12.5px] leading-relaxed text-slate-600 dark:text-slate-300">{sy.meaning}</p>
                </div>
                <p className="mt-1 text-[13.5px] leading-relaxed text-slate-700 dark:text-slate-200">
                  {sy.words.map((w, j) => {
                    const hit = onOpenWord ? resolveWord(w) : null
                    return (
                      <span key={j}>
                        {j > 0 && <span className="mx-1.5 text-slate-300 dark:text-slate-600">/</span>}
                        {hit ? (
                          <button
                            type="button"
                            onClick={() => onOpenWord?.(hit)}
                            className="rounded px-0.5 text-brand-700 transition hover:bg-brand-100 active:bg-brand-500/25 dark:text-brand-300 dark:hover:bg-brand-500/20"
                            title="点击查词"
                          >
                            {w}
                          </button>
                        ) : (
                          <span>{w}</span>
                        )}
                      </span>
                    )
                  })}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

/**
 * 单词详情弹层：点击词卡打开。移动端是底部弹层、桌面端居中浮层，
 * 底部固定「标记为已掌握」，不再跳转整页。
 */
export function WordModal({
  word,
  mastered,
  onClose,
  onPop,
  onToggleMastered,
  onOpenWord,
}: {
  word: Word
  mastered: boolean
  onClose: () => void
  /** 卡片栈回退按钮：传了说明栈里至少有两张，可以返回上一个词 */
  onPop?: () => void
  onToggleMastered: () => void
  /** 例句中点词打开新的 WordModal；不传则禁用点词交互 */
  onOpenWord?: (w: Word) => void
}) {
  // 正文里已有大号词形，头部不再重复标题：有上一词时左侧放返回按钮，否则留白
  return (
    <Sheet
      open
      onClose={onClose}
      title=""
      headerLeading={
        onPop && (
          <button
            onClick={onPop}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-[12px] font-semibold text-brand-700 transition hover:bg-brand-100 active:scale-[0.97] dark:bg-brand-500/10 dark:text-brand-300 dark:hover:bg-brand-500/15"
          >
            <ChevronRightIcon width={14} height={14} className="rotate-180" />
            返回上一词
          </button>
        )
      }
      footer={
        <button
          onClick={() => {
            // 系统只有「已掌握 / 未掌握」两态：一次点击即切换并关闭详情。
            onToggleMastered()
            onClose()
          }}
          className={`flex w-full items-center justify-center gap-1.5 rounded-[18px] py-3.5 text-[13px] font-semibold transition active:scale-[0.985] ${
            mastered
              ? 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/15'
              : 'border border-brand-500/50 bg-brand-100 text-brand-800 hover:bg-brand-200 dark:border-brand-400/50 dark:bg-brand-500/15 dark:text-brand-200 dark:hover:bg-brand-500/25'
          }`}
        >
          {mastered ? <XIcon width={16} height={16} /> : <CheckIcon width={16} height={16} />}
          {mastered ? '取消已掌握' : '加入已掌握'}
        </button>
      }
    >
      <WordDetailBody word={word} mastered={mastered} onOpenWord={onOpenWord} />
    </Sheet>
  )
}

export function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="surface p-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p className={`mt-1 font-display text-3xl font-semibold ${accent ? 'text-brand-700 dark:text-brand-300' : 'text-slate-900 dark:text-slate-100'}`}>
        {value}
      </p>
    </div>
  )
}

export function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[12px] font-semibold transition active:scale-[0.98] ${
        active
          ? 'border-brand-400 bg-brand-50 text-brand-700 dark:border-brand-500/50 dark:bg-brand-500/15 dark:text-brand-200'
          : 'border-slate-200/70 bg-white/70 text-slate-600 hover:border-slate-300 hover:bg-white dark:border-slate-700/60 dark:bg-slate-800/50 dark:text-slate-300 dark:hover:bg-slate-800'
      }`}
    >
      {children}
    </button>
  )
}

/* 词性筛选：多选（可组合）。放在筛选弹层里展示全部词性。 */
function PosFilterRow({
  value,
  onChange,
  counts,
}: {
  value: Set<PosId>
  onChange: (v: Set<PosId>) => void
  counts?: Record<PosId, number>
}) {
  const toggle = (id: PosId) => {
    const next = new Set(value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange(next)
  }

  return (
    <div className="flex flex-wrap gap-2">
      <FilterChip active={value.size === 0} onClick={() => onChange(new Set())}>
        全部词性
      </FilterChip>
      {POS_GROUPS.map((p) => {
        const active = value.has(p.id)
        const n = counts?.[p.id]
        return (
          <FilterChip key={p.id} active={active} onClick={() => toggle(p.id)}>
            {posLabel(p.id)}
            {counts && (
              <span className={`ml-1 text-[11px] ${active ? 'text-brand-600 dark:text-brand-200/70' : 'text-slate-400'}`}>{n}</span>
            )}
          </FilterChip>
        )
      })}
    </div>
  )
}

function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section>
      <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </section>
  )
}

/* Configurable filter bar reused by Home and Unmastered list views. */
export function FilterBar({
  catFilter,
  setCatFilter,
  search,
  setSearch,
  showMasterChips = false,
  showUnmastered,
  setShowUnmastered,
  showMastered,
  setShowMastered,
  displayMode,
  setDisplayMode,
  hideCategory = false,
  posFilter,
  setPosFilter,
  posCounts,
}: {
  catFilter: CategoryId | 'all'
  setCatFilter: (v: CategoryId | 'all') => void
  search: string
  setSearch: (v: string) => void
  showMasterChips?: boolean
  showUnmastered?: boolean
  setShowUnmastered?: (v: boolean) => void
  showMastered?: boolean
  setShowMastered?: (v: boolean) => void
  /** 传了才显示「中英 / 英文 / 中文」切换（列表卡片显示语言） */
  displayMode?: DisplayMode
  setDisplayMode?: (m: DisplayMode) => void
  hideCategory?: boolean
  /** 传了才显示词性筛选（多选，可组合） */
  posFilter?: Set<PosId>
  setPosFilter?: (v: Set<PosId>) => void
  /** 各词性在当前其他筛选条件下的词数 */
  posCounts?: Record<PosId, number>
}) {
  const [open, setOpen] = useState(false)

  const reset = () => {
    setCatFilter('all')
    setShowUnmastered?.(true)
    setShowMastered?.(false)
    setPosFilter?.(new Set())
    setSearch('')
  }

  return (
    <div
      className="fixed inset-x-0 z-20 border-b border-slate-900/[0.06] bg-[#f6f3ea]/90 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/90"
      style={{ top: 'calc(env(safe-area-inset-top) + 56px)' }}
    >
      <div className="mx-auto max-w-5xl px-4 py-2">
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <SearchIcon
              width={17}
              height={17}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="输入单词，查释义"
              aria-label="输入单词，查释义"
              className="field h-11 pl-11 pr-10 !py-0 text-[16px] sm:text-[13px]"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                aria-label="清除搜索"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-slate-400 transition hover:bg-slate-900/5 hover:text-slate-700 dark:hover:bg-white/10"
              >
                <XIcon width={15} height={15} />
              </button>
            )}
          </div>
          <button
            onClick={() => setOpen(true)}
            className="flex h-11 shrink-0 items-center gap-2 rounded-[18px] border border-slate-200/70 bg-white/70 px-3.5 text-[13px] font-semibold text-slate-700 transition hover:bg-white active:scale-[0.99] dark:border-slate-700/60 dark:bg-slate-800/50 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <SlidersIcon width={17} height={17} />
            <span className="hidden sm:inline">筛选</span>
          </button>
        </div>

        {/* 高频操作外置：掌握状态与卡片显示语言不进筛选弹层，一眼就能切换 */}
        {(showMasterChips || (displayMode && setDisplayMode)) && (
          <div className="no-scrollbar mt-2 flex items-center gap-1.5 overflow-x-auto">
            {showMasterChips && (
              <>
                <FilterChip active={!!showUnmastered} onClick={() => setShowUnmastered?.(!(showUnmastered ?? false))}>
                  未掌握
                </FilterChip>
                <FilterChip active={!!showMastered} onClick={() => setShowMastered?.(!(showMastered ?? false))}>
                  已掌握
                </FilterChip>
              </>
            )}
            {displayMode && setDisplayMode && (
              <DisplayModeToggle className="ml-auto" value={displayMode} onChange={setDisplayMode} />
            )}
          </div>
        )}
      </div>

      {/* 筛选弹层：与全局模态一致从底部弹出；内容区限高滚动，避免占满整屏 */}
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="筛选单词"
        subtitle="仅用于浏览；输入关键词查词时自动忽略筛选、检索当前词库"
        footer={
          <button
            onClick={reset}
            className="w-full rounded-[18px] border border-slate-200/70 bg-white/70 py-3 text-sm font-semibold text-slate-600 transition hover:bg-white dark:border-slate-700/60 dark:bg-slate-800/50 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            重置
          </button>
        }
      >
        <div className="no-scrollbar max-h-[50dvh] space-y-4 overflow-y-auto pb-1">
          {!hideCategory && (
            <FilterGroup label="场景">
              <FilterChip active={catFilter === 'all'} onClick={() => setCatFilter('all')}>
                全部场景
              </FilterChip>
              {CATEGORIES.map((c) => (
                <FilterChip key={c.id} active={catFilter === c.id} onClick={() => setCatFilter(c.id)}>
                  {c.label}
                </FilterChip>
              ))}
            </FilterGroup>
          )}

          {posFilter && setPosFilter && (
            <FilterGroup label="词性">
              <PosFilterRow value={posFilter} onChange={setPosFilter} counts={posCounts} />
            </FilterGroup>
          )}
        </div>
      </Sheet>
    </div>
  )
}

/* Grouped word grid with empty state, reused by all browse pages. */
const GRID_BATCH = 60

export function WordGrid({
  words,
  masteredSet,
  mode = 'both',
  onOpen,
  onToggleMastered,
  resetKey,
}: {
  words: Word[]
  masteredSet: Set<string>
  mode?: DisplayMode
  onOpen: (w: Word) => void
  onToggleMastered: (w: Word) => void
  /** 筛选条件签名：只有它变化才重置渐进加载批次；标记掌握不该让整批卡片重新挂载 */
  resetKey?: string
}) {
  const groups = useMemo(() => groupByCategory(words), [words])
  const themeCount = useMemo(() => groups.reduce((s, g) => s + g.themes.length, 0), [groups])

  /** 渐进渲染：一次只挂载一批卡片，滚动到底自动追加。上千张卡片同时布局是切页卡顿的主因。 */
  const [limit, setLimit] = useState(GRID_BATCH)
  useEffect(() => setLimit(GRID_BATCH), [resetKey])
  const shown = Math.min(limit, words.length)
  const hasMore = shown < words.length
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  const loadMore = () => setLimit((l) => l + GRID_BATCH)

  // 只在「是否还有更多」变化时重建观察器：标记掌握让词数 -1 时不再触发一次批量追加，
  // 列表只移除那一张卡片、其余自然向上补位，不会整屏闪一下。
  useEffect(() => {
    if (!hasMore) return
    const el = sentinelRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setLimit((l) => l + GRID_BATCH)
      },
      { rootMargin: '800px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [hasMore])

  // 按分类 / 主题顺序截取前 shown 个词，保持分组结构
  const sliced = useMemo(() => {
    let left = shown
    return groups
      .map((g) => {
        const themes: typeof g.themes = []
        let count = 0
        for (const t of g.themes) {
          if (left <= 0) break
          const items = t.items.slice(0, left)
          left -= items.length
          count += items.length
          if (items.length) themes.push({ ...t, items })
        }
        return { ...g, themes, count }
      })
      .filter((g) => g.themes.length > 0)
  }, [groups, shown])

  if (words.length === 0) {
    return (
      <div className="rounded-[26px] border border-dashed border-slate-300/70 bg-white/35 px-6 py-16 text-center dark:border-slate-700/70 dark:bg-slate-800/20">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-900/5 text-slate-400 dark:bg-white/5 dark:text-slate-500">
          <SearchIcon width={24} height={24} />
        </div>
        <p className="text-sm font-bold text-slate-600 dark:text-slate-300">没有找到匹配的单词</p>
        <p className="mt-1 text-xs text-slate-400">换个关键词，或调整筛选条件试试</p>
      </div>
    )
  }

  return (
    <>
      <div className="mb-4 flex items-end justify-between gap-3">
        <p className="eyebrow">Vocabulary</p>
        <p className="text-[11px] text-slate-400">
          {shown}/{words.length} 词 · {groups.length} 个场景 · {themeCount} 个分组
        </p>
      </div>
      <div className="space-y-5">
        {sliced.map((g) => (
          <section key={g.category.id}>
            <div className="mb-3 flex items-center gap-2.5">
              <span className={`h-2.5 w-2.5 rounded-full ${CAT_DOT[g.category.id]}`} />
              <h2 className="font-display text-[17px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                {g.category.label}
              </h2>
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                {g.category.en}
              </span>
              <span className="ml-auto rounded-full border border-slate-200/60 bg-white/60 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500 dark:border-slate-700/50 dark:bg-slate-800/40 dark:text-slate-400">
                {g.count}
              </span>
            </div>
            <div className="space-y-2.5">
              {g.themes.map((t) => (
                <div key={t.id}>
                  {t.label && (
                    <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                      <span className={`h-1.5 w-1.5 rounded-full ${CAT_DOT[g.category.id]} opacity-60`} />
                      {t.label}
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                    {t.items.map((w) => (
                      <WordCard
                        key={w.word}
                        word={w}
                        mastered={masteredSet.has(w.word)}
                        mode={mode}
                        onOpen={() => onOpen(w)}
                        onToggleMastered={() => onToggleMastered(w)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {shown < words.length && (
        <div ref={sentinelRef} className="mt-8 flex justify-center">
          <button onClick={loadMore} className="btn-soft">
            加载更多（{shown}/{words.length}）
          </button>
        </div>
      )}
    </>
  )
}
