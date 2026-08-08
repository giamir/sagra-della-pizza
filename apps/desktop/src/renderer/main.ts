import { mount } from 'svelte'
import App from './App.svelte'
import './app.css'
import { applyTheme } from '$lib/theme.svelte'
import { applyTenantAccent } from '$lib/tenant-theme'
import { initZoom } from '$lib/zoom.svelte'

// Repaint the accent ramp from the tenant brand (or the per-machine override)
// before mount (flash-free), then keep the <html> class in sync with the stored
// theme (the inline script in index.html already set the dark/light class for
// first paint). Zoom restores the saved factor and binds Ctrl/Cmd +, -, 0.
applyTenantAccent()
applyTheme()
initZoom()

const app = mount(App, { target: document.getElementById('app')! })

export default app
