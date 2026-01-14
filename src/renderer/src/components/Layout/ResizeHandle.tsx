import { useCallback, useRef, type JSX } from 'react'

interface ResizeHandleProps {
  /** Called during drag with horizontal delta in pixels */
  onResize: (deltaX: number) => void
  /** Called when drag ends (for persistence) */
  onResizeEnd?: () => void
  /** Which edge the handle is on (default 'left') */
  position?: 'left' | 'right'
}

/**
 * ResizeHandle - A draggable handle for resizing panels.
 * Renders a thin vertical bar that can be dragged to resize adjacent panels.
 */
export function ResizeHandle({
  onResize,
  onResizeEnd,
  position = 'left'
}: ResizeHandleProps): JSX.Element {
  const isDragging = useRef(false)

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      isDragging.current = true
      document.body.classList.add('resizing')

      const handleMouseMove = (moveEvent: MouseEvent): void => {
        if (isDragging.current) {
          onResize(moveEvent.movementX)
        }
      }

      const handleMouseUp = (): void => {
        isDragging.current = false
        document.body.classList.remove('resizing')
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
        onResizeEnd?.()
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    },
    [onResize, onResizeEnd]
  )

  return (
    <div
      className={`absolute top-0 bottom-0 w-1 cursor-col-resize z-10
        bg-transparent hover:bg-blue-500/50 transition-colors
        ${position === 'left' ? 'left-0' : 'right-0'}`}
      onMouseDown={handleMouseDown}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize handle"
    />
  )
}
