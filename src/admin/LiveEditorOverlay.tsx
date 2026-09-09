'use client'

import React, { useCallback, useRef, useState } from 'react'
import { useLivePreviewContext } from '@payloadcms/ui'
import { PreviewFrame } from './PreviewFrame.js'
import { PreviewToolbar } from './PreviewToolbar.js'
import { Sidebar } from './sidebar/Sidebar.js'
import { useBetterEditorSettings } from '../state/useBetterEditorSettings.js'
import { useEditorHistory } from '../state/useEditorHistory.js'
import { useSidebarResize } from '../hooks/useSidebarResize.js'
import { useViewportState } from '../hooks/useViewportState.js'
import { useFullscreenOverlay } from '../hooks/useFullscreenOverlay.js'
import { useBlockActionMessages } from '../hooks/useBlockActionMessages.js'
import { useOverlayKeyboard } from '../hooks/useOverlayKeyboard.js'
import { useFocusTrap } from '../hooks/useFocusTrap.js'
import { OverlayProviders } from '../providers/OverlayProviders.js'
import { useBetterEditorT } from '../i18n/useBetterEditorT.js'
import '../styles/overlay.css'
import '../styles/preview.css'
import '../styles/sidebar.css'
import '../styles/blocks-tab.css'

export type LiveEditorOverlayProps = {
  onClose: () => void
  blocksField: string
  storageNamespace?: string
  adminPortalSelector?: string
}

const RESIZE_HANDLE_PX = 6

const classes = (...parts: Array<string | false | null | undefined>): string =>
  parts.filter(Boolean).join(' ')

export const LiveEditorOverlay: React.FC<LiveEditorOverlayProps> = ({
  onClose,
  blocksField,
  storageNamespace,
  adminPortalSelector,
}) => {
  // Selection state lives outside OverlayProviders so the error boundary's
  // onReset can clear it without remounting providers.
  const [selectedBlockPath, setSelectedBlockPath] = useState<string | null>(null)
  const clearSelection = useCallback(() => setSelectedBlockPath(null), [])

  return (
    <OverlayProviders
      onClose={onClose}
      onReset={clearSelection}
      storageNamespace={storageNamespace}
      adminPortalSelector={adminPortalSelector}
    >
      <LiveEditorOverlayInner
        blocksField={blocksField}
        selectedBlockPath={selectedBlockPath}
        setSelectedBlockPath={setSelectedBlockPath}
      />
    </OverlayProviders>
  )
}

type InnerProps = Omit<LiveEditorOverlayProps, 'onClose'> & {
  selectedBlockPath: string | null
  setSelectedBlockPath: React.Dispatch<React.SetStateAction<string | null>>
}

