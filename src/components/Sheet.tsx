import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { XIcon } from './icons'
import { registerBack } from '../lib/back'

/** 下拉关闭阈值（px） */
const DISMISS_THRESHOLD = 96

/**
 * 宿主页面是否处于可见状态（页面栈顶 / 当前 tab）。
 * 弹层通过 Portal 挂到 body，不会随页面 hidden 一起隐藏，
 * 因此需要此标记让非活跃页面的弹层立即卸载，避免残留并在其它页面上叠加。
 */
export const PageActiveContext = createContext(true)

/*
 * 背景真正滚动的是 App 根 div（h-screen overflow-y-auto），body 本身已被 CSS
 * 设为 overflow:hidden，锁 body 没有任何效果。用引用计数支持多个 Sheet 叠加：
 * 只有第一个打开的加锁、最后一个关闭的解锁，避免互相覆盖恢复值。
 *
 * 直接把 overflow 设为 hidden 会让垂直滚动条消失、内容区变宽约 15px，
 * 打开和关闭弹层时页面各横向晃动一次。因此用 padding-right 补上滚动条宽度，
 * 保持内容区宽度与布局不变（fixed 定位的导航/弹层不受此 padding 影响）。
 */
let scrollLockCount = 0
let savedScrollOverflow = ''
let savedPaddingRight = ''

function lockAppScroll(): void {
  const el = document.getElementById('app-scroll')
  if (!el) return
  if (scrollLockCount === 0) {
    savedScrollOverflow = el.style.overflow
    savedPaddingRight = el.style.paddingRight
    // app-scroll 占满视口且无 border，clientWidth 不含滚动条，差值即滚动条宽度
    const gap = window.innerWidth - el.clientWidth
    const basePadding = parseFloat(window.getComputedStyle(el).paddingRight) || 0
    el.style.overflow = 'hidden'
    if (gap > 0) el.style.paddingRight = `${basePadding + gap}px`
  }
  scrollLockCount += 1
}

function unlockAppScroll(): void {
  scrollLockCount = Math.max(0, scrollLockCount - 1)
  if (scrollLockCount > 0) return
  const el = document.getElementById('app-scroll')
  if (el) {
    el.style.overflow = savedScrollOverflow
    el.style.paddingRight = savedPaddingRight
  }
}

/**
 * 通用底部弹层（移动端现代交互）：背景遮罩点击关闭、ESC / 安卓返回键关闭、
 * 下拉手势关闭、打开时锁定背景滚动；移动端贴底圆角，桌面端居中浮层。
 */
