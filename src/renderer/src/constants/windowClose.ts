import type { WindowCloseAction, WindowCloseBehavior } from '../env.d'

export const DEFAULT_WINDOW_CLOSE: WindowCloseBehavior = {
  skipPrompt: false,
  defaultAction: 'minimize-to-tray'
}

export type WindowCloseMode = 'ask' | WindowCloseAction

export const WINDOW_CLOSE_MODE_OPTIONS: Array<{
  value: WindowCloseMode
  label: string
  hint: string
}> = [
  {
    value: 'ask',
    label: '每次询问',
    hint: '点击关闭时弹出确认，可选择最小化到托盘或退出程序'
  },
  {
    value: 'minimize-to-tray',
    label: '直接最小化到托盘',
    hint: '点击关闭后隐藏到系统托盘，程序继续在后台运行'
  },
  {
    value: 'quit',
    label: '直接退出程序',
    hint: '点击关闭后立即退出应用'
  }
]

export function windowCloseModeFromBehavior(behavior?: WindowCloseBehavior): WindowCloseMode {
  const resolved = behavior ?? DEFAULT_WINDOW_CLOSE
  if (!resolved.skipPrompt) return 'ask'
  return resolved.defaultAction
}

export function windowCloseBehaviorFromMode(mode: WindowCloseMode): WindowCloseBehavior {
  if (mode === 'ask') {
    return { skipPrompt: false, defaultAction: 'minimize-to-tray' }
  }
  return { skipPrompt: true, defaultAction: mode }
}
