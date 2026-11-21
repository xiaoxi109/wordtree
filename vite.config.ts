import { readFileSync, existsSync, createReadStream, statSync } from 'node:fs'
import { cp, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf-8')) as {
  version: string
}

// TARGET=android → 相对路径（APK 需要）
// TARGET=web / 默认 → GitHub Pages 路径
const TARGET = process.env.TARGET || 'web'
const base = TARGET === 'android' ? './' : '/LexiCore/'

/** 原书录音下载缓存（gitignored，构建期才搬进 dist） */
const BOOK_AUDIO_SRC = path.join(ROOT, '.cache', 'book-audio')
const BOOK_AUDIO_DIST = path.join(ROOT, 'dist', 'books', 'audio')

/**
 * 书籍课程的原书录音（600MB+）不进 git：
 * 下载缓存在 .cache/book-audio/，构建时整目录拷进 dist/books/audio/，
 * 再由 cap sync 打进 APK 的 assets/public/books/audio/。
 * 目录不存在时直接跳过，保证没有音频也能正常构建。
 */
function copyBookAudio(): Plugin {
  return {
    name: 'copy-book-audio',
    async closeBundle() {
      // 只有 APK 构建才把 600MB 原声打进产物；
      // web 版走远程流式，避免把 dist 撑成几百兆。
      if (TARGET !== 'android') {
        console.log('[vite] 非 android 构建，跳过书籍音频拷贝')
        return
      }
      if (!existsSync(BOOK_AUDIO_SRC)) {
        console.log('[vite] 未找到 .cache/book-audio，跳过书籍音频拷贝')
        return
      }
      await mkdir(BOOK_AUDIO_DIST, { recursive: true })
      await cp(BOOK_AUDIO_SRC, BOOK_AUDIO_DIST, { recursive: true })
      console.log('[vite] 书籍录音已拷入 dist/books/audio')
    },
    // 开发模式：直接把缓存里的音频按 /books/audio/** 伺服，便于本地试听
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        serveAudio(req, res, next)
      })
    },
  }
}

/** 从 .cache/book-audio 提供音频（支持 Range，浏览器才能拖动进度） */
function serveAudio(req: IncomingMessage, res: ServerResponse, next: () => void): void {
  const url = req.url ?? ''
  const marker = '/books/audio/'
  const idx = url.indexOf(marker)
  if (idx < 0) return next()
  const rel = decodeURIComponent(url.slice(idx + marker.length).split('?')[0])
  if (!rel || rel.includes('..')) return next()
  const file = path.join(BOOK_AUDIO_SRC, rel)
  if (!existsSync(file)) return next()

  let size = 0
  try {
    size = statSync(file).size
  } catch {
    return next()
  }
  const range = req.headers.range
  const headers: Record<string, string> = {
    'Content-Type': 'audio/mpeg',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-cache',
  }
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range)
    const start = m && m[1] ? Number(m[1]) : 0
    const end = m && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1
    if (start >= size) {
      res.writeHead(416, { 'Content-Range': `bytes */${size}` })
      res.end()
      return
    }
    headers['Content-Range'] = `bytes ${start}-${end}/${size}`
    headers['Content-Length'] = String(end - start + 1)
    res.writeHead(206, headers)
    createReadStream(file, { start, end }).pipe(res)
    return
  }
  headers['Content-Length'] = String(size)
  res.writeHead(200, headers)
  createReadStream(file).pipe(res)
}

export default defineConfig({
  plugins: [react(), copyBookAudio()],
  base,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    host: true,
    port: 5173,
  },
})
