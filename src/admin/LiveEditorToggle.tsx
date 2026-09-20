'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDocumentInfo, usePreferences } from '@payloadcms/ui'
import { LiveEditorOverlay } from './LiveEditorOverlay.js'
import { useMainWrapperPortal } from '../hooks/useMainWrapperPortal.js'
import { useStablePreviewURL } from '../hooks/useStablePreviewURL.js'
import { buildStorageKeys } from '../internal/storage-keys.js'
import { resolveInitialOpen } from './resolveInitialOpen.js'
import { LayoutIcon } from './icons.js'
import { useBetterEditorT } from '../i18n/useBetterEditorT.js'
import {
  BlockSelectionProvider,
  useBlockSelection,
} from '../providers/BlockSelectionProvider.js'
import { BlockRollbackGuard } from './blocks/BlockRollbackGuard.js'
import '../styles/toggle.css'

type Pref = { open?: boolean }

export type LiveEditorToggleProps = {
  blocksField: string
  adminPortalSelector?: string
  storageNamespace?: string
  hideToggleLabel?: boolean
  /** Open the overlay on arrival at every document. See `defaultOpen` in types.ts. */
  defaultOpen?: boolean
}

/**
 * Wraps the toggle in the selection provider so a consumer's own navigation UI
 * - rendered anywhere in the edit view, not only inside the overlay - can read
 * and drive the selection. The provider stays mounted even when the button
 * itself is hidden for want of a preview URL.
 */
export const LiveEditorToggle: React.FC<LiveEditorToggleProps> = (props) => (
  // Defers to an app-level provider when one is registered, so a consumer's
  // own navigation UI shares this selection; otherwise it owns the state
  // itself and the overlay behaves exactly as it did before.
  <BlockSelectionProvider>
    <BlockRollbackGuard blocksField={props.blocksField} />
    <LiveEditorToggleInner {...props} />
  </BlockSelectionProvider>
)

const LiveEditorToggleInner: React.FC<LiveEditorToggleProps> = ({
  blocksField,
  adminPortalSelector,
  storageNamespace,
  hideToggleLabel,
  defaultOpen,
}) => {
  const { selectedBlockPath, setSelectedBlockPath } = useBlockSelection()
  // Starts from the configured default rather than a hardcoded `false`, so the
  // first paint of a `defaultOpen` install already shows the overlay instead of
  // flashing the closed state until the preference read resolves.
  const [open, setOpen] = useState(() => resolveInitialOpen(undefined, defaultOpen))
  const { collectionSlug, globalSlug } = useDocumentInfo()
  const previewURL = useStablePreviewURL()
  const { getPreference, setPreference } = usePreferences()
  const storageKeys = useMemo(() => buildStorageKeys(storageNamespace), [storageNamespace])
  const prefKey = storageKeys.togglePreference(collectionSlug, globalSlug)

  // Tracks the prefKey we've successfully hydrated against so persistence
  // can't fire with the initial `false` before the read resolves, and so
  // switching documents reseeds without clobbering the new doc's pref.
  const hydratedKeyRef = useRef<string | null>(null)
  const prevPrefKeyRef = useRef(prefKey)
  if (prevPrefKeyRef.current !== prefKey) {
    prevPrefKeyRef.current = prefKey
    hydratedKeyRef.current = null
  }

  useEffect(() => {
    if (hydratedKeyRef.current === prefKey) return
    let cancelled = false
    void getPreference<Pref>(prefKey).then((pref) => {
      if (cancelled) return
      hydratedKeyRef.current = prefKey
      // `resolveInitialOpen` ignores the stored value when `defaultOpen` is
      // set: the overlay is a per-document state there, so a close on one
      // document must not follow the editor to the next.
      setOpen(resolveInitialOpen(pref, defaultOpen))
    })
    return () => {
      cancelled = true
    }
  }, [prefKey, getPreference, defaultOpen])

  useEffect(() => {
    if (hydratedKeyRef.current !== prefKey) return
    void setPreference<Pref>(prefKey, { open }, true)
  }, [open, prefKey, setPreference])

  const handleToggle = useCallback(() => setOpen((v) => !v), [])
  const handleClose = useCallback(() => setOpen(false), [])

  const mountNode = useMainWrapperPortal(open, adminPortalSelector)
  const t = useBetterEditorT()
  const label = open ? t.toggle.close : t.toggle.open

  // Hide the toggle only while NO preview URL has ever resolved - a collection
  // without `admin.preview`, or a document still missing the data the callback
  // needs. `useStablePreviewURL` absorbs the mid-session blanks that Payload
  // pushes after every save; gating on the raw context value here would
  // unmount the overlay subtree, iframe included, on each one.
  //
  // The second half of the guard is the load-bearing part: once the editor is
  // open, nothing tears the iframe down.
  if (!previewURL && !open) return null

  return (
    <>
      <button
        aria-label={label}
        aria-pressed={open}
        className="preview-btn better-editor-toggle"
        onClick={handleToggle}
        title={label}
        type="button"
      >
        {hideToggleLabel ? null : (
          <span className="better-editor-toggle__label">{label}</span>
        )}
        <LayoutIcon />
      </button>

      {open && mountNode
        ? createPortal(
            <LiveEditorOverlay
              onClose={handleClose}
              blocksField={blocksField}
              storageNamespace={storageNamespace}
              adminPortalSelector={adminPortalSelector}
              selectedBlockPath={selectedBlockPath}
              setSelectedBlockPath={setSelectedBlockPath}
            />,
            mountNode,
          )
        : null}
    </>
  )
}
