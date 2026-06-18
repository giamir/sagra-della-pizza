/// <reference types="vite/client" />

import type { Api } from '../preload'
import type { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: Api
  }
}
