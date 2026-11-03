import { useState } from 'react'
import { LESSON, findWordByText, type Word } from '../data/lexicon'

function linkEx(en: string, onTap: (w: Word) => void) {
  return en.split(/(\s+)/).map((tok, i) => {
    const w = findWordByText(tok)
    return w ? (
      <span
        key={i}
        className="tap"
        onClick={(e) => {
          e.stopPropagation()
          onTap(w)
        }}
      >
        {tok}
      </span>
    ) : (
      <span key={i}>{tok}</span>
    )
  })
}

interface Props {
  active?: boolean
  onOpen: (id: string) => void
  onToast: (msg: string) => void
}

export function Lesson({ active, onOpen, onToast }: Props) {
  const [quizAns, setQuizAns] = useState<number | null>(null)
  const l = LESSON

  return (
    <section className={'screen' + (active ? ' active' : '')} id="s-lesson">
      <div className="sticky-head">
        <div className="topbar">
          <h1>课文</h1>
          <span className="pill">互动阅读</span>
        </div>
      </div>

      <div className="box">
        <h3>{l.title}</h3>
        {l.body.map((p, i) => (
          <p className="ex" style={{ marginTop: 6 }} key={i}>
            <span className="en">{linkEx(p.en, (w) => onOpen(w.id))}</span>
            <span className="zh" style={{ display: 'block', marginTop: 4 }}>{p.zh}</span>
          </p>
        ))}

        <div className="choice" id="quiz">
          <div className="muted" style={{ fontSize: 12 }}>小测：{l.quiz.prompt}</div>
          {l.quiz.options.map((o, i) => (
            <button
              key={i}
              className={
                quizAns !== null
                  ? i === l.quiz.answer
                    ? 'correct'
                    : quizAns === i
                      ? 'wrong'
                      : ''
                  : ''
              }
              onClick={() => {
                setQuizAns(i)
                if (i === l.quiz.answer) onToast('小测通过')
              }}
            >
              {String.fromCharCode(65 + i)}. {o}
            </button>
          ))}
        </div>
        {quizAns !== null && (
          <div className="quiz-fb" style={{ color: quizAns === l.quiz.answer ? 'var(--ok)' : 'var(--rose)', fontWeight: 600 }}>
            {quizAns === l.quiz.answer ? '✅ 答对啦！' : '❌ 再想想，是"甜的"哦'}
          </div>
        )}
      </div>

      <div className="box">
        <h3>分支选择</h3>
        <div className="muted" style={{ fontSize: 13 }}>{l.branch.prompt}</div>
        <div className="choice">
          {l.branch.choices.map((c, i) => (
            <button key={i} onClick={() => onToast('已选择：' + c)}>{c}</button>
          ))}
        </div>
      </div>
    </section>
  )
}
