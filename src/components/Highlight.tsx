import React from 'react'

/** 在文本中高亮搜索命中词（安全：不使用 innerHTML）。 */
export function Highlight({ text, q }: { text: string; q?: string }) {
  if (!q) return <>{text}</>
  const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp('(' + esc + ')', 'ig')
  const parts = text.split(re)
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <mark key={i}>{p}</mark>
        ) : (
          <React.Fragment key={i}>{p}</React.Fragment>
        ),
      )}
    </>
  )
}
