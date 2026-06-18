import { useCallback, useEffect, useRef } from 'react'
import { IconDelete } from '../../components/Icons'
import type { ChatMessage } from './types'
import { canDeleteChatMessage } from './types'

interface MessageContextMenuState {
  messageId: string
  x: number
  y: number
}

interface MessageContextMenuProps {
  message: ChatMessage | null
  position: MessageContextMenuState | null
  deleteDisabled?: boolean
  onClose: () => void
  onDelete: (messageId: string) => void
}

export default function MessageContextMenu({
  message,
  position,
  deleteDisabled = false,
  onClose,
  onDelete
}: MessageContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  const handleDelete = useCallback(() => {
    if (!message || deleteDisabled) return
    onDelete(message.id)
    onClose()
  }, [deleteDisabled, message, onClose, onDelete])

  useEffect(() => {
    if (!position) return

    function handlePointerDown(event: MouseEvent): void {
      if (menuRef.current?.contains(event.target as Node)) return
      onClose()
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') onClose()
    }

    function handleScroll(): void {
      onClose()
    }

    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('scroll', handleScroll, true)

    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [onClose, position])

  if (!position || !message) return null

  const canDelete = canDeleteChatMessage(message, deleteDisabled)

  return (
    <div
      ref={menuRef}
      className="session-context-menu message-context-menu"
      style={{ left: position.x, top: position.y }}
      role="menu"
    >
      <button
        type="button"
        className="session-context-menu-item danger"
        disabled={!canDelete}
        onClick={handleDelete}
      >
        <IconDelete size={14} className="session-context-menu-icon" />
        <span>删除此条消息</span>
      </button>
    </div>
  )
}
