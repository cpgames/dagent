/**
 * DiffDialog Component
 * Renders a commit diff using diff2html in a draggable, resizable window.
 * Uses an iframe for complete CSS isolation from Tailwind.
 */
import { useEffect, useState, useRef, useCallback, type JSX } from 'react'
import { createPortal } from 'react-dom'
import * as Diff2Html from 'diff2html'
import './DiffDialog.css'

export interface DiffDialogProps {
  commitHash: string
  worktreePath?: string
  onClose: () => void
}

interface CommitInfo {
  hash: string
  message: string
  author: string
  email: string
  date: string
}

interface Position {
  x: number
  y: number
}

interface Size {
  width: number
  height: number
}

// Dark theme CSS for the iframe
const iframeStyles = `
  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  body {
    background: #1a1a2e;
    color: #e0e0e0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    padding: 0;
    margin: 0;
    display: flex;
    height: 100vh;
    overflow: hidden;
  }

  /* File list - fixed sidebar on left */
  .d2h-file-list-wrapper {
    background: #252542;
    border-right: 1px solid #3a3a5c;
    width: 280px;
    min-width: 280px;
    height: 100vh;
    overflow-y: auto;
    flex-shrink: 0;
  }

  .d2h-file-list-header {
    background: #1e1e36;
    color: #e0e0e0;
    font-weight: 600;
    padding: 10px 14px;
    border-bottom: 1px solid #3a3a5c;
    position: sticky;
    top: 0;
    z-index: 1;
  }

  .d2h-file-list {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .d2h-file-list li {
    padding: 8px 14px;
    border-bottom: 1px solid #3a3a5c;
  }

  .d2h-file-list li:last-child {
    border-bottom: none;
  }

  .d2h-file-list a {
    color: #00f0ff;
    text-decoration: none;
    font-size: 12px;
    word-break: break-all;
  }

  .d2h-file-list a:hover {
    text-decoration: underline;
  }

  /* File status icons */
  .d2h-file-list-line {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .d2h-icon-wrapper {
    display: flex;
    align-items: center;
  }

  .d2h-icon {
    width: 14px;
    height: 14px;
  }

  /* Default icon color (modified/changed) */
  .d2h-icon,
  .d2h-icon path {
    fill: #ffcc00 !important;
    stroke: #ffcc00 !important;
  }

  /* Added files - green */
  .d2h-added .d2h-icon,
  .d2h-added .d2h-icon path,
  [class*="d2h-file-added"] .d2h-icon,
  [class*="d2h-file-added"] .d2h-icon path {
    fill: #00ff88 !important;
    stroke: #00ff88 !important;
  }

  /* Deleted files - red */
  .d2h-deleted .d2h-icon,
  .d2h-deleted .d2h-icon path,
  [class*="d2h-file-deleted"] .d2h-icon,
  [class*="d2h-file-deleted"] .d2h-icon path {
    fill: #ff6b6b !important;
    stroke: #ff6b6b !important;
  }

  /* Renamed files - cyan */
  .d2h-renamed .d2h-icon,
  .d2h-renamed .d2h-icon path,
  [class*="d2h-file-renamed"] .d2h-icon,
  [class*="d2h-file-renamed"] .d2h-icon path {
    fill: #00f0ff !important;
    stroke: #00f0ff !important;
  }

  /* Checkbox styling */
  .d2h-file-list input[type="checkbox"] {
    width: 16px;
    height: 16px;
    margin-right: 8px;
    cursor: pointer;
    accent-color: #00ff88;
  }

  /* Viewed file styling (when checkbox unchecked or clicked) */
  .d2h-file-list li.viewed {
    opacity: 0.5;
    background: rgba(0, 255, 136, 0.08) !important;
  }

  .d2h-file-list li.viewed a {
    color: #888 !important;
  }

  .d2h-file-list li {
    cursor: pointer;
    transition: opacity 0.2s, background 0.2s;
  }

  .d2h-file-list li:hover {
    background: rgba(0, 240, 255, 0.1);
  }

  /* Diff content wrapper - scrollable area on right */
  .d2h-wrapper {
    flex: 1;
    overflow-y: auto;
    min-width: 0;
  }

  /* File wrapper */
  .d2h-file-wrapper {
    border: 1px solid #3a3a5c;
    border-radius: 6px;
    margin: 12px;
    overflow: hidden;
  }

  .d2h-file-header {
    background: #252542;
    border-bottom: 1px solid #3a3a5c;
    padding: 10px 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .d2h-file-name {
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
    color: #00f0ff;
    font-size: 13px;
  }

  .d2h-lines-added {
    color: #00ff88;
    margin-left: 8px;
  }

  .d2h-lines-deleted {
    color: #ff6b6b;
    margin-left: 8px;
  }

  /* Diff table */
  .d2h-diff-table {
    width: 100%;
    border-collapse: collapse;
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
    font-size: 12px;
    line-height: 20px;
  }

  .d2h-diff-table tr {
    border: none;
  }

  .d2h-diff-table td {
    padding: 0;
    vertical-align: top;
  }

  /* Line numbers */
  .d2h-code-linenumber {
    width: 50px;
    min-width: 50px;
    text-align: right;
    padding: 0 10px;
    background: #252542;
    color: #666;
    border-right: 1px solid #3a3a5c;
    user-select: none;
  }

  /* Code content */
  .d2h-code-line {
    background: #1a1a2e;
    padding: 0;
  }

  .d2h-code-line-ctn {
    padding: 0 10px;
    white-space: pre;
    color: #e0e0e0;
  }

  /* Additions */
  .d2h-ins {
    background: rgba(0, 255, 136, 0.12);
  }

  .d2h-ins .d2h-code-linenumber {
    background: rgba(0, 255, 136, 0.18);
    color: #00ff88;
  }

  ins {
    background: rgba(0, 255, 136, 0.3);
    text-decoration: none;
  }

  /* Deletions */
  .d2h-del {
    background: rgba(255, 107, 107, 0.12);
  }

  .d2h-del .d2h-code-linenumber {
    background: rgba(255, 107, 107, 0.18);
    color: #ff6b6b;
  }

  del {
    background: rgba(255, 107, 107, 0.3);
    text-decoration: none;
  }

  /* Info lines */
  .d2h-info {
    background: #252542;
    color: #888;
    padding: 4px 10px;
  }

  /* Empty placeholder */
  .d2h-code-side-emptyplaceholder,
  .d2h-emptyplaceholder {
    background: #252542;
  }

  /* Side-by-side layout */
  .d2h-files-diff {
    display: flex;
    width: 100%;
  }

  .d2h-file-side-diff {
    flex: 1;
    min-width: 0;
    overflow-x: auto;
  }

  .d2h-code-side-linenumber {
    width: 45px;
    min-width: 45px;
    text-align: right;
    padding: 0 8px;
    background: #252542;
    color: #666;
    border-right: 1px solid #3a3a5c;
    user-select: none;
  }

  .d2h-code-side-line {
    background: #1a1a2e;
    padding: 0;
  }

  /* Side-by-side additions - multiple selector patterns for diff2html */
  tr.d2h-ins td,
  .d2h-ins .d2h-code-side-line,
  .d2h-ins.d2h-code-side-line,
  td.d2h-ins {
    background: rgba(0, 255, 136, 0.12) !important;
  }

  tr.d2h-ins .d2h-code-side-linenumber,
  .d2h-ins .d2h-code-side-linenumber,
  td.d2h-ins.d2h-code-side-linenumber {
    background: rgba(0, 255, 136, 0.18) !important;
    color: #00ff88 !important;
  }

  /* Side-by-side deletions - multiple selector patterns for diff2html */
  tr.d2h-del td,
  .d2h-del .d2h-code-side-line,
  .d2h-del.d2h-code-side-line,
  td.d2h-del {
    background: rgba(255, 107, 107, 0.12) !important;
  }

  tr.d2h-del .d2h-code-side-linenumber,
  .d2h-del .d2h-code-side-linenumber,
  td.d2h-del.d2h-code-side-linenumber {
    background: rgba(255, 107, 107, 0.18) !important;
    color: #ff6b6b !important;
  }

  /* Highlight changed text within lines */
  .d2h-code-line-ctn ins,
  .d2h-code-side-line ins {
    background: rgba(0, 255, 136, 0.35) !important;
    text-decoration: none;
  }

  .d2h-code-line-ctn del,
  .d2h-code-side-line del {
    background: rgba(255, 107, 107, 0.35) !important;
    text-decoration: none;
  }

  /* Scrollbar */
  ::-webkit-scrollbar {
    width: 10px;
    height: 10px;
  }

  ::-webkit-scrollbar-track {
    background: #1a1a2e;
  }

  ::-webkit-scrollbar-thumb {
    background: #3a3a5c;
    border-radius: 5px;
  }

  ::-webkit-scrollbar-thumb:hover {
    background: #4a4a6c;
  }
`

