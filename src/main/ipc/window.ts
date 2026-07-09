import { BrowserWindow, ipcMain, shell } from 'electron'
import { isAppMenuLabel, popupAppSubmenu } from '../menu/appMenu'
import { hideMainWindowToTray, quitApplication } from '../window/trayManager'

function isExternalLink(url: string, currentUrl: string): boolean {
  try {
    const target = new URL(url)
    if (target.protocol !== 'http:' && target.protocol !== 'https:' && target.protocol !== 'mailto:') {
      return false
    }

    const current = new URL(currentUrl)
    if (target.origin === current.origin) {
      return false
    }

    return true
  } catch {
    return false
  }
}

function openExternalLink(url: string): void {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'mailto:') {
      void shell.openExternal(url)
    }
  } catch {
    // ignore invalid URLs
  }
}

function getSenderWindow(event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender)
}

let ipcRegistered = false

export function registerWindowIpc(): void {
  if (ipcRegistered) return
  ipcRegistered = true

  ipcMain.on('window:minimize', (event) => {
    getSenderWindow(event)?.minimize()
  })

  ipcMain.on('window:maximize', (event) => {
    const window = getSenderWindow(event)
    if (!window) return
    if (window.isMaximized()) {
      window.unmaximize()
    } else {
      window.maximize()
    }
  })

  ipcMain.on('window:close', (event) => {
    getSenderWindow(event)?.webContents.send('window:closeRequested')
  })

  ipcMain.on('window:requestClose', (event) => {
    getSenderWindow(event)?.webContents.send('window:closeRequested')
  })

  ipcMain.on('window:minimizeToTray', () => {
    hideMainWindowToTray()
  })

  ipcMain.on('window:quit', () => {
    quitApplication()
  })

  ipcMain.handle('window:isMaximized', (event) => {
    return getSenderWindow(event)?.isMaximized() ?? false
  })

  ipcMain.handle('window:popupMenu', (event, label: string, x: number, y: number) => {
    if (!isAppMenuLabel(label)) return
    const window = getSenderWindow(event)
    if (!window) return
    popupAppSubmenu(label, window, x, y)
  })
}

export function attachWindowStateListeners(window: BrowserWindow): void {
  const sendMaximized = (maximized: boolean): void => {
    window.webContents.send('window:maximized', maximized)
  }
  window.on('maximize', () => sendMaximized(true))
  window.on('unmaximize', () => sendMaximized(false))
}

export function attachExternalLinkHandlers(window: BrowserWindow): void {
  const webContents = window.webContents

  webContents.setWindowOpenHandler(({ url }) => {
    openExternalLink(url)
    return { action: 'deny' }
  })

  webContents.on('will-navigate', (event, url) => {
    if (isExternalLink(url, webContents.getURL())) {
      event.preventDefault()
      openExternalLink(url)
    }
  })
}
