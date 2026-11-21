import { describe, expect, it } from 'vitest'
import { meaningGroups } from './meaningGroups'

describe('meaningGroups：释义按词性分组', () => {
  it('按词性切开，组内多条释义仍用「；」相连', () => {
    const groups = meaningGroups('v. 取消（计划好的事情）；终止，废除；n. 取消，撤销；邮票注销章')
    expect(groups).toEqual([
      { pos: 'v.', text: '取消（计划好的事情）；终止，废除' },
      { pos: 'n.', text: '取消，撤销；邮票注销章' },
    ])
  })

  it('同一词性连续出现时合并成一组', () => {
    const groups = meaningGroups('n. 婴儿；n. 婴儿，婴孩；动物幼崽；v. 玩耍')
    expect(groups).toEqual([
      { pos: 'n.', text: '婴儿；婴儿，婴孩；动物幼崽' },
      { pos: 'v.', text: '玩耍' },
    ])
  })

  it('没有词性前缀时整段归到无词性分组', () => {
    const groups = meaningGroups('取消；撤销')
    expect(groups).toEqual([{ pos: '', text: '取消；撤销' }])
  })

  it('词性后面紧跟中文也能识别', () => {
    const groups = meaningGroups('adj.（蔬菜）幼嫩的；（幼）小的，小型的')
    expect(groups).toEqual([{ pos: 'adj.', text: '（蔬菜）幼嫩的；（幼）小的，小型的' }])
  })

  it('识别不出的英文前缀不当作词性', () => {
    const groups = meaningGroups('e.g. 例如这样')
    expect(groups).toEqual([{ pos: '', text: 'e.g. 例如这样' }])
  })

  it('空释义返回空数组', () => {
    expect(meaningGroups('')).toEqual([])
    expect(meaningGroups('   ')).toEqual([])
  })

  it('复合词性（aux.v.）也能识别', () => {
    const groups = meaningGroups('aux.v. 助动词；已完成')
    expect(groups[0].pos).toBe('aux.v.')
    expect(groups[0].text).toBe('助动词；已完成')
  })
})
