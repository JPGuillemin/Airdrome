// src/shared/debugLog.js
//
// On-device console for debugging without adb.
//  - Enable once by opening the app with  ?debug=1  (disable with ?debug=0).
//  - Hooks console.* + uncaught errors + visibility changes, and keeps the
//    last MAX lines in localStorage, so you can read what happened while the
//    screen was off / the app was in background.
//  - A small 🐞 button opens an overlay with Copy / Clear / Close.
//
// Usage: add  `import '@/shared/debugLog'`  as the FIRST import of main.ts.

var FLAG = 'debug'
var KEY = 'debugLog'
var MAX = 400

var params = new URLSearchParams(location.search)

if (params.get('debug') === '1') {
  localStorage.setItem(FLAG, '1')
}

if (params.get('debug') === '0') {
  localStorage.removeItem(FLAG)
  localStorage.removeItem(KEY)
}

if (localStorage.getItem(FLAG) === '1') {
  var buf = []

  try {
    buf = JSON.parse(localStorage.getItem(KEY) || '[]')
  } catch (error) {
    buf = []
  }

  var saveTimer = undefined
  var render = null

  /**
   * Format one console argument as a single line.
   *
   * @param {*} a
   * @returns {string}
   */
  var fmt = function(a) {
    if (typeof a === 'string') {
      return a
    }

    if (a instanceof Error) {
      return a.stack || a.message
    }

    try {
      return JSON.stringify(a)
    } catch (error) {
      return String(a)
    }
  }

  /**
   * Append one line to the buffer and schedule a localStorage save.
   *
   * @param {string} level
   * @param {Array} args
   * @returns {void}
   */
  var push = function(level, args) {
    var d = new Date()
    var t = d.toTimeString().slice(0, 8) + '.' + String(d.getMilliseconds()).padStart(3, '0')
    var parts = []

    for (var i = 0; i < args.length; i++) {
      parts.push(fmt(args[i]))
    }

    buf.push(t + ' ' + level + ' ' + parts.join(' '))

    if (buf.length > MAX) {
      buf.splice(0, buf.length - MAX)
    }

    clearTimeout(saveTimer)

    saveTimer = setTimeout(function() {
      try {
        localStorage.setItem(KEY, JSON.stringify(buf))
      } catch (error) {
        // Storage may be full or unavailable; logging must keep working.
      }
    }, 300)

    if (render) {
      render()
    }
  }

  var levels = ['log', 'info', 'warn', 'error']

  for (var i = 0; i < levels.length; i++) {
    var levelName = levels[i]
    var original = console[levelName].bind(console)

    console[levelName] = (function(name, orig) {
      return function() {
        var args = Array.prototype.slice.call(arguments)
        orig.apply(console, args)
        push(name.charAt(0).toUpperCase(), args)
      }
    })(levelName, original)
  }

  window.addEventListener('error', function(e) {
    push('E', ['uncaught', e.message, e.filename + ':' + e.lineno])
  })

  window.addEventListener('unhandledrejection', function(e) {
    push('E', ['unhandled rejection', e.reason])
  })

  document.addEventListener('visibilitychange', function() {
    push('I', ['[page] visibility =', document.visibilityState])
  })

  push('I', ['[debugLog] session start', navigator.userAgent])

  // ── Overlay ───────────────────────────────────────────────────────────────
  var mount = function() {
    var btn = document.createElement('button')
    btn.textContent = '🐞'
    btn.style.cssText =
      'position:fixed;right:8px;bottom:80px;z-index:99999;width:40px;height:40px;' +
      'border-radius:50%;border:none;opacity:.6;font-size:20px'

    var panel = document.createElement('div')
    panel.style.cssText =
      'position:fixed;inset:0;z-index:99998;background:#000d;color:#9f9;display:none;' +
      'flex-direction:column;font:11px/1.35 monospace'

    var bar = document.createElement('div')
    bar.style.cssText = 'display:flex;gap:8px;padding:8px'

    var pre = document.createElement('pre')
    pre.style.cssText = 'flex:1;margin:0;padding:8px;overflow:auto;white-space:pre-wrap;word-break:break-all'

    /**
     * Add a button to the overlay toolbar.
     *
     * @param {string} label
     * @param {Function} fn
     * @returns {void}
     */
    var mk = function(label, fn) {
      var b = document.createElement('button')
      b.textContent = label
      b.onclick = fn
      bar.appendChild(b)
    }

    render = function() {
      if (panel.style.display === 'none') {
        return
      }

      pre.textContent = buf.join('\n')
      pre.scrollTop = pre.scrollHeight
    }

    async function copyLog() {
      try {
        await navigator.clipboard.writeText(buf.join('\n'))
      } catch (error) {
        // Clipboard permission can be denied; nothing else to do.
      }
    }

    mk('Copy', function() {
      if (navigator.clipboard) {
        copyLog()
      }
    })

    mk('Clear', function() {
      buf = []
      localStorage.removeItem(KEY)
      if (render) {
        render()
      }
    })

    mk('Close', function() {
      panel.style.display = 'none'
    })

    btn.onclick = function() {
      panel.style.display = 'flex'
      if (render) {
        render()
      }
    }

    panel.appendChild(bar)
    panel.appendChild(pre)
    document.body.appendChild(btn)
    document.body.appendChild(panel)
  }

  if (document.body) {
    mount()
  } else {
    addEventListener('DOMContentLoaded', mount)
  }
}

export {}
