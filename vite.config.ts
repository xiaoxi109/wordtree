import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as {
  version: string
}

// TARGET=android → 相对路径（APK 需要）
// TARGET=web / 默认 → GitHub Pages 路径
const TARGET = process.env.TARGET || 'web'
const base = TARGET === 'android' ? './' : '/LexiCore/'

export default defineConfig({
  plugins: [react()],
  base,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    host: true,
    port: 5173,
  },
})
