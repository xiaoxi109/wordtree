import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  SENTENCE_SCENES,
  SHORT_SENTENCES,
  type SentenceSceneId,
  type ShortSentence,
} from '../data/sentences'
import {
  getSentenceMastered,
  subscribeSentenceProgress,
  toggleSentenceMastered,
} from '../lib/sentenceProgress'
import { SpeakerBtn } from '../components/word'
import { DisplayModeToggle, type DisplayMode } from '../components/display'
import { Sheet } from '../components/Sheet'
import { useSpeech } from '../hooks/useSpeech'
import { CheckIcon, SlidersIcon } from '../components/icons'

type StatusFilter = 'all' | 'unmastered' | 'mastered'

const STATUS_OPTIONS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'unmastered', label: '未掌握' },
  { id: 'mastered', label: '已掌握' },
]

/**
 * 短句页的显示语言单独存：外观用背词同款分段控件，但不与背词/复习共享偏好，
 * 否则在短句页切到「中文」会连带把背词列表的模式改掉。
 */
const SENTENCE_MODE_KEY = 'lexicore-sentence-display-mode'

function loadSentenceMode(): DisplayMode {
  try {
    const v = localStorage.getItem(SENTENCE_MODE_KEY)
    return v === 'both' || v === 'en' || v === 'zh' ? v : 'both'
  } catch {
    return 'both'
  }
}

/**
 * 短句页：按「中国人什么时候会想说这句话」的使用场景分类，每行一条短句块。
 * 显示语言与掌握筛选沿用背词页同一套控件/偏好：中英 / 英文 / 中文三段切换，
 * 场景与掌握状态在弹层里选，默认只看未掌握。
 */
