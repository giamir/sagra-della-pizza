// UI zoom for the till window. The factor drives Chromium's page zoom (via the
// preload bridge) and is persisted per machine in localStorage, like the theme.

const STORAGE_KEY = 'sagra-zoom'
const MIN = 0.6
const MAX = 1.8
const STEP = 0.1

function clamp(factor: number): number {
  return Math.min(MAX, Math.max(MIN, Math.round(factor * 100) / 100))
}

function initialFactor(): number {
  const saved = Number(localStorage.getItem(STORAGE_KEY))
  return Number.isFinite(saved) && saved > 0 ? clamp(saved) : 1
}

export const zoom = $state<{ factor: number }>({ factor: initialFactor() })

export function setZoom(factor: number): void {
  zoom.factor = clamp(factor)
  localStorage.setItem(STORAGE_KEY, String(zoom.factor))
  window.api.setZoomFactor(zoom.factor)
}

export function zoomIn(): void {
  setZoom(zoom.factor + STEP)
}

export function zoomOut(): void {
  setZoom(zoom.factor - STEP)
}

export function resetZoom(): void {
  setZoom(1)
}

// Applies the stored factor and binds Ctrl/Cmd +, -, 0 for the window's lifetime.
export function initZoom(): void {
  window.api.setZoomFactor(zoom.factor)
  window.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return
    if (e.key === '+' || e.key === '=') {
      e.preventDefault()
      zoomIn()
    } else if (e.key === '-') {
      e.preventDefault()
      zoomOut()
    } else if (e.key === '0') {
      e.preventDefault()
      resetZoom()
    }
  })
}
