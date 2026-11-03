interface Props {
  active?: boolean
  ladder: 'cn' | 'en'
  setLadder: (l: 'cn' | 'en') => void
  myLevelCn: string
  masteredCount: number
  onBrowseMastered: () => void
  onChallenge: () => void
  onToast: (msg: string) => void
}

export function Settings({ active, ladder, setLadder, myLevelCn, masteredCount, onBrowseMastered, onChallenge, onToast }: Props) {
  const levelLabel = ladder === 'cn' ? myLevelCn : 'A1'

  return (
    <section className={'screen' + (active ? ' active' : '')} id="s-settings">
      <div className="sticky-head">
        <div className="topbar">
          <h1>我的</h1>
        </div>
      </div>

      <div className="box">
        <h3>学习路线（阶梯）</h3>
        <div className="seg seg-small" style={{ marginTop: 8 }}>
          <button className={ladder === 'cn' ? 'on' : ''} onClick={() => setLadder('cn')}>中式阶梯</button>
          <button className={ladder === 'en' ? 'on' : ''} onClick={() => setLadder('en')}>西式阶梯</button>
        </div>
        <div className="muted" style={{ marginTop: 8 }}>
          两套路线共享同一批词与掌握状态，可随时切换；切换时基于已掌握词跨阶梯晋升。
        </div>
      </div>

      <div className="box" id="levelBox">
        <h3>我的等级</h3>
        <div className="row">
          <b>当前等级</b>
          <span className="val" onClick={() => onToast('演示：可在此展开等级选择')}>{levelLabel} ▾</span>
        </div>
        <div className="row">
          <b>自动晋级</b>
          <span className="val">闯关制（临界词抽检）</span>
        </div>
        <div className="row">
          <b>当前进度</b>
          <span className="val">{myLevelCn}及以下 92% 已掌握</span>
        </div>
        <button className="btn-block brand" style={{ marginTop: 12 }} onClick={onChallenge}>
          🚀 开始晋级闯关
        </button>
      </div>

      <div className="box" onClick={onBrowseMastered} style={{ cursor: 'pointer' }}>
        <h3>已掌握单词</h3>
        <div className="row" style={{ borderBottom: 0 }}>
          <b>查看已掌握列表</b>
          <span className="val">{masteredCount} 词 ›</span>
        </div>
      </div>

      <div className="box">
        <h3>复习算法</h3>
        <div className="row">
          <b>模式</b>
          <span className="val">间隔重复（连对越多间隔越长）</span>
        </div>
        <div className="muted" style={{ marginTop: 6 }}>
          后续可升级 FSRS（按遗忘曲线个性化排程）。
        </div>
      </div>

      <div className="box">
        <h3>词库</h3>
        <div className="row">
          <b>总词库</b>
          <span className="val">20k 策展通用词</span>
        </div>
        <div className="row">
          <b>外部词典</b>
          <span className="val">不内置（超纲词自行查询）</span>
        </div>
      </div>
    </section>
  )
}
