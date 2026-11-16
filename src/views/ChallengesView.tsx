import { useEffect, useMemo, useState } from 'react'
import type { ComponentType } from 'react'
import { CHALLENGE_GAMES, levelPlan, type ChallengeWord } from '../lib/challenge'
import {
  getGameStars,
  getLevelStars,
  isLevelUnlocked,
  subscribeChallengeProgress,
} from '../lib/challengeProgress'
import {
  ArrowLeftIcon,
  ChevronRightIcon,
  LockIcon,
  StarIcon,
  TargetIcon,
  HeadphonesIcon,
  EditIcon,
  BoltIcon,
  SparklesIcon,
} from '../components/icons'
import { loadLlmConfig, isConfigReady } from '../config/llm'
import {
  WordPickGame,
  ListenPickGame,
  SpellGame,
  AiSmartGame,
  type ChallengeProps,
} from '../components/ChallengeGames'

/**
 * 闯关系统：大厅（选玩法）→ 关卡列表（选关卡）→ 对局。
 * 关卡进度（星级 / 最好成绩 / 最快用时）存在 challengeProgress 里，刷新不丢。
 * 每关难度递增：干扰项越来越像，出题范围从全量 → 已掌握 → 薄弱词。
 */

const GAME_COMPONENTS: Record<string, ComponentType<ChallengeProps>> = {
  'word-pick': WordPickGame,
  'listen-pick': ListenPickGame,
  spell: SpellGame,
  'ai-smart': AiSmartGame,
}

const GAME_ICONS: Record<string, ComponentType<{ width?: number; height?: number; className?: string }>> = {
  'word-pick': TargetIcon,
  'listen-pick': HeadphonesIcon,
  spell: EditIcon,
  'ai-smart': SparklesIcon,
}

/** 关卡说明：取材范围 + 干扰项策略。 */
function levelHint(level: number): string {
  const plan = levelPlan(level)
  const focus =
    plan.focus === 'all' ? '全部单词' : plan.focus === 'learned' ? '已掌握的词' : '易错的词'
  const sim =
    plan.similarity === 0 ? '干扰项随机' : plan.similarity === 1 ? '干扰项同词性' : '干扰项高度相似'
  return `${focus} · ${sim}`
}

