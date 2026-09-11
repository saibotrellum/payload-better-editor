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
  moveBlock: (fromIndex: number, toIndex: number, parentPath?: string) => void
  duplicateBlock: (index: number, parentPath?: string) => void
  removeBlock: (index: number, parentPath?: string) => void
  addBlock: (index: number, blockType: string, parentPath?: string, schemaPath?: string) => void
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

const stripSystemFields = (v: Record<string, unknown>): Record<string, unknown> => {
  const next = { ...v }
  delete next.updatedAt
  delete next.createdAt
  delete next._status
  return next
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
  const {
    submit,
    moveFieldRow,
    removeFieldRow,
    addFieldRow,
    dispatchFields,
    setModified,
  } = useForm()

  const collectionSlug = docInfo.collectionSlug
  const globalSlug = docInfo.globalSlug

  const [blocks, setBlocks] = useState<DraftBlock[]>([])
  const [isDirty, setIsDirty] = useState<boolean>(false)
  const [isSaving, setIsSaving] = useState<boolean>(false)
  const initializedRef = useRef<boolean>(false)
  const justSavedRef = useRef<boolean>(false)
  const blocksRef = useRef<DraftBlock[]>([])
  blocksRef.current = blocks

  const postToIframe = useCallback(
    (targetBlocks: DraftBlock[]) => {
      const frame = iframeRef?.current
      if (!frame || !url) return

      const win = frame.contentWindow
      if (!win) return

      let targetOrigin = '*'
      let ready = false
      try {
        targetOrigin = new URL(url, window.location.origin).origin
        ready = win.location.origin === targetOrigin
      } catch {
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
          targetOrigin,
        )
      } catch {
        // Iframe navigation catch
      }
    },
    [iframeRef, url, formState, id, blocksField, collectionSlug, globalSlug, locale],
  )

  const lastPostedValuesRef = useRef<string>('')

  // Sync field changes and block list from formState into current blocks
  useEffect(() => {
    if (!formState) return

    const values = reduceFieldsToValues(formState, true)
    const valuesString = JSON.stringify(stripSystemFields(values))

    if (justSavedRef.current) {
      justSavedRef.current = false
      lastPostedValuesRef.current = valuesString
      return
    }

    if (valuesString === lastPostedValuesRef.current) return
    const isInitial = !initializedRef.current
    lastPostedValuesRef.current = valuesString

    const formBlocks = values[blocksField]
    if (Array.isArray(formBlocks)) {
      setBlocks(formBlocks)
      if (!isInitial) {
        setIsDirty(true)
        if (setModified) {
          setModified(true)
        }
        postToIframe(formBlocks)
      } else {
        initializedRef.current = true
      }
    }
  }, [formState, blocksField, postToIframe, setModified])

  const moveBlock = useCallback(
    (fromIndex: number, toIndex: number, parentPath?: string) => {
      const targetPath = parentPath || blocksField
      const isTopLevel = targetPath === blocksField

      // Synchronisiert die Block-Verschiebung mit dem Payload FormState (wichtig für Gliederungsbaum und Payload-Save-Buttons)
      if (moveFieldRow) {
        moveFieldRow({ path: targetPath, moveFromIndex: fromIndex, moveToIndex: toIndex })
      } else if (dispatchFields) {
        dispatchFields({
          type: 'MOVE_ROW',
          path: targetPath,
          moveFromIndex: fromIndex,
          moveToIndex: toIndex,
        })
      }
      if (setModified) {
        setModified(true)
      }

      const prev = blocksRef.current.length > 0
        ? blocksRef.current
        : (formState ? ((reduceFieldsToValues(formState, true)[blocksField] as DraftBlock[]) || []) : [])

      if (isTopLevel && prev.length > 0 && fromIndex >= 0 && fromIndex < prev.length && toIndex >= 0 && toIndex < prev.length) {
        const next = [...prev]
        const [moved] = next.splice(fromIndex, 1)
        next.splice(toIndex, 0, moved)
        setBlocks(next)
        setIsDirty(true)
        postToIframe(next)
      } else {
        setIsDirty(true)
      }
    },
    [blocksField, moveFieldRow, dispatchFields, setModified, postToIframe, formState],
  )

  const duplicateBlock = useCallback(
    (index: number, parentPath?: string) => {
      const targetPath = parentPath || blocksField
      const isTopLevel = targetPath === blocksField

      if (dispatchFields) {
        dispatchFields({
          type: 'DUPLICATE_ROW',
          path: targetPath,
          rowIndex: index,
        })
      }
      if (setModified) {
        setModified(true)
      }

      const prev = blocksRef.current.length > 0
        ? blocksRef.current
        : (formState ? ((reduceFieldsToValues(formState, true)[blocksField] as DraftBlock[]) || []) : [])

      if (isTopLevel && prev.length > 0 && index >= 0 && index < prev.length) {
        const target = prev[index]
        const duplicated: DraftBlock = {
          ...(JSON.parse(JSON.stringify(target)) as DraftBlock),
          id: generateRowId(),
        }
        delete duplicated._id
        const next = [...prev]
        next.splice(index + 1, 0, duplicated)
        setBlocks(next)
        setIsDirty(true)
        postToIframe(next)
      } else {
        setIsDirty(true)
      }
    },
    [blocksField, dispatchFields, setModified, postToIframe, formState],
  )

  const removeBlock = useCallback(
    (index: number, parentPath?: string) => {
      const targetPath = parentPath || blocksField
      const isTopLevel = targetPath === blocksField

      if (removeFieldRow) {
        removeFieldRow({ path: targetPath, rowIndex: index })
      } else if (dispatchFields) {
        dispatchFields({
          type: 'REMOVE_ROW',
          path: targetPath,
          rowIndex: index,
        })
      }
      if (setModified) {
        setModified(true)
      }

      const prev = blocksRef.current.length > 0
        ? blocksRef.current
        : (formState ? ((reduceFieldsToValues(formState, true)[blocksField] as DraftBlock[]) || []) : [])

      if (isTopLevel && prev.length > 0 && index >= 0 && index < prev.length) {
        const next = [...prev]
        next.splice(index, 1)
        setBlocks(next)
        setIsDirty(true)
        postToIframe(next)
      } else {
        setIsDirty(true)
      }
    },
    [blocksField, removeFieldRow, dispatchFields, setModified, postToIframe, formState],
  )

  const addBlock = useCallback(
    (index: number, blockType: string, parentPath?: string, schemaPath?: string) => {
      const targetPath = parentPath || blocksField
      const targetSchemaPath = schemaPath || blocksField
      const isTopLevel = targetPath === blocksField

      const prev = blocksRef.current.length > 0
        ? blocksRef.current
        : (formState ? ((reduceFieldsToValues(formState, true)[blocksField] as DraftBlock[]) || []) : [])

      const newBlock: DraftBlock = {
        id: generateRowId(),
        blockType,
      }

      if (isTopLevel) {
        const insertAt = index >= 0 && index <= prev.length ? index : prev.length
        const next = [...prev]
        next.splice(insertAt, 0, newBlock)
        setBlocks(next)
        setIsDirty(true)
        postToIframe(next)
      } else {
        setIsDirty(true)
      }

      if (addFieldRow) {
        addFieldRow({
          blockType,
          path: targetPath,
          rowIndex: index,
          schemaPath: targetSchemaPath,
        })
      } else if (dispatchFields) {
        dispatchFields({
          type: 'ADD_ROW',
          path: targetPath,
          rowIndex: index,
          blockType,
        })
      }
      if (setModified) {
        setModified(true)
      }
    },
    [blocksField, addFieldRow, dispatchFields, setModified, postToIframe, formState],
  )

  const save = useCallback(
    async (status: 'draft' | 'published' = 'draft') => {
      setIsSaving(true)
      try {
        if (submit) {
          await submit({
            overrides: {
              _status: status,
              [blocksField]: blocksRef.current,
            },
          })
          justSavedRef.current = true
          setIsDirty(false)
          if (setModified) {
            setModified(false)
          }
        }
      } catch (err) {
        console.error('[better-editor] Save failed:', err)
        throw err
      } finally {
        setIsSaving(false)
      }
    },
    [submit, blocksField, setModified],
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
