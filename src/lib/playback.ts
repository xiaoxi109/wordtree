import { useSyncExternalStore } from 'react'

/**
 * 文章播放模式（互斥，单一状态源）。
 *
 *   off           播完即停：本篇最后一句播完 → 停止
 *   sentence      单句循环：每句重复 N 次 → 自动进入下一句 → 整篇读完后停止
 *   lesson        单篇循环：本篇最后一句播完 → 回到第一句，持续播放
 *   listSequential 列表顺序：本篇播完 → 切到课程列表下一篇，从第一句自动播放；到末尾停止
 *   listShuffle   列表随机：本篇播完 → 随机切到未播过的一篇，自动播放；全部播完停止
 *
 * 篇内行为由 useSpeechQueue 执行；列表模式需要跨篇切换，由 onLessonEnd 交给 AiView 调度。
 */
export type PlayMode = 'off' | 'sentence' | 'lesson' | 'listSequential' | 'listShuffle'

export interface PlaybackSettings {
  mode: PlayMode
  /** 单句循环次数：2/3/5/10（每句播满后自动进入下一句） */
  sentenceRepeat: number
}

export interface PlayModeMeta {
  id: PlayMode
  label: string
  short: string
  /** 行为说明 */
  desc: string
  /** 触发条件 / 结束条件 */
  trigger: string
}

export const PLAY_MODES: PlayModeMeta[] = [
  {
    id: 'off',
    label: '播完即停',
    short: '单遍',
    desc: '按句子顺序把本篇读一遍。',
    trigger: '最后一句播完自动停止。',
  },
  {
    id: 'sentence',
    label: '单句循环',
    short: '单句',
    desc: '每一句都重复播放指定次数，然后自动进入下一句。',
    trigger: '播满次数自动接下一句，直到整篇文章读完才停止。点其它句子 / 上一句 / 下一句时重新计数。',
  },
  {
    id: 'lesson',
    label: '单篇循环',
    short: '本篇',
    desc: '整篇反复播放。',
    trigger: '最后一句播完回到第一句，直到切换模式或暂停。',
  },
  {
    id: 'listSequential',
    label: '列表顺序播放',
    short: '顺序',
    desc: '按「我的课程」列表顺序，一篇接一篇自动播放。',
    trigger: '本篇播完自动切到下一篇并从第一句播放；到列表末尾停止。',
  },
  {
    id: 'listShuffle',
    label: '列表随机播放',
    short: '随机',
    desc: '在课程列表中随机挑选、不重复地一篇接一篇播放。',
    trigger: '本篇播完随机切到未播过的一篇；全部播完停止。',
  },
]

export const SENTENCE_REPEAT_OPTIONS = [
  { value: 2, label: '2 次' },
  { value: 3, label: '3 次' },
  { value: 5, label: '5 次' },
  { value: 10, label: '10 次' },
] as const

export const DEFAULT_PLAYBACK: PlaybackSettings = { mode: 'off', sentenceRepeat: 3 }

const STORAGE_KEY = 'lexicore-playback'

function isPlayMode(v: unknown): v is PlayMode {
  return PLAY_MODES.some((m) => m.id === v)
}

function readStored(): PlaybackSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_PLAYBACK }
    const parsed = JSON.parse(raw) as Partial<PlaybackSettings>
    const mode = isPlayMode(parsed.mode) ? parsed.mode : DEFAULT_PLAYBACK.mode
    const n = Number(parsed.sentenceRepeat)
    // 旧版用 0 表示无限循环；新语义下无限循环会卡在第一句，回退为默认次数
    const sentenceRepeat = Number.isFinite(n) && n >= 2 && n <= 99 ? Math.floor(n) : DEFAULT_PLAYBACK.sentenceRepeat
    return { mode, sentenceRepeat }
  } catch {
    return { ...DEFAULT_PLAYBACK }
  }
}

/**
 * 模块级共享状态：列表页 / 阅读页 / 听读页都读同一份设置，
 * 切换篇目或页面保活时不会出现「这个页面是单篇循环、那个页面还是播完即停」。
 * 播放会话（已播课程、切篇后自动播放）不持久化，仅运行时有效。
 */
let current: PlaybackSettings | null = null
const listeners = new Set<() => void>()

function snapshot(): PlaybackSettings {
  if (current === null) current = readStored()
  return current
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** 局部更新设置；模式变化时由调用方负责重置篇内循环计数与列表会话。 */
export function updatePlayback(patch: Partial<PlaybackSettings>): void {
  const next = { ...snapshot(), ...patch }
  current = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* 隐私模式忽略 */
  }
  listeners.forEach((fn) => fn())
}

export function getPlaybackSettings(): PlaybackSettings {
  return snapshot()
}

export function usePlayback(): [PlaybackSettings, (patch: Partial<PlaybackSettings>) => void] {
  const settings = useSyncExternalStore(subscribe, snapshot, snapshot)
  return [settings, updatePlayback]
}

/** 判断某模式是否需要跨篇调度。 */
export function isListMode(mode: PlayMode): boolean {
  return mode === 'listSequential' || mode === 'listShuffle'
}