export default function ChallengesView({
  activeWords,
  masteredWords,
  onMaster,
}: {
  activeWords: ChallengeWord[]
  /** 已掌握的词（闯关会优先出这些词） */
  masteredWords: ChallengeWord[]
  /** 答对时把词标记为已掌握 */
  onMaster?: (word: ChallengeWord) => void
}) {
  const [gameId, setGameId] = useState<string | null>(null)
  const [level, setLevel] = useState<number | null>(null)
  // 关卡进度变化后刷新星级显示
  const [progressVersion, setProgressVersion] = useState(0)
  useEffect(() => subscribeChallengeProgress(() => setProgressVersion((v) => v + 1)), [])

  // 词池：激活窗口词 ∪ 已掌握词，取有中文释义且释义不重复的词
  const pool = useMemo(() => {
    const seen = new Set<string>()
    const out: ChallengeWord[] = []
    for (const w of [...activeWords, ...masteredWords]) {
      if (!w.meaning || !w.meaning.trim()) continue
      if (seen.has(w.meaning)) continue
      seen.add(w.meaning)
      out.push(w)
    }
    return out
  }, [activeWords, masteredWords])

  const game = CHALLENGE_GAMES.find((g) => g.id === gameId) ?? null
  const ready = pool.length >= 4
  // AI 玩法需要大模型；未配置时在卡片上提示并禁用
  const llmReady = isConfigReady(loadLlmConfig())

  // 各玩法的星级总览（progressVersion 变化时重算）
  const gameStars = useMemo(() => {
    const list = CHALLENGE_GAMES.map((g) => [g.id, getGameStars(g.id, g.levelCount)] as const)
    return Object.fromEntries(list)
  }, [progressVersion])

  /* ── 第三级：对局 ── */
  if (game && level !== null) {
    const Game = GAME_COMPONENTS[game.id]
    const nextUnlocked = isLevelUnlocked(game.id, level + 1)
    return (
      <div className="flex min-h-full flex-col">
        <div className="mb-3 flex items-center gap-2">
          <button onClick={() => setLevel(null)} aria-label="返回关卡列表" className="icon-btn !h-9 !w-9">
            <ArrowLeftIcon width={18} height={18} />
          </button>
          <h2 className="font-display text-[16px] font-bold tracking-tight text-slate-900 dark:text-slate-50">
            {game.title} · 第 {level + 1} 关
          </h2>
          <span className="ml-auto text-base">{game.emoji}</span>
        </div>
        <Game
          def={game}
          level={level}
          pool={pool}
          onMaster={onMaster}
          onExit={() => setLevel(null)}
          onNextLevel={nextUnlocked ? () => setLevel(level + 1) : undefined}
        />
      </div>
    )
  }

  /* ── 第二级：关卡列表 ── */
  if (game) {
    const Icon = GAME_ICONS[game.id]
    return (
      <div className="flex min-h-full flex-col">
        <div className="mb-3 flex items-center gap-2">
          <button onClick={() => setGameId(null)} aria-label="返回闯关列表" className="icon-btn !h-9 !w-9">
            <ArrowLeftIcon width={18} height={18} />
          </button>
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] ${game.accent}`}>
            {Icon ? <Icon width={18} height={18} /> : <TargetIcon width={18} height={18} />}
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-[16px] font-bold tracking-tight text-slate-900 dark:text-slate-50">
              {game.title}
            </h2>
            <p className="text-[10px] text-slate-400">每关 {game.perLevel} 题 · 通关解锁下一关</p>
          </div>
        </div>

        <div className="mt-2 space-y-2.5">
          {Array.from({ length: game.levelCount }, (_, i) => {
            const unlocked = isLevelUnlocked(game.id, i)
            const stars = getLevelStars(game.id, i)
            return (
              <button
                key={i}
                disabled={!unlocked}
                onClick={() => setLevel(i)}
                className={`flex w-full items-center gap-3 rounded-[18px] border px-4 py-3 text-left transition active:scale-[0.99] ${
                  unlocked
                    ? 'border-slate-900/[0.06] bg-white shadow-card hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.04]'
                    : 'border-slate-900/[0.04] bg-white/50 opacity-60 dark:border-white/[0.06] dark:bg-white/[0.02]'
                }`}
              >
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] font-display text-[15px] font-bold ${
                    stars > 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' : game.accent
                  }`}
                >
                  {unlocked ? i + 1 : <LockIcon width={16} height={16} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-bold text-slate-900 dark:text-slate-50">第 {i + 1} 关</p>
                  <p className="mt-0.5 truncate text-[11px] text-slate-400">{levelHint(i)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  {[0, 1, 2].map((k) => (
                    <StarIcon
                      key={k}
                      width={16}
                      height={16}
                      filled={k < stars}
                      className={k < stars ? 'text-amber-400' : 'text-slate-300/70 dark:text-slate-600'}
                    />
                  ))}
                </div>
                {unlocked && <ChevronRightIcon width={16} height={16} className="shrink-0 text-slate-300" />}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  /* ── 第一级：大厅 ── */
  return (
    <div className="flex min-h-full flex-col">
      <div className="mb-1">
        <h2 className="font-display text-[16px] font-bold tracking-tight text-slate-900 dark:text-slate-50">
          闯关
        </h2>
        <p className="mt-0.5 text-[11px] text-slate-400">
          用游戏巩固已学单词 · 答对进复习计划，答错进错词本
        </p>
      </div>

      <div className="mt-3 space-y-3">
        {CHALLENGE_GAMES.map((g) => {
          const Icon = GAME_ICONS[g.id]
          const stars = gameStars[g.id] ?? getGameStars(g.id, g.levelCount)
          const needsLlm = !!g.requiresLlm && !llmReady
          const disabled = !ready || needsLlm
          return (
            <button
              key={g.id}
              disabled={disabled}
              onClick={() => setGameId(g.id)}
              className="flex w-full items-start gap-3 rounded-[20px] border border-slate-900/[0.04] bg-white p-4 text-left shadow-card transition hover:bg-slate-50 active:scale-[0.99] disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.06]"
            >
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] ${g.accent}`}>
                {Icon ? <Icon width={20} height={20} /> : <TargetIcon width={20} height={20} />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-[15px] font-bold text-slate-900 dark:text-slate-50">{g.title}</p>
                  <span className="rounded-full bg-slate-900/[0.05] px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-400">
                    {g.tagline}
                  </span>
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-slate-400">
                  {needsLlm ? '需要先在「我 → 大模型设置」里配置接口与 Key' : g.desc}
                </p>
                <div className="mt-2 flex items-center gap-1.5">
                  <div className="flex items-center gap-0.5">
                    {[0, 1, 2].map((k) => (
                      <StarIcon
                        key={k}
                        width={13}
                        height={13}
                        filled={k < stars.stars % 3}
                        className="text-amber-400"
                      />
                    ))}
                  </div>
                  <span className="text-[10px] font-semibold text-slate-400">
                    {stars.cleared}/{stars.levels} 关 · {stars.stars} 星
                  </span>
                </div>
              </div>
              <ChevronRightIcon width={18} height={18} className="mt-1 shrink-0 text-slate-300" />
            </button>
          )
        })}

        {pool.length < 4 && (
          <p className="rounded-[16px] bg-slate-900/[0.03] px-4 py-3 text-center text-[12px] text-slate-400 dark:bg-white/[0.04]">
            先去「背词」掌握一些单词，再来闯关会更有意思～
          </p>
        )}
      </div>

      <div className="mt-auto flex items-center justify-center gap-1.5 pt-6 text-[12px] font-semibold text-slate-400">
        <BoltIcon width={14} height={14} />
        答对进复习计划 · 答错进错词本
      </div>
    </div>
  )
}
