/**
 * 外观主题：
 * - system：跟随系统的浅色 / 深色偏好
 * - light / dark：用户强制指定
 *
 * 偏好整体持久化在 localStorage，实际生效的浅 / 深由 resolveTheme 推导。
 */
export type ThemePreference = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'lexicore-theme'

export const THEME_OPTIONS: ReadonlyArray<{
  id: ThemePreference
  label: string
  description: string
}> = [
  { id: 'system', label: '跟随系统', description: '使用设备的浅色 / 深色外观设置' },
  { id: 'light', label: '浅色', description: '始终使用浅色外观' },
  { id: 'dark', label: '深色', description: '始终使用深色外观' },
]

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark'
}

export function themePreferenceLabel(value: ThemePreference): string {
  return THEME_OPTIONS.find((o) => o.id === value)?.label ?? '跟随系统'
}

/** 读取当前系统外观偏好；SSR / 不支持 matchMedia 的环境默认浅色。 */
export function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** 把用户偏好解析成实际生效的浅 / 深主题。 */
export function resolveTheme(pref: ThemePreference): ResolvedTheme {
  return pref === 'system' ? getSystemTheme() : pref
}
