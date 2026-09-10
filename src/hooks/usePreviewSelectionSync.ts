'use client'

import { useEffect, useMemo, useRef, type RefObject } from 'react'
import type { DocumentEvent } from 'payload'
import { useAllFormFields, useDocumentEvents, useDocumentInfo } from '@payloadcms/ui'
import { HoverToolbarController } from '../preview/HoverToolbarController.js'
import { INTERACT_BODY_ATTR } from '../preview/hover-css.js'
import { getSameOriginDocument } from '../internal/iframe.js'
import { useEditorHistory } from '../state/useEditorHistory.js'
import { useIsolatedDraft } from '../state/useIsolatedDraft.js'
import { splitFieldPath } from '../internal/path.js'

export type UsePreviewSelectionSyncArgs = {
  iframeRef: RefObject<HTMLIFrameElement | null>
  controllerRef: RefObject<HoverToolbarController | null>
  selectedBlockPath: string | null
  interactMode: boolean
  previewURL: string | undefined
}

/**
 * Bridges three iframe-side concerns to admin state: live-preview document
 * events, the interact-mode body attribute, and selection sync between the
 * sidebar and the in-iframe hover toolbar.
 */
export const usePreviewSelectionSync = ({
  iframeRef,
  controllerRef,
  selectedBlockPath,
  interactMode,
  previewURL,
}: UsePreviewSelectionSyncArgs): void => {
  const { mostRecentUpdate } = useDocumentEvents()
  const { id } = useDocumentInfo()

  const previewOrigin = useMemo(() => {
    if (!previewURL) return null
    try {
      return new URL(previewURL, window.location.origin).origin
    } catch {
      return null
    }
  }, [previewURL])

  // The last update we actually forwarded. Payload re-publishes
  // `mostRecentUpdate` as a new object on renders that changed nothing, and
  // every forwarded event makes the preview iframe reload itself (the bridge in
  // the host app listens for `payload-document-event` and calls
  // `location.reload()`). A reload re-fetches the SAVED document, so a spurious
  // event throws away the unsaved edit the editor just made - the field keeps
  // its value while the preview snaps back to the old text.
  const lastUpdateRef = useRef<DocumentEvent | null>(null)

  useEffect(() => {
    if (!mostRecentUpdate || !previewOrigin) return
    if (id != null && mostRecentUpdate.id !== id) return

    // Same object: nothing happened.
    if (lastUpdateRef.current === mostRecentUpdate) return

    // New object, same content: a re-render, not a document event. Remember it
    // so the next identity check is cheap, and forward nothing.
    if (JSON.stringify(lastUpdateRef.current) === JSON.stringify(mostRecentUpdate)) {
      lastUpdateRef.current = mostRecentUpdate
      return
    }

    lastUpdateRef.current = mostRecentUpdate

    iframeRef.current?.contentWindow?.postMessage(
      { type: 'payload-document-event' },
      previewOrigin,
    )
  }, [iframeRef, mostRecentUpdate, id, previewOrigin])


  const [allFields] = useAllFormFields()
  const draft = useIsolatedDraft()
  const selectedBlockId = useMemo<string | null>(() => {
    if (!selectedBlockPath) return null
    const split = splitFieldPath(selectedBlockPath)
    if (split && draft.blocks && draft.blocks[split.index]) {
      const b = draft.blocks[split.index]
      const id = b.id || b._id
      if (typeof id === 'string' && id.length > 0) return id
    }
    const v = allFields[`${selectedBlockPath}.id`]?.value
    return typeof v === 'string' ? v : null
  }, [draft.blocks, allFields, selectedBlockPath])

  // Toggle the iframe body attribute that gates hover/active CSS + clicks.
  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return
    const doc = getSameOriginDocument(iframe)
    if (!doc) return
    if (interactMode) doc.body.setAttribute(INTERACT_BODY_ATTR, '')
    else doc.body.removeAttribute(INTERACT_BODY_ATTR)
  }, [iframeRef, interactMode])

  const { mutationToken } = useEditorHistory()
  const prevMutationTokenRef = useRef(mutationToken)

  useEffect(() => {
    const controller = controllerRef.current
    if (!controller) return
    if (!selectedBlockId || interactMode) {
      controller.deselect()
      return
    }
    const isMutation = mutationToken !== prevMutationTokenRef.current
    prevMutationTokenRef.current = mutationToken

    // Defer one frame so the iframe DOM has settled after a mutation.
    const view = iframeRef.current?.contentWindow
    const raf = view?.requestAnimationFrame(() =>
      controller.select(selectedBlockId, { scrollIntoView: isMutation }),
    )
    return () => {
      if (raf !== undefined) view?.cancelAnimationFrame(raf)
    }
  }, [iframeRef, controllerRef, selectedBlockId, mutationToken, interactMode, selectedBlockPath])
}
