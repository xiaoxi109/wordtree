import { useEffect, useState } from 'react'
import { CH_SAMPLE, findWord } from '../data/lexicon'
import { speak } from '../lib/speak'

interface Props {
  open: boolean
  onClose: () => void
  onResult: (passed: boolean) => void
  onAnswered: (id: string, correct: boolean) => void
}

/** 闯关晋级覆盖层：临界词抽检，≥80% 通过即视为晋级成功。 */
export function ChallengeOverlay({ open, onClose, onResult, onAnswered }: Props) {
  const [idx, setIdx] = useState(0)
  const [pass, setPass] = useState(0)

  useEffect(() => {
    if (open) {
      setIdx(0)
      setPass(0)
    }
  }, [open])

  if (!open) return null

  if (idx >= CH_SAMPLE.length) {
    const ok = pass >= Math.ceil(CH_SAMPLE.length * 0.8)
    return (
      <div className="overlay show">
        <div className="ov-head">
          <span className="bk" onClick={onClose}>‹</span>
          <b>晋级闯关</b>
        </div>
        <div className="ov-body">
          <div className="empty">
            <div className="ico">{ok ? '🎉' : '💪'}</div>
            <div className="t">{ok ? '闯关成功，已晋升！' : '未达阈值，再复习一下'}</div>
            <div className="muted">
              通过 {pass} / {CH_SAMPLE.length} 题
              {ok ? '，激活词库窗口上滑至下一等级' : '（需 ≥80% 通过）'}
            </div>
            <button className="btn-block brand" style={{ marginTop: 16 }} onClick={() => { onResult(ok); onClose() }}>
              完成
            </button>
          </div>
        </div>
      </div>
    )
  }

  const w = findWord(CH_SAMPLE[idx])!
  return (
    <div className="overlay show">
      <div className="ov-head">
        <span className="bk" onClick={onClose}>‹</span>
        <b>晋级闯关</b>
      </div>
      <div className="ov-body">
        <div className="prog">
          <i style={{ width: (idx / CH_SAMPLE.length) * 100 + '%' }} />
        </div>
        <div className="banner">
          第 {idx + 1} / {CH_SAMPLE.length} 题 · 临界词抽检
        </div>
        <div className="box">
          <div style={{ fontSize: 24, fontWeight: 700 }}>{w.word}</div>
          <div style={{ color: '#9aa3af' }}>/{w.ipa}/</div>
          <button className="btn-block ghost" style={{ marginTop: 10 }} onClick={() => speak(w.word)}>
            🔊 听发音
          </button>
          <div className="muted" style={{ marginTop: 10 }}>
            写出/说出它的意思：<b>{w.m[0]}</b>？
          </div>
          <button
            className="btn-block ghost"
            onClick={() => { onAnswered(w.id, false); setIdx((i) => i + 1) }}
          >
            😶 不会（未掌握）
          </button>
          <button
            className="btn-block ok"
            onClick={() => { onAnswered(w.id, true); setPass((p) => p + 1); setIdx((i) => i + 1) }}
          >
            ✅ 我会（掌握）
          </button>
        </div>
      </div>
    </div>
  )
}
