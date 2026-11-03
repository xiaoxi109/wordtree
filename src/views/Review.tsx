import { useEffect, useRef, useState } from 'react'
import { findWord } from '../data/lexicon'
import { posText } from '../lib/posText'
import { dueList, type SpacedState } from '../lib/spaced'

interface Props {
  active?: boolean
  mastered: Set<string>
  spaced: SpacedState
  /** 作答后由 App 落库并更新内存状态（含掌握集）。 */
  onRecord: (id: string, correct: boolean) => void
  onHome: () => void
  onBrowse: () => void
  onSpeak: (t: string) => void
}

interface Session {
  total: number
  done: number
  right: number
  wrong: string[]
  phase: 'recall' | 'reveal'
}

function buildQueue(dueAt: Record<string, number>, wrong: string[] = []) {
  const q = dueList(dueAt, Date.now())
  wrong.forEach((id) => {
    if (!q.includes(id)) q.push(id)
  })
  return q
}

export function Review({ active, mastered, spaced, onRecord, onHome, onBrowse, onSpeak }: Props) {
  const [rs, setRs] = useState<Session | null>(null)
  const [queue, setQueue] = useState<string[]>([])
  const [rvLang, setRvLang] = useState<'en' | 'zh'>('en')

  const spacedRef = useRef(spaced)
  spacedRef.current = spaced

  function startSession(wrong: string[] = []) {
    const q = buildQueue(spacedRef.current.dueAt, wrong)
    setQueue(q)
    setRs({ total: q.length, done: 0, right: 0, wrong: wrong.filter((id) => q.includes(id)), phase: 'recall' })
  }

  // 进入复习页即开新一轮（与高保真原型一致：没有会话则开一轮）
  useEffect(() => {
    if (active) startSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  // 键盘：空格揭晓，← 不认识，→ 认识
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea') return
      if (e.code === 'Space') {
        e.preventDefault()
        setRs((p) => (p ? { ...p, phase: 'reveal' } : p))
      } else if (e.key === 'ArrowLeft') {
        if (queue[0]) answer(queue[0], false)
      } else if (e.key === 'ArrowRight') {
        if (queue[0]) answer(queue[0], true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, queue])

  function answer(id: string, yes: boolean) {
    setRs((prev) => {
      if (!prev) return prev
      return {
        total: prev.total,
        done: prev.done + 1,
        right: prev.right + (yes ? 1 : 0),
        wrong: yes
          ? prev.wrong.filter((x) => x !== id)
          : prev.wrong.includes(id)
            ? prev.wrong
            : [...prev.wrong, id],
        phase: 'recall',
      }
    })
    onRecord(id, yes)
    setQueue((prev) => prev.slice(1))
  }

  function redoWrong(id: string) {
    setQueue((prev) => [id, ...prev])
    setRs((prev) => (prev ? { ...prev, total: prev.total + 1, phase: 'recall' } : prev))
  }

  /* ----------------------------- 渲染 ----------------------------- */
  const pct = rs && rs.total ? Math.round((rs.done / rs.total) * 100) : 0
  const acc = rs && rs.done ? '正确率 ' + Math.round((rs.right / rs.done) * 100) + '%' : '正确率 —'

  function cardBody() {
    const id = queue[0]
    const w = findWord(id)
    if (!w) return null
    const pos = posText(w.pos)
    if (rvLang === 'en') {
      return (
        <>
          <div className="rv-word">{w.word}</div>
          <div className="rv-ipa">
            /{w.ipa}/{pos && <span className="rv-pos">{pos}</span>}
          </div>
          {rs?.phase === 'reveal' ? (
            <>
              <div className="rv-meaning">{w.m.join('；')}</div>
              <div className="rv-ex">
                {w.ex.slice(0, 2).map((e, i) => (
                  <div className="rv-ex-row" key={i}>
                    <span>
                      {e.en}
                      <em>{e.zh}</em>
                    </span>
                    <button className="spk" data-exi={i} onClick={() => onSpeak(e.en)}>
                      🔊
                    </button>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="rv-hint">先在脑中回忆中文意思，再点「查看答案」</div>
          )}
        </>
      )
    }
    return (
      <>
        <div className="rv-word zh">{w.m.join('；')}</div>
        <div className="rv-ipa">
          /{w.ipa}/{pos && <span className="rv-pos">{pos}</span>}
        </div>
        {rs?.phase === 'reveal' ? (
          <>
            <div className="rv-en">{w.word}</div>
            <div className="rv-ex">
              {w.ex.slice(0, 2).map((e, i) => (
                <div className="rv-ex-row" key={i}>
                  <span>
                    {e.en}
                    <em>{e.zh}</em>
                  </span>
                  <button className="spk" data-exi={i} onClick={() => onSpeak(e.en)}>
                    🔊
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="rv-hint">先在脑中回忆英文，再点「查看答案」</div>
        )}
      </>
    )
  }

  function doneBody() {
    if (!rs || !rs.done) {
      return (
        <div className="box rv-done">
          <div className="rv-done-ico">🎉</div>
          <div className="rv-done-t">今日复习已完成</div>
          <div className="rv-done-s">所有到期的词都复习过啦，去背几个新词吧。</div>
          <div className="rv-actions">
            <button className="btn-block brand" onClick={onBrowse}>去背新词</button>
          </div>
        </div>
      )
    }
    const accN = Math.round((rs.right / rs.done) * 100)
    let wrongHtml
    if (rs.wrong.length) {
      wrongHtml = (
        <>
          <div className="rv-sec">还需巩固（点击立即重练）</div>
          <div className="rv-wrong">
            {rs.wrong.map((id) => {
              const w = findWord(id)!
              return (
                <button key={id} className={mastered.has(id) ? '' : 'hot'} onClick={() => redoWrong(id)}>
                  {w.word}
                </button>
              )
            })}
          </div>
        </>
      )
    } else {
      wrongHtml = <div className="rv-hint" style={{ marginTop: 10 }}>全部一次答对，太棒了 🎉</div>
    }
    return (
      <div className="box rv-done">
        <div className="rv-done-ico">🎉</div>
        <div className="rv-done-t">本轮复习完成</div>
        <div className="rv-done-s">
          练习 <b>{rs.done}</b> 次 · 认识 <b>{rs.right}</b> 词 · 正确率 <b>{accN}%</b>
        </div>
        {wrongHtml}
        <div className="rv-actions">
          <button className="btn-block ghost" onClick={() => startSession(rs.wrong)}>再来一轮</button>
          <button className="btn-block brand" onClick={onBrowse}>去背新词</button>
        </div>
      </div>
    )
  }

  return (
    <section className={'screen' + (active ? ' active' : '')} id="s-review">
      <div className="sticky-head">
        <div className="topbar">
          <div className="lead">
            <span className="back" onClick={onHome}>‹</span>
          </div>
          <h1>复习</h1>
          <div className="seg rv-lang">
            <button className={rvLang === 'en' ? 'on' : ''} onClick={() => setRvLang('en')}>英文</button>
            <button className={rvLang === 'zh' ? 'on' : ''} onClick={() => setRvLang('zh')}>中文</button>
          </div>
        </div>
      </div>

      {!rs ? null : queue.length ? (
        <div className="box rv-card" id="rvCard">
          <div className="prog">
            <i style={{ width: pct + '%' }} />
          </div>
          <div className="rv-head">
            <span>第 {rs.done + 1} / {rs.total} 个</span>
            <span>{acc}</span>
          </div>
          {cardBody()}
          <div className="rv-actions">
            <button className="btn-block ghost" onClick={() => answer(queue[0], false)}>😶 不认识</button>
            <button className="btn-block ok" onClick={() => answer(queue[0], true)}>✅ 认识</button>
          </div>
          {rs.phase === 'recall' && (
            <button className="btn-block ghost" onClick={() => setRs((p) => (p ? { ...p, phase: 'reveal' } : p))}>
              👀 查看答案
            </button>
          )}
        </div>
      ) : (
        doneBody()
      )}
    </section>
  )
}
