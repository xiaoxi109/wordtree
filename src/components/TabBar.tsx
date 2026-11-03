import { BookOpenIcon, HomeIcon, UserIcon } from './icons'

export type TabId = 'home' | 'lesson' | 'settings'

const TABS: { id: TabId; label: string; Icon: (p: { width?: number; height?: number }) => JSX.Element }[] = [
  { id: 'home', label: '首页', Icon: HomeIcon },
  { id: 'lesson', label: '课文', Icon: BookOpenIcon },
  { id: 'settings', label: '我的', Icon: UserIcon },
]

export function TabBar({ tab, onChange }: { tab: TabId; onChange: (t: TabId) => void }) {
  return (
    <nav className="tabbar">
      {TABS.map(({ id, label, Icon }) => (
        <button key={id} className={'tab' + (tab === id ? ' on' : '')} onClick={() => onChange(id)}>
          <Icon width={22} height={22} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  )
}
