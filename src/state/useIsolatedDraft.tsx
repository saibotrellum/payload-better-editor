'use client'

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { useAllFormFields, useDocumentInfo, useForm, useLivePreviewContext, useLocale } from '@payloadcms/ui'
import { reduceFieldsToValues } from 'payload/shared'

/**
 * One row of a blocks field, as it travels between form state, the isolated
 * draft and the preview iframe.
 *
 * `unknown` rather than `any` for the values: the shape is whatever the host's
 * block config declares, so nothing here can name it, but every read still has
 * to narrow. `id` and `blockType` are the two keys this code does rely on -
 * `id` matches a row to its DOM node in the preview, `blockType` picks the
 * template when a new block has no markup yet. Both are optional because a
 * freshly added row has neither until it is written.
 */
export type DraftBlock = {
  id?: string
  blockType?: string
  [key: string]: unknown
}

export type IsolatedDraftContextValue = {
  blocks: DraftBlock[]
  isDirty: boolean
  isSaving: boolean
  moveBlock: (fromIndex: number, toIndex: number) => void
  duplicateBlock: (index: number) => void
  removeBlock: (index: number) => void
  addBlock: (index: number, blockType: string) => void
  save: (status?: 'draft' | 'published') => Promise<void>
  discard: () => void
}

const noop = (): void => {}
const asyncNoop = async (): Promise<void> => {}

const DEFAULT_VALUE: IsolatedDraftContextValue = {
  blocks: [],
  isDirty: false,
  isSaving: false,
  moveBlock: noop,
  duplicateBlock: noop,
  removeBlock: noop,
  addBlock: noop,
  save: asyncNoop,
  discard: noop,
}

const IsolatedDraftContext = createContext<IsolatedDraftContextValue>(DEFAULT_VALUE)

export const useIsolatedDraft = (): IsolatedDraftContextValue => useContext(IsolatedDraftContext)

const generateRowId = (): string =>
  Array.from({ length: 24 }, () => Math.floor(Math.random() * 16).toString(16)).join('')

export type IsolatedDraftProviderProps = {
  blocksField: string
  children: React.ReactNode
}

