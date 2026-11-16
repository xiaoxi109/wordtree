import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** 点「返回上一页」时调用（通常是 popPage） */
  onReset?: () => void
  /** 页面标识，切换页面时用来重置错误状态 */
  resetKey?: string | number
}

interface State {
  error: Error | null
  stack: string
}

/**
 * 页面级错误边界。
 *
 * 之前任何一个页面渲染抛错都会让整棵 React 树卸载 → 用户只看到白屏，
 * 且没有任何线索。这里把错误兜住并直接显示原因，用户可以把内容反馈回来。
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, stack: '' }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // 保留堆栈方便用户截图反馈；同时打到控制台
    console.error('[页面错误]', error, info.componentStack)
    this.setState({ stack: `${error.stack ?? ''}\n${info.componentStack ?? ''}`.trim() })
  }

  componentDidUpdate(prev: Props): void {
    // 切换到别的页面时清掉错误，避免一直卡在错误页
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null, stack: '' })
    }
  }

  private handleBack = () => {
    this.setState({ error: null, stack: '' })
    this.props.onReset?.()
  }

  render(): ReactNode {
    const { error, stack } = this.state
    if (!error) return this.props.children

    return (
      <div className="mx-auto max-w-md px-4 py-12">
        <div className="rounded-[20px] border border-rose-200/70 bg-rose-50/70 p-5 dark:border-rose-500/30 dark:bg-rose-500/10">
          <p className="text-[13px] font-bold text-rose-700 dark:text-rose-300">页面出错了</p>
          <p className="mt-1.5 break-words text-[12px] leading-relaxed text-rose-600/90 dark:text-rose-200/80">
            {error.message || String(error)}
          </p>
          {stack && (
            <details className="mt-2">
              <summary className="cursor-pointer text-[11px] text-rose-500/80 dark:text-rose-300/70">
                查看详细信息
              </summary>
              <pre className="mt-1.5 max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-[10px] bg-white/70 p-2 text-[10px] leading-relaxed text-slate-600 dark:bg-slate-900/50 dark:text-slate-300">
                {stack}
              </pre>
            </details>
          )}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button onClick={this.handleBack} className="btn-soft !py-2.5 text-sm">
            返回上一页
          </button>
          <button
            onClick={() => this.setState({ error: null, stack: '' })}
            className="btn-ink !py-2.5 text-sm"
          >
            重试
          </button>
        </div>
      </div>
    )
  }
}