const MIN_WIDTH = 400
const MIN_HEIGHT = 300
const DEFAULT_WIDTH = 1200
const DEFAULT_HEIGHT = 700

export function DiffDialog({ commitHash, worktreePath, onClose }: DiffDialogProps): JSX.Element {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [diffHtml, setDiffHtml] = useState<string>('')
  const [commit, setCommit] = useState<CommitInfo | null>(null)
  const [isInteracting, setIsInteracting] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  // Position and size state
  const [position, setPosition] = useState<Position>(() => ({
    x: Math.max(50, (window.innerWidth - DEFAULT_WIDTH) / 2),
    y: Math.max(50, (window.innerHeight - DEFAULT_HEIGHT) / 2)
  }))
  const [size, setSize] = useState<Size>({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT })

  // Keep refs in sync with state for use in event handlers
  const positionRef = useRef(position)
  const sizeRef = useRef(size)
  useEffect(() => {
    positionRef.current = position
    sizeRef.current = size
  }, [position, size])

  // Drag state
  const isDraggingRef = useRef(false)
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; posX: number; posY: number }>({
    mouseX: 0,
    mouseY: 0,
    posX: 0,
    posY: 0
  })

  // Resize state
  const isResizingRef = useRef(false)
  const resizeDirectionRef = useRef<string>('')
  const resizeStartRef = useRef<{
    mouseX: number
    mouseY: number
    width: number
    height: number
    posX: number
    posY: number
  }>({ mouseX: 0, mouseY: 0, width: 0, height: 0, posX: 0, posY: 0 })

  useEffect(() => {
    async function loadDiff(): Promise<void> {
      try {
        setLoading(true)
        setError(null)

        const result = await window.electronAPI.git.getCommitDiff(commitHash, worktreePath)

        if (!result.success || !result.diff) {
          setError(result.error || 'Failed to load diff')
          return
        }

        // Convert diff to HTML using diff2html
        const html = Diff2Html.html(result.diff, {
          drawFileList: true,
          matching: 'lines',
          outputFormat: 'side-by-side',
          renderNothingWhenEmpty: false
        })

        setDiffHtml(html)
        setCommit(result.commit || null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load diff')
      } finally {
        setLoading(false)
      }
    }

    loadDiff()
  }, [commitHash, worktreePath])

  // Script to inject into iframe for viewed checkbox functionality
  // diff2html generates checkboxes but needs JS to make them work
  const viewedTrackingScript = `
    (function() {
      function setupTracking() {
        // Find all checkboxes in the file list (diff2html generates these)
        var checkboxes = document.querySelectorAll('.d2h-file-list input[type="checkbox"]');
        var fileWrappers = document.querySelectorAll('.d2h-file-wrapper');

        console.log('DiffDialog iframe: Found', checkboxes.length, 'checkboxes');
        console.log('DiffDialog iframe: Found', fileWrappers.length, 'file wrappers');

        // Handle checkbox clicks to toggle file content visibility
        for (var i = 0; i < checkboxes.length; i++) {
          (function(checkbox, index) {
            checkbox.addEventListener('change', function() {
              console.log('DiffDialog iframe: Checkbox', index, 'changed to', checkbox.checked);
              // Find the corresponding file wrapper and toggle its visibility
              if (index < fileWrappers.length) {
                var wrapper = fileWrappers[index];
                if (checkbox.checked) {
                  wrapper.style.display = '';
                  // Also update the list item style
                  var li = checkbox.closest('li');
                  if (li) li.classList.remove('viewed');
                } else {
                  wrapper.style.display = 'none';
                  // Mark as viewed in the list
                  var li = checkbox.closest('li');
                  if (li) li.classList.add('viewed');
                }
              }
            });
          })(checkboxes[i], i);
        }

        // Also handle clicks on file list items to navigate and mark as viewed
        var fileListItems = document.querySelectorAll('.d2h-file-list li');
        for (var j = 0; j < fileListItems.length; j++) {
          (function(item, index) {
            item.addEventListener('click', function(e) {
              // Don't mark viewed if clicking the checkbox itself
              if (e.target.type === 'checkbox') return;
              console.log('DiffDialog iframe: Click on file item', index);
              item.classList.add('viewed');
            });
          })(fileListItems[j], j);
        }

        // Track scroll to mark visible files as viewed
        var wrapper = document.querySelector('.d2h-wrapper');
        if (wrapper && fileWrappers.length > 0 && fileListItems.length > 0) {
          wrapper.addEventListener('scroll', function() {
            var wrapperRect = wrapper.getBoundingClientRect();
            for (var k = 0; k < fileWrappers.length; k++) {
              var rect = fileWrappers[k].getBoundingClientRect();
              if (rect.top < wrapperRect.bottom && rect.bottom > wrapperRect.top) {
                if (k < fileListItems.length && !fileListItems[k].classList.contains('viewed')) {
                  fileListItems[k].classList.add('viewed');
                }
              }
            }
          });
        }
      }

      // Run when DOM is ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupTracking);
      } else {
        setupTracking();
      }
    })();
  `

  // Write content to iframe when diff is loaded
  useEffect(() => {
    if (!loading && !error && diffHtml && iframeRef.current) {
      const iframe = iframeRef.current
      const doc = iframe.contentDocument || iframe.contentWindow?.document
      if (doc) {
        doc.open()
        doc.write(`
          <!DOCTYPE html>
          <html>
          <head>
            <style>${iframeStyles}</style>
          </head>
          <body>
            ${diffHtml}
            <script>${viewedTrackingScript}<\/script>
          </body>
          </html>
        `)
        doc.close()
      }
    }
  }, [loading, error, diffHtml])

  // Handle escape key to close
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Drag handlers
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.diff-dialog__close-btn')) return
    e.preventDefault()
    isDraggingRef.current = true
    setIsInteracting(true)
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      posX: positionRef.current.x,
      posY: positionRef.current.y
    }
    document.body.style.cursor = 'move'
    document.body.style.userSelect = 'none'
  }, [])

  // Resize handlers
  const handleResizeStart = useCallback(
    (direction: string) => (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      isResizingRef.current = true
      setIsInteracting(true)
      resizeDirectionRef.current = direction
      resizeStartRef.current = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        width: sizeRef.current.width,
        height: sizeRef.current.height,
        posX: positionRef.current.x,
        posY: positionRef.current.y
      }
      document.body.style.userSelect = 'none'
    },
    []
  )

  // Global mouse move/up handlers
  useEffect(() => {
    function handleMouseMove(e: MouseEvent): void {
      if (isDraggingRef.current) {
        const deltaX = e.clientX - dragStartRef.current.mouseX
        const deltaY = e.clientY - dragStartRef.current.mouseY
        setPosition({
          x: Math.max(0, Math.min(window.innerWidth - 100, dragStartRef.current.posX + deltaX)),
          y: Math.max(0, Math.min(window.innerHeight - 50, dragStartRef.current.posY + deltaY))
        })
      }

      if (isResizingRef.current) {
        const deltaX = e.clientX - resizeStartRef.current.mouseX
        const deltaY = e.clientY - resizeStartRef.current.mouseY
        const dir = resizeDirectionRef.current

        let newWidth = resizeStartRef.current.width
        let newHeight = resizeStartRef.current.height
        let newX = resizeStartRef.current.posX
        let newY = resizeStartRef.current.posY

        if (dir.includes('e')) {
          newWidth = Math.max(MIN_WIDTH, resizeStartRef.current.width + deltaX)
        }
        if (dir.includes('w')) {
          const proposedWidth = resizeStartRef.current.width - deltaX
          if (proposedWidth >= MIN_WIDTH) {
            newWidth = proposedWidth
            newX = resizeStartRef.current.posX + deltaX
          }
        }
        if (dir.includes('s')) {
          newHeight = Math.max(MIN_HEIGHT, resizeStartRef.current.height + deltaY)
        }
        if (dir.includes('n')) {
          const proposedHeight = resizeStartRef.current.height - deltaY
          if (proposedHeight >= MIN_HEIGHT) {
            newHeight = proposedHeight
            newY = resizeStartRef.current.posY + deltaY
          }
        }

        setSize({ width: newWidth, height: newHeight })
        setPosition({ x: newX, y: newY })
      }
    }

    function handleMouseUp(): void {
      isDraggingRef.current = false
      isResizingRef.current = false
      setIsInteracting(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  // Use portal to render at document body level
  return createPortal(
    <div
      ref={dialogRef}
      className="diff-dialog"
      style={{
        left: position.x,
        top: position.y,
        width: size.width,
        height: size.height
      }}
    >
      {/* Resize handles */}
      <div className="diff-dialog__resize diff-dialog__resize--n" onMouseDown={handleResizeStart('n')} />
      <div className="diff-dialog__resize diff-dialog__resize--s" onMouseDown={handleResizeStart('s')} />
      <div className="diff-dialog__resize diff-dialog__resize--e" onMouseDown={handleResizeStart('e')} />
      <div className="diff-dialog__resize diff-dialog__resize--w" onMouseDown={handleResizeStart('w')} />
      <div className="diff-dialog__resize diff-dialog__resize--ne" onMouseDown={handleResizeStart('ne')} />
      <div className="diff-dialog__resize diff-dialog__resize--nw" onMouseDown={handleResizeStart('nw')} />
      <div className="diff-dialog__resize diff-dialog__resize--se" onMouseDown={handleResizeStart('se')} />
      <div className="diff-dialog__resize diff-dialog__resize--sw" onMouseDown={handleResizeStart('sw')} />

      {/* Header - draggable */}
      <div className="diff-dialog__header" onMouseDown={handleDragStart}>
        <div className="diff-dialog__title-section">
          <h2 className="diff-dialog__title">
            {commit ? `${commit.message} (${commit.hash.slice(0, 7)})` : 'Commit Diff'}
          </h2>
          {commit && (
            <div className="diff-dialog__commit-info">
              <span className="diff-dialog__meta">
                {commit.author} • {new Date(commit.date).toLocaleDateString()}
              </span>
            </div>
          )}
        </div>
        <button
          type="button"
          className="diff-dialog__close-btn"
          onClick={onClose}
          title="Close (Esc)"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="diff-dialog__content">
        {loading && (
          <div className="diff-dialog__loading">
            <div className="diff-dialog__spinner" />
            <span>Loading diff...</span>
          </div>
        )}

        {error && (
          <div className="diff-dialog__error">
            <span className="diff-dialog__error-icon">⚠</span>
            <span>{error}</span>
          </div>
        )}

        {!loading && !error && (
          <iframe
            ref={iframeRef}
            className="diff-dialog__iframe"
            title="Commit Diff"
            sandbox="allow-same-origin allow-scripts"
            style={isInteracting ? { pointerEvents: 'none' } : undefined}
          />
        )}
      </div>
    </div>,
    document.body
  )
}
