import { useMemo, useState } from 'react'
import type { ComponentType } from 'react'
import { ALL_WORDS, type Word } from '../data'
import { TargetIcon, SparklesIcon, ArrowLeftIcon } from '../components/icons'

/* ——————————————————————————————————————————————————————
 * 闯关系统
 * - ChallengeDef 是「一个游戏」的契约；新增游戏只需往 CHALLENGES 里加一项。
 * - ChallengesView（闯关大厅）负责列出所有游戏，点击后原地渲染对应 Component。
 * - 首个游戏「词义闪电选」已落地，后续游戏按同一接口接入即可，无需改动大厅。
 * —————————————————————————————————————————————————————— */

export interface ChallengeProps {
  /** 当前可练习的词池（激活窗口词 ∪ 已掌握词，且带中文释义）。 */
  pool: Word[]
  /** 回到闯关大厅。 */
  onExit: () => void
}

interface ChallengeDef {
  id: string
  title: string
  emoji: string
  tagline: string
  desc: string
  /** 图标底色 / 字色（tailwind 类，用于区分不同游戏）。 */
  accent: string
  Component: ComponentType<ChallengeProps>
}

import { WordPickGame } from '../components/ChallengeGames'

const CHALLENGES: ChallengeDef[] = [
  {
    id: 'word-pick',
    title: '词义闪电选',
    emoji: '⚡',
    tagline: '看词选义 · 越快越准',
    desc: '给出一个单词，四选一选出正确中文释义，10 题挑战你的反应速度。',
    accent: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
    Component: WordPickGame,
  },
  // 后续游戏在此追加，例如：听音选词 / 拼写填空 / 连连看 / 限时消消乐……
]

export default function ChallengesView({
  activeWords,
  onExit,
}: {
  activeWords: Word[]
  onExit: () => void
}) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const active = CHALLENGES.find((c) => c.id === activeId) ?? null

  // 词池：优先用激活窗口词；不足 8 个时退化为全库，保证游戏能出题。
  const pool = useMemo(
    () =>
      (activeWords.length >= 8 ? activeWords : ALL_WORDS)
        .filter((w) => w.meaning && w.meaning.trim())
        .filter((w, i, arr) => arr.findIndex((x) => x.meaning === w.meaning) === i),
    [activeWords],
  )

  if (active) {
    const Game = active.Component
    return (
      <div className="flex min-h-full flex-col">
        <div className="mb-3 flex items-center gap-2">
          <button onClick={() => setActiveId(null)} aria-label="返回闯关列表" className="icon-btn !h-9 !w-9">
            <ArrowLeftIcon width={18} height={18} />
          </button>
          <h2 className="font-display text-[16px] font-bold tracking-tight text-slate-900 dark:text-slate-50">
            {active.title}
          </h2>
          <span className="ml-auto text-base">{active.emoji}</span>
        </div>
        <Game pool={pool} onExit={() => setActiveId(null)} />
      </div>
    )
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="mb-1">
        <h2 className="font-display text-[16px] font-bold tracking-tight text-slate-900 dark:text-slate-50">
          闯关
        </h2>
        <p className="mt-0.5 text-[11px] text-slate-400">用游戏巩固已学单词 · 边玩边记</p>
      </div>

      <div className="mt-3 space-y-3">
        {CHALLENGES.map((c) => {
          const ready = pool.length >= 4
          return (
            <button
              key={c.id}
              disabled={!ready}
              onClick={() => setActiveId(c.id)}
              className="flex w-full items-start gap-3 rounded-[20px] border border-slate-900/[0.04] bg-white p-4 text-left shadow-float transition hover:bg-slate-50 active:scale-[0.99] disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.06]"
            >
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] text-xl ${c.accent}`}>
                {c.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-[15px] font-bold text-slate-900 dark:text-slate-50">{c.title}</p>
                  <span className="rounded-full bg-slate-900/[0.05] px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-400">
                    {c.tagline}
                  </span>
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-slate-400">{c.desc}</p>
              </div>
              <TargetIcon width={18} height={18} className="mt-1 shrink-0 text-slate-300" />
            </button>
          )
        })}

        {pool.length < 4 && (
          <p className="rounded-[16px] bg-slate-900/[0.03] px-4 py-3 text-center text-[12px] text-slate-400 dark:bg-white/[0.04]">
            先去「背词」掌握一些单词，再来闯关会更有意思～
          </p>
        )}
      </div>

      <button
        onClick={onExit}
        className="mt-auto flex items-center justify-center gap-1.5 pt-6 text-[12px] font-semibold text-slate-400"
      >
        <SparklesIcon width={14} height={14} />
        更多闯关玩法正在规划中
      </button>
    </div>
  )
}
