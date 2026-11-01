import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { XIcon } from './icons'
import { registerBack } from '../lib/back'

/** 下拉关闭阈值（px） */
const DISMISS_THRESHOLD = 96

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
  maxWidth = 'max-w-lg',
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  subtitle?: ReactNode
  children: ReactNode
  footer?: ReactNode
  maxWidth?: string
}) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  /** 关闭中：先播下滑动画，结束后再真正关闭 */
  const [closing, setClosing] = useState(false)
  const closingRef = useRef(false)

  const requestClose = useCallback(() => {
    if (closingRef.current) return
    closingRef.current = true
    setClosing(true)
    window.setTimeout(() => closeRef.current(), 200)
  }, [])

  /** 下拉位移（仅头部区域可拖拽，避免与内容滚动冲突） */
  const [dragY, setDragY] = useState(0)
  const [dragging, setDragging] = useState(false)
  const dragYRef = useRef(0)
  const startYRef = useRef<number | null>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && requestClose()
    window.addEventListener('keydown', onKey)

    // 锁定背景滚动：弹层内的手势不应带着后面的长列表一起动
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // 安卓系统返回键优先关闭弹层
    const unregister = registerBack(() => requestClose())

    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      unregister()
    }
  }, [open, requestClose])

  // 打开时重置动画状态；关闭后重置位移
  useEffect(() => {
    if (open) {
      closingRef.current = false
      setClosing(false)
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

  if (!open) return null
  // 通过 Portal 挂到 body：祖先若有 backdrop-filter / transform / overflow，
  // 会成为 fixed 子元素的包含块，导致弹层被裁在祖先盒子里（筛选栏 backdrop-blur 就会这样）。
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      onClick={requestClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`absolute inset-0 bg-slate-950/45 backdrop-blur-[6px] ${
          closing ? 'animate-fade-out' : 'animate-fade-in'
        }`}
        aria-hidden="true"
      />
      <div
        className={`relative flex max-h-[92dvh] w-full ${maxWidth} flex-col overflow-hidden rounded-t-[32px] border border-white/60 bg-[#fbf8f2] shadow-float dark:border-slate-700/60 dark:bg-[#1c1a16] sm:rounded-[32px] ${
          closing ? 'animate-sheet-down' : 'animate-sheet-up'
        }`}
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
          <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-slate-300/80 dark:bg-slate-600 sm:hidden" />
          <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-4">
            <div className="min-w-0">
              {title && (
                <h2 className="truncate font-display text-xl font-semibold text-slate-900 dark:text-slate-50">{title}</h2>
              )}
              {subtitle && <p className="mt-1 text-xs leading-relaxed text-slate-400">{subtitle}</p>}
            </div>
            <button
              onClick={requestClose}
              className="shrink-0 rounded-full border border-slate-200/60 bg-white/60 p-1.5 text-slate-400 transition hover:bg-white hover:text-slate-700 dark:border-slate-700/60 dark:bg-slate-800/50 dark:hover:bg-slate-800"
              aria-label="关闭"
            >
              <XIcon width={19} height={19} />
            </button>
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
