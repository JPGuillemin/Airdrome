// theme.js
//
// Shared theme helpers. Kept outside main.js so components can apply a theme
// without duplicating the hex-to-RGB conversion.

/**
 * Convert a 6-digit hex color to an "r, g, b" string for CSS variables.
 *
 * @param {string} hex
 * @returns {string}
 */
export function hexToRgb(hex) {
  var value = hex.replace('#', '')
  var number = parseInt(value, 16)
  var red = (number >> 16) & 255
  var green = (number >> 8) & 255
  var blue = number & 255

  return red + ', ' + green + ', ' + blue
}

/**
 * Apply an accent color to the document and persist it.
 *
 * @param {string} color
 * @returns {void}
 */
export function applyTheme(color) {
  document.documentElement.style.setProperty('--bs-primary', color)
  document.documentElement.style.setProperty('--bs-primary-rgb', hexToRgb(color))
  localStorage.setItem('themeColor', color)
}
