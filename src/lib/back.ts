/**
 * Android 系统返回键的分级处理栈。
 * 组件在「可返回」状态下注册处理器（弹层、阅读器、子页面），
 * App 收到 backButton 时先交给栈顶；无人处理再退回上一级主页面。
 */
type BackHandler = () => void

const stack: BackHandler[] = []

/** 注册返回处理器，返回注销函数（组件卸载或状态退出时调用）。 */
export function registerBack(handler: BackHandler): () => void {
  stack.push(handler)
  return () => {
    const i = stack.indexOf(handler)
    if (i >= 0) stack.splice(i, 1)
  }
}

/** 依次询问栈顶处理器；返回 true 表示已被消费。 */
export function runBack(): boolean {
  if (stack.length === 0) return false
  const handler = stack[stack.length - 1]
  handler()
  return true
}
