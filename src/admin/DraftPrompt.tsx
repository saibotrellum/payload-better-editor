'use client'

import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { useConfig, useDocumentEvents, useDocumentInfo, useForm, useLocale, useTranslation } from '@payloadcms/ui'
import { useBetterEditorT } from '../i18n/useBetterEditorT.js'
import '../styles/draft-prompt.css'

const subscribeNever = () => () => {}

type Decision = { id: string | number | undefined; ask: boolean }

/**
 * Asks, once per document open, whether to keep working on a newer draft or go
 * back to the published version. Rendered for collections that set
 * `draftPrompt`, independent of the editor overlay.
 */
export const DraftPrompt: React.FC = () => {
  const t = useBetterEditorT().draftPrompt
  const {
    id,
    collectionSlug,
    hasPublishedDoc,
    unpublishedVersionCount,
    docPermissions,
    incrementVersionCount,
    setUnpublishedVersionCount,
    setMostRecentVersionIsAutosaved,
  } = useDocumentInfo()
  const {
    config: {
      routes: { api },
    },
  } = useConfig()
  const { reset: resetForm } = useForm()
  const { reportUpdate } = useDocumentEvents()
  const { code: locale } = useLocale()
  const { i18n } = useTranslation()

  // Decided once per document, when it opens. Autosave raises the draft count
  // while someone types; that must never pop the prompt up mid-edit.
  const decisionRef = useRef<Decision | null>(null)
  if (decisionRef.current === null || decisionRef.current.id !== id) {
    decisionRef.current = {
      id,
      ask:
        id !== undefined &&
        Boolean(collectionSlug) &&
        hasPublishedDoc === true &&
        unpublishedVersionCount > 0 &&
        Boolean(docPermissions?.update),
    }
  }
  const [dismissedId, setDismissedId] = useState<Decision['id']>(undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const continueRef = useRef<HTMLButtonElement>(null)

  // False while server-rendering and hydrating, so the portal never mismatches.
  const mounted = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  )
  const visible = mounted && decisionRef.current.ask && dismissedId !== id

  useEffect(() => {
    if (visible) continueRef.current?.focus()
  }, [visible])

  const dismiss = useCallback(() => {
    setError(null)
    setDismissedId(id)
  }, [id])

  const restore = useCallback(async () => {
    setBusy(true)
    setError(null)
    // Same two requests as Payload's "Revert to published": read the published
    // document, then save it back as the current one.
    const url = `${api}/${collectionSlug}/${id}?locale=${locale}&fallback-locale=null&depth=0`
    const headers = { 'Accept-Language': i18n.language, 'Content-Type': 'application/json' }
    try {
      const published = await fetch(url, { credentials: 'include', headers }).then((r) => r.json())
      const res = await fetch(url, {
        method: 'PATCH',
        credentials: 'include',
        headers,
        body: JSON.stringify(published),
      })
      const json = await res.json()
      if (res.status !== 200) {
        setError(json?.errors?.[0]?.message || json?.error || t.error)
        return
      }
      await resetForm(json.doc)
      incrementVersionCount()
      setMostRecentVersionIsAutosaved(false)
      setUnpublishedVersionCount(0)
      // Same event a save emits; the overlay forwards it so its preview reloads.
      reportUpdate({
        id,
        doc: json.doc,
        entitySlug: collectionSlug,
        operation: 'update',
        updatedAt: json.doc?.updatedAt ?? new Date().toISOString(),
      })
      setDismissedId(id)
    } catch {
      setError(t.error)
    } finally {
      setBusy(false)
    }
  }, [
    api,
    collectionSlug,
    id,
    locale,
    i18n.language,
    resetForm,
    reportUpdate,
    incrementVersionCount,
    setMostRecentVersionIsAutosaved,
    setUnpublishedVersionCount,
    t.error,
  ])

  if (!visible) return null

  return createPortal(
    <div
      className="better-editor-draft-prompt__backdrop"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !busy) dismiss()
      }}
    >
      <div
        className="better-editor-draft-prompt"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="better-editor-draft-prompt-title"
        aria-describedby="better-editor-draft-prompt-body"
      >
        <h2 id="better-editor-draft-prompt-title" className="better-editor-draft-prompt__title">
          {t.title}
        </h2>
        <p id="better-editor-draft-prompt-body" className="better-editor-draft-prompt__body">
          {t.body}
        </p>
        {error ? (
          <p role="alert" className="better-editor-draft-prompt__error">
            {error}
          </p>
        ) : null}
        <div className="better-editor-draft-prompt__actions">
          <button
            type="button"
            className="btn btn--style-secondary btn--size-medium"
            disabled={busy}
            onClick={() => void restore()}
          >
            {busy ? t.restoring : t.restore}
          </button>
          <button
            ref={continueRef}
            type="button"
            className="btn btn--style-primary btn--size-medium"
            disabled={busy}
            onClick={dismiss}
          >
            {t.continue}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
