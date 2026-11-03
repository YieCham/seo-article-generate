import { existsSync } from 'fs'
import { app, BrowserWindow, Menu } from 'electron'
import { join } from 'path'
import { bootstrapArticleAgent } from './embed'
import {
  attachWindowStateListeners,
  attachExternalLinkHandlers
} from './ipc/window'
import {
  attachCloseHandler,
  destroyTray,
  initTrayManager,
  setQuitting
} from './window/trayManager'

const isDev = !app.isPackaged
let mainWindow: BrowserWindow | null = null

function resolveAppIcon(): string | undefined {
  const candidates = [
    join(process.resourcesPath, 'icon.png'),
    join(__dirname, '../../icons/icon.png')
  ]

  return candidates.find((candidate) => existsSync(candidate))
}

function createWindow(): void {
  const icon = resolveAppIcon()

  mainWindow = new BrowserWindow({
    width: 1100,
    height: 780,
    minWidth: 900,
    minHeight: 640,
    show: false,
    frame: false,
    backgroundColor: '#f3f3f4',
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // A failed or slow renderer (dead dev server, broken build) would otherwise
  // leave the window hidden forever and look like the app never started.
  const revealWindow = (): void => {
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isVisible()) return
    mainWindow.show()
  }
  const revealTimer = setTimeout(revealWindow, 8000)
  mainWindow.once('closed', () => clearTimeout(revealTimer))
  mainWindow.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame) return
      console.error(
        `[ai-article-agent] renderer failed to load: ${errorCode} ${errorDescription} ${validatedURL}`
      )
      revealWindow()
    }
  )

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  attachWindowStateListeners(mainWindow)
  attachExternalLinkHandlers(mainWindow)
  attachCloseHandler(mainWindow)
  initTrayManager(mainWindow, icon)
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null)
  await bootstrapArticleAgent()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
    else mainWindow?.show()
  })
})

app.on('before-quit', () => {
  setQuitting(true)
  destroyTray()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
