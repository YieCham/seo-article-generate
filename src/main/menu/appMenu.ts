import { Menu, app } from 'electron'

const MENU_LABELS = ['File', 'Edit', 'View', 'Help'] as const
export type AppMenuLabel = (typeof MENU_LABELS)[number]

function buildTemplate(): Electron.MenuItemConstructorOptions[] {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [{ role: 'quit', label: '退出' }]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'forceReload', label: '强制重新加载' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: '关于 AIWriting Assistant',
          click: () => {
            // noop — informational label only
          }
        },
        {
          label: `版本 ${app.getVersion()}`,
          enabled: false
        }
      ]
    }
  ]

  return template
}

let appMenu: Menu | null = null

export function getAppMenu(): Menu {
  if (!appMenu) {
    appMenu = Menu.buildFromTemplate(buildTemplate())
  }
  return appMenu
}

export function isAppMenuLabel(label: string): label is AppMenuLabel {
  return (MENU_LABELS as readonly string[]).includes(label)
}

export function popupAppSubmenu(
  label: AppMenuLabel,
  window: Electron.BrowserWindow,
  x: number,
  y: number
): void {
  const item = getAppMenu().items.find((entry) => entry.label === label)
  if (!item?.submenu) return
  item.submenu.popup({ window, x: Math.round(x), y: Math.round(y) })
}
