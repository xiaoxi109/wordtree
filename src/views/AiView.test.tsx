// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import AiView from './AiView'
import { AiSettingsFields } from '../components/AiSettings'
import LessonReader from './LessonReader'

const noop = () => {}
const toast = vi.fn()

const render = (node: React.ReactElement) => renderToString(node)

describe('AiView 挂载冒烟', () => {
  it('无已掌握词时渲染空态引导', () => {
    const html = render(
      <AiView
        masteredSet={new Set()}
        onApplyMark={noop}
        onToast={toast}
        readerSetId={null}
        onOpenReader={() => {}}
        onBack={noop}
      />,
    )
    expect(html).toContain('AI 定制课程')
    expect(html).toContain('先标记已掌握的词')
    expect(html).toContain('每篇')
    expect(html).toContain('开始生成')
  })

  it('有已掌握词时渲染主操作与条件摘要', () => {
    const mastered = new Set(['order', 'salad', 'menu'])
    const html = render(
      <AiView
        masteredSet={mastered}
        onApplyMark={noop}
        onToast={toast}
        readerSetId={null}
        onOpenReader={() => {}}
        onBack={noop}
      />,
    )
    expect(html).toContain('已掌握')
    expect(html).toContain('开始生成')
    expect(html).toContain('自适应')
    expect(html).toContain('每篇')
    expect(html).toContain('我的课程集')
  })
})

describe('AiSettingsFields 挂载冒烟', () => {
  it('渲染配置字段与内置默认模型', () => {
    const html = render(<AiSettingsFields onToast={toast} />)
    expect(html).toContain('API 地址')
    expect(html).toContain('测试连接')
    expect(html).toContain('保存设置')
    expect(html).toContain('agnes-3.0-flash')
  })
})

describe('LessonReader 挂载冒烟', () => {
  it('加载中渲染 loading', () => {
    const html = render(
      <LessonReader
        setId="set-x"
        onBack={noop}
        onApplyMark={noop}
        onRetrySingle={noop}
        busy={false}
        onToast={toast}
      />,
    )
    expect(html).toContain('animate-spin')
  })
})
