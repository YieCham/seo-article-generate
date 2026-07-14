import { app, BrowserWindow, Menu, Tray, nativeImage } from 'electron'

let tray: Tray | null = null
let mainWindow: BrowserWindow | null = null
let isQuitting = false

export function setQuitting(value: boolean): void {
  isQuitting = value
}

export function getQuitting(): boolean {
  return isQuitting
}

export function initTrayManager(window: BrowserWindow, iconPath?: string): void {
  mainWindow = window

  if (!iconPath) return

  const image = nativeImage.createFromPath(iconPath)
  if (image.isEmpty()) return

  tray = new Tray(image.resize({ width: 16, height: 16 }))
  tray.setToolTip('AIWriting Assistant')

  const menu = Menu.buildFromTemplate([
    {
      label: '显示主窗口',
      click: () => showMainWindow()
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => quitApplication()
    }
  ])
  tray.setContextMenu(menu)
  tray.on('double-click', () => showMainWindow())
}

export function showMainWindow(): void {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

export function hideMainWindowToTray(): void {
  mainWindow?.hide()
}

export function quitApplication(): void {
  isQuitting = true
  app.quit()
}

export function attachCloseHandler(window: BrowserWindow): void {
  window.on('close', (event) => {
    if (isQuitting) return
    event.preventDefault()
    window.webContents.send('window:closeRequested')
  })
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}