export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  headerExtra,
  headerLeading,
  maxWidth = 'max-w-lg',
  panelClassName = '',
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  subtitle?: ReactNode
  children: ReactNode
  footer?: ReactNode
  /** 固定头部右侧的额外操作（与关闭按钮同一行，不随内容滚动） */
  headerExtra?: ReactNode
  /** 固定头部左侧的替代内容（传了则取代 title/subtitle，用于放返回按钮等） */
  headerLeading?: ReactNode
  maxWidth?: string
  /** 追加到弹层面板：可用来把整张弹层上移（mb-*），让底部按钮不贴屏幕边 */
  panelClassName?: string
}) {
  const active = useContext(PageActiveContext)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  /**
   * 头部没有任何内容时（如词卡详情：正文里已有大号词形，不再重复标题），
   * 收紧把手与标题行的纵向间距，避免弹层顶部出现一大片空白。
   */
  const hasHeaderContent = Boolean(title || subtitle || headerLeading || headerExtra)

  /**
   * 关闭时立即卸载，不播关闭动画。
   * 桌面端弹层是居中的，translateY(100%) 不足以移出视口；遮罩先淡出、弹层仍停留在
   * 屏幕下方的那 200ms 会被看成「又弹出一个弹窗」。
   */
  const closingRef = useRef(false)

  const requestClose = useCallback(() => {
    if (closingRef.current) return
    closingRef.current = true
    closeRef.current()
  }, [])

  /** 下拉位移（仅头部区域可拖拽，避免与内容滚动冲突） */
  const [dragY, setDragY] = useState(0)
  const [dragging, setDragging] = useState(false)
  const dragYRef = useRef(0)
  const startYRef = useRef<number | null>(null)

  // 页面失活时立即清空弹层状态，避免返回后弹层又重新出现
  useEffect(() => {
    if (!active && open) closeRef.current()
  }, [active, open])

  useEffect(() => {
    if (!open || !active) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && requestClose()
    window.addEventListener('keydown', onKey)
    lockAppScroll()

    // 安卓系统返回键优先关闭弹层
    const unregister = registerBack(() => requestClose())

    return () => {
      window.removeEventListener('keydown', onKey)
      unlockAppScroll()
      unregister()
    }
  }, [open, active, requestClose])

  // 打开时重置关闭标记；关闭后重置位移
  useEffect(() => {
    if (open) {
      closingRef.current = false
    } else {
      dragYRef.current = 0
      setDragY(0)
      setDragging(false)
      startYRef.current = null
    }
  }, [open])

  const onTouchStart = (e: React.TouchEvent) => {
    startYRef.current = e.touches[0].clientY
    setDragging(true)
  }
  const onTouchMove = (e: React.TouchEvent) => {
    if (startYRef.current === null) return
    const dy = e.touches[0].clientY - startYRef.current
    const next = dy > 0 ? dy : 0
    dragYRef.current = next
    setDragY(next)
  }
  const onTouchEnd = () => {
    if (startYRef.current === null) return
    startYRef.current = null
    setDragging(false)
    if (dragYRef.current > DISMISS_THRESHOLD) requestClose()
    dragYRef.current = 0
    setDragY(0)
  }

  if (!open || !active) return null
  // 通过 Portal 挂到 body：祖先若有 backdrop-filter / transform / overflow，
  // 会成为 fixed 子元素的包含块，导致弹层被裁在祖先盒子里（筛选栏 backdrop-blur 就会这样）。
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      onClick={requestClose}
      role="dialog"
      aria-modal="true"
      aria-label={typeof title === 'string' && title ? title : '弹层'}
    >
      <div
        className="absolute inset-0 bg-slate-950/45 backdrop-blur-[6px] animate-fade-in"
        aria-hidden="true"
      />
      <div
        className={`relative flex max-h-[92dvh] w-full ${maxWidth} flex-col overflow-hidden rounded-t-[32px] border border-white/60 bg-[#fbf8f2] shadow-float dark:border-slate-700/60 dark:bg-slate-900 sm:rounded-[32px] animate-sheet-up ${panelClassName}`}
        onClick={(e) => e.stopPropagation()}
        style={{
          paddingBottom: 'env(safe-area-inset-bottom)',
          transform: dragY ? `translateY(${dragY}px)` : undefined,
          transition: dragging ? 'none' : undefined,
        }}
      >
        {/* 拖拽区：顶部把手 + 标题栏，下拉可关闭 */}
        <div
          className="shrink-0 touch-none"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
        >
          <div
            className={`mx-auto h-1 w-10 rounded-full bg-slate-300/80 dark:bg-slate-600 sm:hidden ${
              hasHeaderContent ? 'mt-2.5' : 'mt-2'
            }`}
          />
          <div
            className={`flex items-start justify-between gap-3 px-5 ${
              hasHeaderContent ? 'pb-3 pt-4' : 'pb-1 pt-2 sm:pt-3'
            }`}
          >
            <div className="min-w-0 flex-1">
              {headerLeading ?? (
                <>
                  {title && (
                    <h2 className="truncate font-display text-xl font-semibold text-slate-900 dark:text-slate-50">{title}</h2>
                  )}
                  {subtitle && <p className="mt-1 text-xs leading-relaxed text-slate-400">{subtitle}</p>}
                </>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {headerExtra}
              <button
                onClick={requestClose}
                className="shrink-0 rounded-full border border-slate-200/60 bg-white/60 p-1.5 text-slate-400 transition hover:bg-white hover:text-slate-700 dark:border-slate-700/60 dark:bg-slate-800/50 dark:hover:bg-slate-800"
                aria-label="关闭"
              >
                <XIcon width={19} height={19} />
              </button>
            </div>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-1">{children}</div>
        {footer && (
          <div className="shrink-0 border-t border-slate-200/60 px-5 py-4 dark:border-slate-700/60">{footer}</div>
        )}
      </div>
    </div>,
    document.body,
  )
}

export interface SheetAction {
  label: string
  description?: string
  icon?: ReactNode
  tone?: 'default' | 'danger'
  onClick: () => void
}

/** 操作列表弹层（替代 window.confirm 的现代交互）。 */
export function ActionSheet({
  open,
  onClose,
  title,
  message,
  actions,
}: {
  open: boolean
  onClose: () => void
  title?: string
  message?: string
  actions: SheetAction[]
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title} subtitle={message}>
      <div className="space-y-2 pb-1">
        {actions.map((a, i) => (
          <button
            key={i}
            onClick={() => {
              onClose()
              a.onClick()
            }}
            className={`flex w-full items-center gap-3 rounded-[18px] border px-4 py-3 text-left transition active:scale-[0.995] ${
              a.tone === 'danger'
                ? 'border-rose-200/70 bg-rose-50/80 text-rose-600 hover:bg-rose-100 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20'
                : 'border-slate-200/70 bg-white/70 text-slate-700 shadow-card hover:bg-white dark:border-slate-700/60 dark:bg-slate-800/50 dark:text-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            {a.icon && <span className="shrink-0">{a.icon}</span>}
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{a.label}</span>
              {a.description && <span className="mt-0.5 block text-xs opacity-70">{a.description}</span>}
            </span>
          </button>
        ))}
      </div>
    </Sheet>
  )
}
