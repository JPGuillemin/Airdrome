// src/shared/debugLog.ts
//
// On-device console for debugging without adb.
//  - Enable once by opening the app with  ?debug=1  (disable with ?debug=0).
//  - Hooks console.* + uncaught errors + visibility changes, and keeps the
//    last MAX lines in localStorage, so you can read what happened while the
//    screen was off / the app was in background.
//  - A small 🐞 button opens an overlay with Copy / Clear / Close.
//
// Usage: add  `import '@/shared/debugLog'`  as the FIRST import of main.ts.

const FLAG = 'debug'
const KEY = 'debugLog'
const MAX = 400

const params = new URLSearchParams(location.search)
if (params.get('debug') === '1') localStorage.setItem(FLAG, '1')
if (params.get('debug') === '0') {
  localStorage.removeItem(FLAG)
  localStorage.removeItem(KEY)
}

if (localStorage.getItem(FLAG) === '1') {
  let buf: string[] = []
  try { buf = JSON.parse(localStorage.getItem(KEY) || '[]') } catch {}

  let saveTimer: ReturnType<typeof setTimeout> | undefined
  let render: (() => void) | null = null

  const fmt = (a: unknown): string => {
    if (typeof a === 'string') return a
    if (a instanceof Error) return a.stack || a.message
    try { return JSON.stringify(a) } catch { return String(a) }
  }

  const push = (level: string, args: unknown[]) => {
    const d = new Date()
    const t = d.toTimeString().slice(0, 8) + '.' + String(d.getMilliseconds()).padStart(3, '0')
    buf.push(`${t} ${level} ${args.map(fmt).join(' ')}`)
    if (buf.length > MAX) buf.splice(0, buf.length - MAX)
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify(buf)) } catch {}
    }, 300)
    render?.()
  }

  for (const level of ['log', 'info', 'warn', 'error'] as const) {
    const orig = console[level].bind(console)
    console[level] = (...args: unknown[]) => {
      orig(...args)
      push(level[0].toUpperCase(), args)
    }
  }

  window.addEventListener('error', (e) => push('E', ['uncaught', e.message, `${e.filename}:${e.lineno}`]))
  window.addEventListener('unhandledrejection', (e) => push('E', ['unhandled rejection', e.reason]))
  document.addEventListener('visibilitychange', () => push('I', ['[page] visibility =', document.visibilityState]))
  push('I', ['[debugLog] session start', navigator.userAgent])

  // ── Overlay ───────────────────────────────────────────────────────────────
  const mount = () => {
    const btn = document.createElement('button')
    btn.textContent = '🐞'
    btn.style.cssText =
      'position:fixed;right:8px;bottom:80px;z-index:99999;width:40px;height:40px;' +
      'border-radius:50%;border:none;opacity:.6;font-size:20px'

    const panel = document.createElement('div')
    panel.style.cssText =
      'position:fixed;inset:0;z-index:99998;background:#000d;color:#9f9;display:none;' +
      'flex-direction:column;font:11px/1.35 monospace'

    const bar = document.createElement('div')
    bar.style.cssText = 'display:flex;gap:8px;padding:8px'
    const pre = document.createElement('pre')
    pre.style.cssText = 'flex:1;margin:0;padding:8px;overflow:auto;white-space:pre-wrap;word-break:break-all'

    const mk = (label: string, fn: () => void) => {
      const b = document.createElement('button')
      b.textContent = label
      b.onclick = fn
      bar.appendChild(b)
    }

    render = () => {
      if (panel.style.display === 'none') return
      pre.textContent = buf.join('\n')
      pre.scrollTop = pre.scrollHeight
    }

    mk('Copy', () => navigator.clipboard?.writeText(buf.join('\n')).catch(() => {}))
    mk('Clear', () => { buf = []; localStorage.removeItem(KEY); render?.() })
    mk('Close', () => { panel.style.display = 'none' })

    btn.onclick = () => { panel.style.display = 'flex'; render?.() }
    panel.append(bar, pre)
    document.body.append(btn, panel)
  }

  if (document.body) mount()
  else addEventListener('DOMContentLoaded', mount)
}

export {}
