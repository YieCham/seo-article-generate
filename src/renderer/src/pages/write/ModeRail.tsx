import type { CSSProperties } from 'react'
import { WRITE_MODE_OPTIONS, type WriteMode } from '../../constants/writeMode'
import {
  IconModeBatch,
  IconModeCreate,
  IconModeDraw,
  IconModeOptimize,
  IconSettings
} from '../../components/Icons'

export type ModeRailView = 'write' | 'draw'

interface ModeRailProps {
  view: ModeRailView
  writeMode: WriteMode
  onSelectMode: (mode: WriteMode) => void
  onOpenDraw: () => void
  onOpenSettings: () => void
}

function ModeIcon({ mode, size = 18 }: { mode: WriteMode; size?: number }) {
  if (mode === 'optimize') return <IconModeOptimize size={size} />
  if (mode === 'batch-optimize') return <IconModeBatch size={size} />
  return <IconModeCreate size={size} />
}

export default function ModeRail({
  view,
  writeMode,
  onSelectMode,
  onOpenDraw,
  onOpenSettings
}: ModeRailProps) {
  const writeModeIndex = WRITE_MODE_OPTIONS.findIndex((item) => item.value === writeMode)
  const activeIndex = view === 'draw' ? WRITE_MODE_OPTIONS.length : Math.max(0, writeModeIndex)
  const modesStyle = {
    '--mode-rail-index': activeIndex
  } as CSSProperties

  return (
    <nav className="mode-rail" aria-label="功能导航">
      <div className="mode-rail-modes" style={modesStyle}>
        <div className="mode-rail-indicator" aria-hidden="true" />
        {WRITE_MODE_OPTIONS.map((item) => {
          const active = view === 'write' && writeMode === item.value
          return (
            <button
              key={item.value}
              type="button"
              className={`mode-rail-item${active ? ' is-active' : ''}`}
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
              title={item.label}
              onClick={() => onSelectMode(item.value)}
            >
              <ModeIcon mode={item.value} />
            </button>
          )
        })}

        <button
          type="button"
          className={`mode-rail-item${view === 'draw' ? ' is-active' : ''}`}
          aria-label="绘图"
          aria-current={view === 'draw' ? 'page' : undefined}
          title="绘图"
          onClick={onOpenDraw}
        >
          <IconModeDraw size={18} />
        </button>
      </div>

      <button
        type="button"
        className="mode-rail-item mode-rail-settings"
        aria-label="设置"
        title="设置"
        onClick={onOpenSettings}
      >
        <IconSettings size={18} />
      </button>
    </nav>
  )
}