export default function SentenceView({ active = true }: { active?: boolean }) {
  const [version, setVersion] = useState(0)
  const [scene, setScene] = useState<SentenceSceneId | 'all'>('all')
  const [status, setStatus] = useState<StatusFilter>('unmastered')
  const [filterOpen, setFilterOpen] = useState(false)
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  const [displayMode, setDisplayModeState] = useState<DisplayMode>(loadSentenceMode)
  const setDisplayMode = (m: DisplayMode) => {
    setDisplayModeState(m)
    try { localStorage.setItem(SENTENCE_MODE_KEY, m) } catch { /* ignore */ }
  }
  const { stop } = useSpeech()

  useEffect(() => subscribeSentenceProgress(() => setVersion((v) => v + 1)), [])
  useEffect(() => {
    if (!active) {
      stop()
      setFilterOpen(false)
    }
  }, [active, stop])
  useEffect(() => () => stop(), [stop])
  // 切换显示语言后清掉「临时看一眼英文」的状态
  useEffect(() => setRevealed(new Set()), [displayMode])

  const mastered = useMemo(() => getSentenceMastered(), [version])

  const groups = useMemo(() => {
    const byStatus = status === 'all'
      ? SHORT_SENTENCES
      : SHORT_SENTENCES.filter((s) => (status === 'mastered' ? mastered.has(s.id) : !mastered.has(s.id)))
    const scenes = scene === 'all' ? SENTENCE_SCENES : SENTENCE_SCENES.filter((s) => s.id === scene)
    return scenes
      .map((sc) => ({ scene: sc, items: byStatus.filter((s) => s.scene === sc.id) }))
      .filter((g) => g.items.length > 0)
  }, [scene, status, mastered])

  const toggleReveal = (id: string) => {
    setRevealed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const sceneLabel = scene === 'all'
    ? '全部场景'
    : SENTENCE_SCENES.find((s) => s.id === scene)?.label ?? '全部场景'
  const statusLabel = STATUS_OPTIONS.find((o) => o.id === status)?.label ?? '未掌握'
  const reset = () => {
    setScene('all')
    setStatus('unmastered')
  }

  return (
    <div className="pb-6">
      {/* 显示语言 + 筛选入口（背词同款分段控件 / 弹层筛选） */}
      <div className="mb-3 flex items-center gap-2">
        <DisplayModeToggle value={displayMode} onChange={setDisplayMode} />
        <button
          type="button"
          onClick={() => setFilterOpen(true)}
          className="ml-auto inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-slate-200/70 bg-white/70 px-3 text-[11px] font-semibold text-slate-700 transition active:scale-95 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-200"
        >
          <SlidersIcon width={14} height={14} />
          <span className="max-w-[76px] truncate">{sceneLabel}</span>
          <span className="text-[10px] text-slate-400">· {statusLabel}</span>
        </button>
      </div>

      {/* 按场景分组，每行一条短句块 */}
      {groups.map((group) => (
        <section key={group.scene.id} className="mb-4 [content-visibility:auto] [contain-intrinsic-size:auto_600px]">
          <div className="mb-1.5 flex items-baseline gap-2 px-1">
            <h3 className="text-[13px] font-bold text-slate-800 dark:text-slate-100">
              {group.scene.label}
            </h3>
            <span className="text-[10px] text-slate-400">
              {group.scene.hint} · {group.items.length} 句
            </span>
          </div>
          <div className="space-y-2">
            {group.items.map((s) => (
              <SentenceRow
                key={s.id}
                sentence={s}
                mastered={mastered.has(s.id)}
                mode={displayMode}
                revealed={revealed.has(s.id)}
                onReveal={() => toggleReveal(s.id)}
                onToggle={() => { toggleSentenceMastered(s.id) }}
              />
            ))}
          </div>
        </section>
      ))}

      {groups.length === 0 && (
        <p className="py-12 text-center text-sm text-slate-400">没有符合条件的短句</p>
      )}

      <Sheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="筛选短句"
        subtitle="按掌握状态和使用场景缩小范围"
        footer={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={reset}
              className="flex-1 rounded-[18px] border border-slate-200/70 bg-white/70 py-3 text-sm font-semibold text-slate-600 transition hover:bg-white dark:border-slate-700/60 dark:bg-slate-800/50 dark:text-slate-300"
            >
              重置
            </button>
            <button
              type="button"
              onClick={() => setFilterOpen(false)}
              className="flex-[1.4] rounded-[18px] bg-slate-900 py-3 text-sm font-semibold text-white shadow-float dark:bg-white dark:text-slate-900"
            >
              查看结果
            </button>
          </div>
        }
      >
        <div className="space-y-5 pb-1">
          <FilterGroup label="掌握状态">
            {STATUS_OPTIONS.map((o) => (
              <FilterChip key={o.id} active={status === o.id} onClick={() => setStatus(o.id)}>
                {o.label}
              </FilterChip>
            ))}
          </FilterGroup>
          <FilterGroup label="使用场景">
            <FilterChip active={scene === 'all'} onClick={() => setScene('all')}>
              全部场景
            </FilterChip>
            {SENTENCE_SCENES.map((s) => (
              <FilterChip key={s.id} active={scene === s.id} onClick={() => setScene(s.id)}>
                {s.label}
              </FilterChip>
            ))}
          </FilterGroup>
        </div>
      </Sheet>
    </div>
  )
}

function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-3 py-2 text-[13px] font-semibold transition active:scale-95 ${
        active
          ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
          : 'border border-slate-200/70 bg-white/60 text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300'
      }`}
    >
      {children}
    </button>
  )
}

function SentenceRow({
  sentence,
  mastered,
  mode,
  revealed,
  onReveal,
  onToggle,
}: {
  sentence: ShortSentence
  mastered: boolean
  mode: DisplayMode
  revealed: boolean
  onReveal: () => void
  onToggle: () => void
}) {
  const showZh = mode !== 'en'
  const showEn = mode !== 'zh' || revealed
  const hint = mode === 'zh' && !revealed

  return (
    <div
      onClick={mode === 'zh' ? onReveal : undefined}
      className={`flex items-start gap-2 rounded-[16px] border p-3 transition ${
        mastered
          ? 'border-brand-200/60 bg-brand-50/40 dark:border-brand-500/25 dark:bg-brand-500/[0.07]'
          : 'border-slate-200/60 bg-white/70 dark:border-white/[0.06] dark:bg-slate-800/40'
      }`}
    >
      <div className="min-w-0 flex-1">
        {showZh && (
          <p className="text-[14px] font-semibold leading-snug text-slate-800 dark:text-slate-100">
            {sentence.zh}
          </p>
        )}
        <p className={`font-display leading-snug ${showZh ? 'mt-1' : ''}`}>
          {hint ? (
            <span className="text-[12px] text-slate-400">点一下看英文</span>
          ) : showEn ? (
            <span
              className={
                showZh
                  ? 'text-[13px] text-brand-700 dark:text-brand-300'
                  : 'text-[15px] font-semibold text-slate-900 dark:text-slate-50'
              }
            >
              {sentence.en}
            </span>
          ) : null}
          {/* 发音按钮跟在英文句子最后 */}
          <SpeakerBtn
            text={sentence.en}
            rate={0.9}
            iconSize={14}
            className="ml-1.5 inline-flex !h-7 !w-7 !rounded-full !bg-brand-50 !p-0 align-middle dark:!bg-brand-500/10"
          />
        </p>
      </div>
      {/* 掌握圆圈放在原来喇叭所在的右侧位置 */}
      <button
        type="button"
        title={mastered ? '已掌握' : '标记为已掌握'}
        aria-label={mastered ? '已掌握' : '标记为已掌握'}
        aria-pressed={mastered}
        onClick={(e) => { e.stopPropagation(); onToggle() }}
        onKeyDown={(e) => e.stopPropagation()}
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition ${
          mastered
            ? 'border-brand-600 bg-brand-600 text-white shadow-sm'
            : 'border-slate-300/70 bg-white/40 text-transparent hover:border-brand-400 hover:text-brand-400 dark:border-slate-600 dark:bg-slate-900/30'
        }`}
      >
        <CheckIcon width={14} height={14} />
      </button>
    </div>
  )
}