export const IsolatedDraftProvider: React.FC<IsolatedDraftProviderProps> = ({
  blocksField,
  children,
}) => {
  const [formState] = useAllFormFields()
  const docInfo = useDocumentInfo()
  const { id } = docInfo
  const { iframeRef, url } = useLivePreviewContext()
  const locale = useLocale()
  const { submit } = useForm()

  const collectionSlug = docInfo.collectionSlug
  const globalSlug = docInfo.globalSlug

  const [blocks, setBlocks] = useState<DraftBlock[]>([])
  const [isDirty, setIsDirty] = useState<boolean>(false)
  const [isSaving, setIsSaving] = useState<boolean>(false)
  const initializedRef = useRef<boolean>(false)
  const blocksRef = useRef<DraftBlock[]>([])
  blocksRef.current = blocks

  const postToIframe = useCallback(
    (targetBlocks: DraftBlock[]) => {
      const frame = iframeRef?.current
      if (!frame || !url) return

      const win = frame.contentWindow
      if (!win) return

      // A fresh iframe shows `about:blank` until `src` has navigated, and that
      // document inherits the ADMIN's origin. Posting with the preview origin as
      // the target then throws:
      //
      //   The target origin ('http://tenant.localhost:5300') does not match the
      //   recipient window's origin ('http://admin.localhost:5300')
      //
      // Same-origin setups never see it, because both origins are equal. It
      // shows up on a multi-domain admin, where the preview is served from the
      // tenant host. `usePreviewBinding` already guards the same `about:blank`
      // window; this is the posting half of it.
      //
      // Measured on a multi-domain admin, the iframe passes through two states
      // before it is ready, and BOTH would throw:
      //
      //   hasDoc=true   doc.URL='about:blank'   -> inherited admin origin
      //   hasDoc=false  contentWindow.origin throws
      //
      // The second one is not proof of having reached the target origin - an
      // about:blank that has begun navigating reports the same way. So neither
      // document nor window is a reliable witness here.
      //
      // `src` cannot tell them apart either - it already names the target in
      // both. What distinguishes them is whether the window's own origin
      // matches the target we are about to post to. Reading that origin throws
      // exactly when it does NOT match, so the two cases collapse into one
      // check with a single meaning: post only when we can read the window and
      // its origin equals the target.
      let ready = false
      try {
        const target = new URL(url, window.location.origin).origin
        ready = win.location.origin === target
      } catch {
        // Cross-origin read - the iframe has navigated to the tenant and the
        // admin cannot inspect it. That is the normal, healthy state on a
        // multi-domain admin, and posting is correct there.
        ready = true
      }
      if (!ready) return

      const values = formState ? reduceFieldsToValues(formState, true) : {}
      if (!values.id) values.id = id
      values[blocksField] = targetBlocks

      try {
        win.postMessage(
          {
            type: 'payload-live-preview',
            collectionSlug,
            data: values,
            globalSlug,
            locale: locale?.code,
          },
          url,
        )
      } catch {
        // The iframe can navigate between the check above and this call. A
        // dropped frame of preview data is not worth an uncaught error in the
        // admin console - the next form change posts again.
      }
    },
    [iframeRef, url, formState, id, blocksField, collectionSlug, globalSlug, locale],
  )

  // Initialize from formState on first load
  useEffect(() => {
    if (!initializedRef.current && formState) {
      const values = reduceFieldsToValues(formState, true)
      const currentBlocks = values[blocksField]
      if (Array.isArray(currentBlocks) && currentBlocks.length > 0) {
        setBlocks(currentBlocks)
        initializedRef.current = true
      }
    }
  }, [formState, blocksField])

  const lastPostedValuesRef = useRef<string>('')

  // Sync field changes from formState into current blocks without changing block order
  useEffect(() => {
    if (!initializedRef.current || !formState) return

    const values = reduceFieldsToValues(formState, true)
    const formBlocks = values[blocksField]

    // Map latest field values from formState by block id
    const formBlockMap = new Map<string, DraftBlock>()
    if (Array.isArray(formBlocks)) {
      for (const b of formBlocks) {
        if (b && b.id) formBlockMap.set(String(b.id), b)
      }
    }

    const currentBlocks = blocksRef.current
    let hasBlockFieldChange = false
    const updated = currentBlocks.map((existing) => {
      const live = formBlockMap.get(String(existing.id))
      if (live && JSON.stringify(live) !== JSON.stringify(existing)) {
        hasBlockFieldChange = true
        return { ...existing, ...live }
      }
      return existing
    })

    const valuesString = JSON.stringify(values)
    if (hasBlockFieldChange) {
      setBlocks(updated)
      lastPostedValuesRef.current = valuesString
      postToIframe(updated)
    } else if (valuesString !== lastPostedValuesRef.current) {
      lastPostedValuesRef.current = valuesString
      postToIframe(currentBlocks)
    }
  }, [formState, blocksField, postToIframe])

  const moveBlock = useCallback(
    (fromIndex: number, toIndex: number) => {
      const prev = blocksRef.current
      if (fromIndex < 0 || fromIndex >= prev.length || toIndex < 0 || toIndex >= prev.length) {
        return
      }
      const next = [...prev]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      setBlocks(next)
      setIsDirty(true)
      postToIframe(next)
    },
    [postToIframe],
  )

  const duplicateBlock = useCallback(
    (index: number) => {
      const prev = blocksRef.current
      if (index < 0 || index >= prev.length) return
      const target = prev[index]
      const duplicated: DraftBlock = {
        ...(JSON.parse(JSON.stringify(target)) as DraftBlock),
        id: generateRowId(),
      }
      // The copy carries the source row's Mongo `_id`. Left in place, the save
      // writes two rows claiming the same document id and the second one wins,
      // so the duplicate silently replaces its original.
      delete duplicated._id
      const next = [...prev]
      next.splice(index + 1, 0, duplicated)
      setBlocks(next)
      setIsDirty(true)
      postToIframe(next)
    },
    [postToIframe],
  )

  const removeBlock = useCallback(
    (index: number) => {
      const prev = blocksRef.current
      if (index < 0 || index >= prev.length) return
      const next = [...prev]
      next.splice(index, 1)
      setBlocks(next)
      setIsDirty(true)
      postToIframe(next)
    },
    [postToIframe],
  )

  const addBlock = useCallback(
    (index: number, blockType: string) => {
      const prev = blocksRef.current
      const newBlock = {
        id: generateRowId(),
        blockType,
      }
      const next = [...prev]
      const insertAt = index >= 0 && index <= prev.length ? index : prev.length
      next.splice(insertAt, 0, newBlock)
      setBlocks(next)
      setIsDirty(true)
      postToIframe(next)
    },
    [postToIframe],
  )

  const save = useCallback(
    async (status: 'draft' | 'published' = 'published') => {
      setIsSaving(true)
      try {
        if (submit) {
          await submit({
            overrides: {
              _status: status,
              [blocksField]: blocksRef.current,
            },
          })
          setIsDirty(false)
        }
      } catch (err) {
        console.error('[better-editor] Save failed:', err)
        throw err
      } finally {
        setIsSaving(false)
      }
    },
    [submit, blocksField],
  )

  const discard = useCallback(() => {
    if (formState) {
      const values = reduceFieldsToValues(formState, true)
      const currentBlocks = values[blocksField]
      if (Array.isArray(currentBlocks)) {
        setBlocks(currentBlocks)
        postToIframe(currentBlocks)
      }
    }
    setIsDirty(false)
  }, [formState, blocksField, postToIframe])

  const value: IsolatedDraftContextValue = {
    blocks,
    isDirty,
    isSaving,
    moveBlock,
    duplicateBlock,
    removeBlock,
    addBlock,
    save,
    discard,
  }

  return <IsolatedDraftContext.Provider value={value}>{children}</IsolatedDraftContext.Provider>
}
