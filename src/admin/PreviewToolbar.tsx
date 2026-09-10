'use client'

import React, { type RefObject } from 'react'
import { ViewportToggle, type Viewport } from './ViewportToggle.js'
import { WidthChip } from './WidthChip.js'
import {
  FullscreenExitIcon,
  FullscreenIcon,
  InteractIcon,
  InteractOffIcon,
  RedoIcon,
  SidebarHideIcon,
  SidebarShowIcon,
  UndoIcon,
} from './icons.js'
import type { useEditorHistory } from '../state/useEditorHistory.js'
import { useBetterEditorT } from '../i18n/useBetterEditorT.js'

import { useIsolatedDraft } from '../state/useIsolatedDraft.js'

export type PreviewToolbarProps = {
  history: ReturnType<typeof useEditorHistory>
  viewport: Viewport
  onViewportChange: (viewport: Viewport) => void
  iframeRef: RefObject<HTMLIFrameElement | null>
  isFullscreen: boolean
  onFullscreenToggle: () => void
  interactMode: boolean
  onInteractToggle: () => void
  sidebarCollapsed: boolean
  onSidebarToggle: () => void
}

// Memoized so resize-drag re-renders of the overlay skip the toolbar.
export const PreviewToolbar = React.memo<PreviewToolbarProps>(({
  history,
  viewport,
  onViewportChange,
  iframeRef,
  isFullscreen,
  onFullscreenToggle,
  interactMode,
  onInteractToggle,
  sidebarCollapsed,
  onSidebarToggle,
}) => {
  const t = useBetterEditorT()
  const draft = useIsolatedDraft()

  return (
    <div className="better-editor__preview-toolbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <HistoryButtons history={history} />
        <button
          type="button"
          onClick={() => void draft.save('draft')}
          disabled={draft.isSaving || !draft.isDirty}
          className={`better-editor__save-btn ${draft.isDirty ? 'better-editor__save-btn--dirty' : ''}`}
          title={draft.isDirty ? 'Entwurf speichern' : 'Keine ungespeicherten Änderungen'}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 10px',
            borderRadius: '4px',
            fontSize: '12px',
            fontWeight: 500,
            cursor: draft.isDirty ? 'pointer' : 'default',
            background: draft.isDirty ? '#10b981' : 'rgba(255, 255, 255, 0.1)',
            color: draft.isDirty ? '#ffffff' : 'rgba(255, 255, 255, 0.5)',
            border: 'none',
            transition: 'background 0.15s ease',
          }}
        >
          {draft.isSaving ? 'Speichere...' : draft.isDirty ? '● Entwurf speichern' : 'Gespeichert'}
        </button>
      </div>
      <div className="better-editor__preview-toolbar-right">
        <WidthChip iframeRef={iframeRef} />
        <ViewportToggle value={viewport} onChange={onViewportChange} />
        <div className="better-editor-viewport">
          <button
            type="button"
            className={
              isFullscreen
                ? 'better-editor-viewport__btn better-editor-viewport__btn--active'
                : 'better-editor-viewport__btn'
            }
            onClick={onFullscreenToggle}
            aria-pressed={isFullscreen}
            title={isFullscreen ? t.toolbar.exitFullscreen : t.toolbar.enterFullscreen}
            aria-label={isFullscreen ? t.toolbar.exitFullscreen : t.toolbar.enterFullscreen}
          >
            {isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
          </button>
          <button
            type="button"
            className={
              interactMode
                ? 'better-editor-viewport__btn better-editor-viewport__btn--active'
                : 'better-editor-viewport__btn'
            }
            onClick={onInteractToggle}
            aria-pressed={interactMode}
            title={interactMode ? t.toolbar.switchToEdit : t.toolbar.switchToInteract}
            aria-label={interactMode ? t.toolbar.switchToEdit : t.toolbar.switchToInteractShort}
          >
            {interactMode ? <InteractIcon /> : <InteractOffIcon />}
          </button>
          <button
            type="button"
            className="better-editor-viewport__btn"
            onClick={onSidebarToggle}
            aria-pressed={sidebarCollapsed}
            title={sidebarCollapsed ? t.toolbar.showSidebar : t.toolbar.hideSidebar}
            aria-label={sidebarCollapsed ? t.toolbar.showSidebar : t.toolbar.hideSidebar}
          >
            {sidebarCollapsed ? <SidebarShowIcon /> : <SidebarHideIcon />}
          </button>
        </div>
      </div>
    </div>
  )
})

const HistoryButtons: React.FC<{ history: ReturnType<typeof useEditorHistory> }> = ({
  history,
}) => {
  const t = useBetterEditorT()
  return (
    <div className="better-editor__history">
      <button
        type="button"
        className="better-editor__history-btn"
        onClick={history.undo}
        disabled={!history.canUndo}
        title={t.toolbar.undoTitle}
        aria-label={t.toolbar.undo}
      >
        <UndoIcon />
      </button>
      <button
        type="button"
        className="better-editor__history-btn"
        onClick={history.redo}
        disabled={!history.canRedo}
        title={t.toolbar.redoTitle}
        aria-label={t.toolbar.redo}
      >
        <RedoIcon />
      </button>
    </div>
  )
}
