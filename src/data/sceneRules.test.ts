import { describe, expect, it } from 'vitest'
import { guessScene } from './sceneRules'

/**
 * 场景规则只用于 ECDICT 补充词（没有人工分类），
 * 这里锁住几类典型信号：领域标签 > 英文词类 > 中文关键词 > 词性兜底。
 */
describe('guessScene', () => {
  it('词典领域标签优先', () => {
    expect(guessScene('[医] 疾病；病症')).toBe('health')
    expect(guessScene('[法] 判决；诉讼')).toBe('law')
  })

  it('中文关键词命中常见场景', () => {
    expect(guessScene('n. 苹果；苹果树')).toBe('food')
    expect(guessScene('n. 医生；医院')).toBe('health')
    expect(guessScene('n. 法律；法规')).toBe('law')
    expect(guessScene('n. 汽车；车辆')).toBe('travel')
    expect(guessScene('n. 颜色；红色')).toBe('colors')
  })

  it('没有关键词时按词性兜底', () => {
    expect(guessScene('vt. 完成；实现')).toBe('actions')
    expect(guessScene('prep. 向；对于')).toBe('grammar')
    expect(guessScene('adv. 主要地')).toBe('thinking')
  })

  it('空释义返回 null，交给调用方回退', () => {
    expect(guessScene('')).toBeNull()
    expect(guessScene('n. 某种抽象概念')).not.toBe('food')
  })

  it('英文词形参与判定：疑问词 / 功能词 / 数词 / 方位词', () => {
    expect(guessScene('pron. 什么', '', 'what')).toBe('questions')
    expect(guessScene('art. 这（那）个', '', 'the')).toBe('grammar')
    expect(guessScene('num. 七', '', 'seven')).toBe('numbers')
    expect(guessScene('adv. 向上', '', 'up')).toBe('space')
    expect(guessScene('n. 小时', '', 'hour')).toBe('time')
    expect(guessScene('a. 红色的', '', 'red')).toBe('colors')
  })

  it('英文精确词表兜底中文释义不明确的词', () => {
    expect(guessScene('n. 地理学', '', 'geography')).toBe('space')
    expect(guessScene('n. 工程师', '', 'engineer')).toBe('work')
  })

  it('词性字段为 ECDICT 缩写（vt / a）时也能命中', () => {
    expect(guessScene('vt. 跑', 'vt', 'run')).toBe('actions')
    expect(guessScene('a. 美丽的', 'a', 'beautiful')).toBe('thinking')
    // 释义里的多义项词性也要能读到
    expect(guessScene('n. 擦拭；vt. 擦', 'n', 'wipe')).toBe('actions')
  })

  it('避免单字造成的误判', () => {
    expect(guessScene('n. 明白；懂得', '', 'understand')).not.toBe('colors')
    expect(guessScene('n. 计划；打算', '', 'plan')).not.toBe('arts')
    expect(guessScene('n. 参加；参与', '', 'attend')).not.toBe('numbers')
  })

  it('新增场景：运动 / 音乐 / 科技 / 城市 / 节日 / 法律 / 军事 / 宗教 / 天气', () => {
    expect(guessScene('n. 足球；球场', '', 'football')).toBe('sports')
    expect(guessScene('n. 钢琴；乐器', '', 'piano')).toBe('music')
    expect(guessScene('n. 计算机；软件', '', 'computer')).toBe('tech')
    expect(guessScene('n. 城市；建筑物', '', 'city')).toBe('city')
    expect(guessScene('n. 生日；庆祝', '', 'birthday')).toBe('festival')
    expect(guessScene('n. 法院；审判', '', 'court')).toBe('law')
    expect(guessScene('n. 军队；士兵', '', 'army')).toBe('military')
    expect(guessScene('n. 教堂；牧师', '', 'church')).toBe('religion')
    expect(guessScene('n. 天气；下雨', '', 'weather')).toBe('weather')
  })

  it('领域标签优先，且优先取首个义项', () => {
    expect(guessScene('[体] 体育运动；比赛')).toBe('sports')
    expect(guessScene('[宗] 宗教；信仰')).toBe('religion')
    expect(guessScene('[军] 军队；战争')).toBe('military')
    // 首个义项没有标签时，中文关键词优先于后续义项里的标签
    expect(guessScene('n. 医生；[法] 医生')).toBe('health')
  })
})
