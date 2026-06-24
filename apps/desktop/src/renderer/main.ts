import { mount } from 'svelte'
import App from './App.svelte'
import './app.css'
import { applyTheme } from '$lib/theme.svelte'

// Keep the <html> class in sync with the stored theme (the inline script in
// index.html already set it for first paint).
applyTheme()

const app = mount(App, { target: document.getElementById('app')! })

export default app
