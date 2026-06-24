// Light/dark theme state for the renderer. The chosen mode is persisted in
// localStorage (per machine) and applied as a `.dark` class on <html>, which
// drives the palette remap in app.css. First paint is handled by the inline
// script in index.html so there's no flash before this module loads.

export type ThemeMode = 'light' | 'dark'

const STORAGE_KEY = 'sagra-theme'

function systemPrefersDark(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

function initialMode(): ThemeMode {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved === 'light' || saved === 'dark') return saved
  return systemPrefersDark() ? 'dark' : 'light'
}

export const theme = $state<{ mode: ThemeMode }>({ mode: initialMode() })

export function applyTheme(): void {
  document.documentElement.classList.toggle('dark', theme.mode === 'dark')
}

export function toggleTheme(): void {
  theme.mode = theme.mode === 'dark' ? 'light' : 'dark'
  localStorage.setItem(STORAGE_KEY, theme.mode)
  applyTheme()
}