const LiveEditorOverlayInner: React.FC<InnerProps> = ({
  blocksField,
  selectedBlockPath,
  setSelectedBlockPath,
}) => {
  const t = useBetterEditorT()
  const settings = useBetterEditorSettings()
  const history = useEditorHistory()
  const { iframeRef: livePreviewIframeRef, previewURL } = useLivePreviewContext()

  const { sidebarWidth, isResizing, onResizeStart, onResizeKeyDown } = useSidebarResize(
    settings.sidebarPosition,
  )
  const {
    viewport,
    setViewport,
    setResponsiveWidth,
    viewportWidth,
  } = useViewportState(settings)
  /**
   * The preview iframe, shared with the toolbar's width chip (which measures it
   * directly) and with the selection sync.
   *
   * Payload's `LivePreviewProvider` owns a ref of its own and posts BOTH live-preview
   * messages through it: `payload-live-preview`, carrying the current form values on
   * every keystroke, and `payload-document-event` on save. Its `LivePreviewWindow`
   * renders a second iframe against that same ref.
   *
   * Taking a local `useRef` here left this overlay's iframe unknown to that provider,
   * so the whole data channel was delivered to Payload's own hidden iframe instead.
   * Measured in a real admin session: the message log of `#live-preview-iframe` held
   * two `payload-live-preview` entries after a single field edit, while
   * `.better-editor-frame` held none. Nothing errored - the preview simply never
   * heard about an unsaved edit, which reads as "live preview does not work".
   *
   * Using the context ref makes this overlay's iframe the one everything else can
   * find. `LivePreviewDataChannel` reads the same ref to post form values into it,
   * and taking the slot that renders that component is also what stops Payload from
   * mounting a second iframe against this ref - the two changes only work together.
   *
   * Falls back to a local ref when the overlay renders outside a LivePreviewProvider,
   * where the context returns its default and the ref is not shared with anyone.
   */
  const localIframeRef = useRef<HTMLIFrameElement | null>(null)
  const iframeRef = livePreviewIframeRef ?? localIframeRef

  const [isFullscreen, setIsFullscreen] = useState(false)
  const toggleFullscreen = useCallback(() => setIsFullscreen((v) => !v), [])
  const exitFullscreen = useCallback(() => setIsFullscreen(false), [])
  const overlayRef = useFullscreenOverlay(isFullscreen, exitFullscreen)
  useFocusTrap(overlayRef)

  const clearSelection = useCallback(
    () => setSelectedBlockPath(null),
    [setSelectedBlockPath],
  )

  const { addBelowRequestId } = useBlockActionMessages({
    selectedBlockPath,
    setSelectedBlockPath,
  })

  useOverlayKeyboard({ history })

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const toggleSidebar = useCallback(() => setSidebarCollapsed((v) => !v), [])

  const [interactMode, setInteractMode] = useState(false)
  const toggleInteractMode = useCallback(() => setInteractMode((v) => !v), [])

  const isLeft = settings.sidebarPosition === 'left'
  const showSidebar = !sidebarCollapsed
  const gridTemplateColumns = !showSidebar
    ? '1fr'
    : isLeft
      ? `${sidebarWidth}px ${RESIZE_HANDLE_PX}px 1fr`
      : `1fr ${RESIZE_HANDLE_PX}px ${sidebarWidth}px`

  return (
    <div
      ref={overlayRef}
      className={classes(
        'better-editor',
        isResizing && 'better-editor--resizing',
        isFullscreen && 'better-editor--fullscreen',
      )}
      role="dialog"
      aria-modal="true"
      aria-label={t.overlay.dialogLabel}
      tabIndex={-1}
    >
      <div className="better-editor__body" style={{ gridTemplateColumns }}>
        <div className="better-editor__preview" style={{ order: isLeft ? 2 : 0 }}>
          <PreviewToolbar
            history={history}
            viewport={viewport}
            onViewportChange={setViewport}
            iframeRef={iframeRef}
            isFullscreen={isFullscreen}
            onFullscreenToggle={toggleFullscreen}
            interactMode={interactMode}
            onInteractToggle={toggleInteractMode}
            sidebarCollapsed={sidebarCollapsed}
            onSidebarToggle={toggleSidebar}
          />
          <div className="better-editor__preview-stage">
            <PreviewFrame
              iframeRef={iframeRef}
              previewURL={previewURL}
              hoverColorTopLevel={settings.hoverColorTopLevel}
              hoverColorNested={settings.hoverColorNested}
              hoverOutlineWidth={settings.hoverOutlineWidth}
              showHoverToolbar={settings.showHoverToolbar}
              hoverToolbarPosition={settings.hoverToolbarPosition}
              selectedBlockPath={selectedBlockPath}
              interactMode={interactMode}
              viewport={viewport}
              viewportWidth={viewportWidth}
              resizable={viewport === 'responsive'}
              onResize={setResponsiveWidth}
            />
          </div>
        </div>
        {showSidebar ? (
          <>
            <div
              className="better-editor__resize-handle"
              style={{ order: 1 }}
              role="separator"
              aria-orientation="vertical"
              aria-label={t.overlay.resizeSidebar}
              aria-valuenow={sidebarWidth}
              tabIndex={0}
              onMouseDown={onResizeStart}
              onKeyDown={onResizeKeyDown}
            />
            <aside
              className="better-editor__sidebar"
              style={{ order: isLeft ? 0 : 2 }}
            >
              <Sidebar
                selectedBlockPath={selectedBlockPath}
                onClearSelection={clearSelection}
                onSelectPath={setSelectedBlockPath}
                forceFullWidthFields={settings.forceFullWidthFields}
                blocksField={blocksField}
                addBelowRequestId={addBelowRequestId}
              />
            </aside>
          </>
        ) : null}
      </div>
    </div>
  )
}

