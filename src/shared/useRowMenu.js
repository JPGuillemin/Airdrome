// useRowMenu.js
//
// Shared long-press / context-menu handling for list and tile views.
//
// Each view registers one RowActionsMenu (or OverflowMenu) instance per row
// through setMenuRef(key, instance) / menuRefFor(key). A right click, a
// mouse long press or a touch long press then opens that row's menu without
// needing a per-row trigger button.
import { onBeforeUnmount } from 'vue'

var LONG_PRESS_MS = 500
// Pixels the pointer may drift during a long press before it is cancelled
var MOVE_TOLERANCE = 5

/**
 * @param {object} [options]
 * @param {Function} [options.enabled] Returns false to disable the menu
 *   (for example on mobile, where the tile overlay already shows the actions).
 * @param {Function} [options.onOpen] Called with the row key once a menu was
 *   opened, so a view can refresh data the menu depends on.
 */
export function useRowMenu(options) {
  var settings = options || {}
  var isEnabled = settings.enabled
  var onOpen = settings.onOpen

  // Keyed by row key (track / album / artist id), never by list index, which
  // changes when the list moves.
  var menuRefs = new Map()

  var pressTimer = null
  var pressSource = null
  var pressStart = { x: 0, y: 0 }
  var suppressNextClick = false

  function enabled() {
    if (typeof isEnabled !== 'function') {
      return true
    }

    return !!isEnabled()
  }

  function setMenuRef(key, instance) {
    if (instance) {
      menuRefs.set(key, instance)
    } else {
      menuRefs.delete(key)
    }
  }

  /** Build the ref callback that registers the menu of a given row. */
  function menuRefFor(key) {
    return function(instance) {
      setMenuRef(key, instance)
    }
  }

  function notifyOpened(key) {
    if (typeof onOpen === 'function') {
      onOpen(key)
    }
  }

  /** Open the row menu at a point (right click / long press). */
  function openAt(key, point) {
    if (!enabled()) {
      return
    }

    var menu = menuRefs.get(key)

    if (!menu) {
      return
    }

    // RowActionsMenu exposes openAt(); other menus only expose open().
    if (typeof menu.openAt === 'function') {
      menu.openAt(point)
    } else if (typeof menu.open === 'function') {
      menu.open()
    } else {
      return
    }

    notifyOpened(key)
  }

  /** Open the row menu without a point. */
  function open(key) {
    if (!enabled()) {
      return
    }

    var menu = menuRefs.get(key)

    if (!menu) {
      return
    }

    if (typeof menu.open === 'function') {
      menu.open()
    } else if (typeof menu.openAt === 'function') {
      menu.openAt()
    } else {
      return
    }

    notifyOpened(key)
  }

  function onContextMenu(key, event) {
    openAt(key, {
      top: event.clientY,
      bottom: event.clientY,
      left: event.clientX,
      right: event.clientX
    })
  }

  function cancelPress() {
    if (pressTimer) {
      clearTimeout(pressTimer)
      pressTimer = null
    }

    pressSource = null
  }

  function touchPoint(event) {
    if (event.touches && event.touches.length) {
      return {
        x: event.touches[0].clientX,
        y: event.touches[0].clientY
      }
    }

    if (event.changedTouches && event.changedTouches.length) {
      return {
        x: event.changedTouches[0].clientX,
        y: event.changedTouches[0].clientY
      }
    }

    return null
  }

  function movedTooFar(point) {
    if (!point) {
      return false
    }

    if (Math.abs(point.x - pressStart.x) > MOVE_TOLERANCE) {
      return true
    }

    return Math.abs(point.y - pressStart.y) > MOVE_TOLERANCE
  }

  // --- Mouse long press (desktop): same menu as right click ---
  function onMouseDown(key, event) {
    // The menu overlay can swallow the click that ends a long press, so a
    // stale flag must never leak into the next press.
    suppressNextClick = false
    cancelPress()

    if (!enabled()) {
      return
    }

    if (event.button !== 0) {
      return
    }

    // Checkboxes and other controls keep their normal behaviour
    var target = event.target

    if (target && target.closest && target.closest('input, button, a')) {
      return
    }

    var start = { x: event.clientX, y: event.clientY }

    pressSource = 'mouse'
    pressStart = start

    pressTimer = setTimeout(function() {
      pressTimer = null
      pressSource = null
      suppressNextClick = true

      openAt(key, {
        top: start.y,
        bottom: start.y,
        left: start.x,
        right: start.x
      })
    }, LONG_PRESS_MS)
  }

  function onMouseMove(event) {
    if (!pressTimer || pressSource !== 'mouse') {
      return
    }

    if (
      Math.abs(event.clientX - pressStart.x) > MOVE_TOLERANCE ||
      Math.abs(event.clientY - pressStart.y) > MOVE_TOLERANCE
    ) {
      cancelPress()
    }
  }

  function onMouseUp() {
    if (pressSource === 'mouse') {
      cancelPress()
    }
  }

  // --- Touch long press: open at the row rectangle ---
  function onTouchStart(key, event) {
    suppressNextClick = false
    cancelPress()

    if (!enabled()) {
      return
    }

    // currentTarget is null once the handler returns, so keep the row now.
    var row = event.currentTarget
    var point = touchPoint(event)

    if (point) {
      pressStart = point
    } else {
      pressStart = { x: 0, y: 0 }
    }

    pressSource = 'touch'

    pressTimer = setTimeout(function() {
      pressTimer = null
      pressSource = null
      suppressNextClick = true

      if (row && row.getBoundingClientRect) {
        var rect = row.getBoundingClientRect()

        openAt(key, {
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right
        })
      } else {
        openAt(key)
      }
    }, LONG_PRESS_MS)
  }

  function onTouchMove(event) {
    if (!pressTimer || pressSource !== 'touch') {
      return
    }

    if (movedTooFar(touchPoint(event))) {
      cancelPress()
    }
  }

  function onTouchEnd() {
    if (pressSource === 'touch') {
      cancelPress()
    }
  }

  /**
   * Consume the click that follows a long press.
   *
   * @returns {boolean} true when the click must be ignored.
   */
  function consumeSuppressedClick() {
    if (!suppressNextClick) {
      return false
    }

    suppressNextClick = false
    return true
  }

  function dispose() {
    cancelPress()
    menuRefs.clear()
    suppressNextClick = false
  }

  onBeforeUnmount(dispose)

  return {
    setMenuRef: setMenuRef,
    menuRefFor: menuRefFor,
    openAt: openAt,
    open: open,
    onContextMenu: onContextMenu,
    onMouseDown: onMouseDown,
    onMouseMove: onMouseMove,
    onMouseUp: onMouseUp,
    onTouchStart: onTouchStart,
    onTouchMove: onTouchMove,
    onTouchEnd: onTouchEnd,
    consumeSuppressedClick: consumeSuppressedClick,
    dispose: dispose
  }
}
