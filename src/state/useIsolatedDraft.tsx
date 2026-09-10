'use client'

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { useAllFormFields, useDocumentInfo, useForm, useLivePreviewContext, useLocale } from '@payloadcms/ui'
import { reduceFieldsToValues } from 'payload/shared'

export type IsolatedDraftContextValue = {
  blocks: Array<Record<string, any>>
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

  const [blocks, setBlocks] = useState<Array<Record<string, any>>>([])
  const [isDirty, setIsDirty] = useState<boolean>(false)
  const [isSaving, setIsSaving] = useState<boolean>(false)
  const initializedRef = useRef<boolean>(false)
  const blocksRef = useRef<Array<Record<string, any>>>([])
  blocksRef.current = blocks

  const postToIframe = useCallback(
    (targetBlocks: Array<Record<string, any>>) => {
      const frame = iframeRef?.current
      if (!frame || !url) return

      const values = formState ? reduceFieldsToValues(formState, true) : {}
      if (!values.id) values.id = id
      values[blocksField] = targetBlocks

      frame.contentWindow?.postMessage(
        {
          type: 'payload-live-preview',
          collectionSlug,
          data: values,
          globalSlug,
          locale: locale?.code,
        },
        url,
      )
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

  // Sync field changes from formState into current blocks without changing block order
  useEffect(() => {
    if (!initializedRef.current || !formState) return

    const values = reduceFieldsToValues(formState, true)
    const formBlocks = values[blocksField]
    if (!Array.isArray(formBlocks)) return

    // Map latest field values from formState by block id
    const formBlockMap = new Map<string, Record<string, any>>()
    for (const b of formBlocks) {
      if (b && b.id) formBlockMap.set(String(b.id), b)
    }

    const currentBlocks = blocksRef.current
    let hasFieldChange = false
    const updated = currentBlocks.map((existing) => {
      const live = formBlockMap.get(String(existing.id))
      if (live && JSON.stringify(live) !== JSON.stringify(existing)) {
        hasFieldChange = true
        return { ...existing, ...live }
      }
      return existing
    })

    if (hasFieldChange) {
      setBlocks(updated)
      postToIframe(updated)
    }
  }, [formState, blocksField, postToIframe])

  const moveBlock = useCallback(
    (fromIndex: number, toIndex: number) => {
      setBlocks((prev) => {
        if (fromIndex < 0 || fromIndex >= prev.length || toIndex < 0 || toIndex >= prev.length) {
          return prev
        }
        const next = [...prev]
        const [moved] = next.splice(fromIndex, 1)
        next.splice(toIndex, 0, moved)
        setIsDirty(true)
        postToIframe(next)
        return next
      })
    },
    [postToIframe],
  )

  const duplicateBlock = useCallback(
    (index: number) => {
      setBlocks((prev) => {
        if (index < 0 || index >= prev.length) return prev
        const target = prev[index]
        const duplicated = {
          ...JSON.parse(JSON.stringify(target)),
          id: generateRowId(),
        }
        const next = [...prev]
        next.splice(index + 1, 0, duplicated)
        setIsDirty(true)
        postToIframe(next)
        return next
      })
    },
    [postToIframe],
  )

  const removeBlock = useCallback(
    (index: number) => {
      setBlocks((prev) => {
        if (index < 0 || index >= prev.length) return prev
        const next = [...prev]
        next.splice(index, 1)
        setIsDirty(true)
        postToIframe(next)
        return next
      })
    },
    [postToIframe],
  )

  const addBlock = useCallback(
    (index: number, blockType: string) => {
      setBlocks((prev) => {
        const newBlock = {
          id: generateRowId(),
          blockType,
        }
        const next = [...prev]
        const insertAt = index >= 0 && index <= prev.length ? index : prev.length
        next.splice(insertAt, 0, newBlock)
        setIsDirty(true)
        postToIframe(next)
        return next
      })
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
