'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAllFormFields } from '@payloadcms/ui'
import { listenForParentInbound } from '../internal/postmessage.js'
import { splitFieldPath } from '../internal/path.js'
import type { FormState } from 'payload'
import { useEditorHistory } from '../state/useEditorHistory.js'
import { useIsolatedDraft } from '../state/useIsolatedDraft.js'
import { useLatestRef } from './useLatestRef.js'

const ID_SUFFIX = '.id'

const buildIdIndex = (fields: FormState): Map<string, string> => {
  const map = new Map<string, string>()
  for (const key of Object.keys(fields)) {
    if (!key.endsWith(ID_SUFFIX)) continue
    const value = fields[key]?.value
    if (typeof value === 'string' && value.length > 0) {
      map.set(value, key.slice(0, -ID_SUFFIX.length))
    }
  }
  return map
}

export type UseBlockActionMessagesArgs = {
  selectedBlockPath: string | null
  setSelectedBlockPath: (path: string | null) => void
}

export type UseBlockActionMessagesReturn = {
  addBelowRequestId: number
}

export const useBlockActionMessages = ({
  setSelectedBlockPath,
}: UseBlockActionMessagesArgs): UseBlockActionMessagesReturn => {
  const [addBelowRequestId, setAddBelowRequestId] = useState<number>(0)

  const [allFields] = useAllFormFields()
  const idIndex = useMemo(() => buildIdIndex(allFields as FormState), [allFields])
  const history = useEditorHistory()
  const draft = useIsolatedDraft()

  // Refs let the postMessage listener stay bound across renders without
  // missing the latest form state, draft, or history commit.
  const allFieldsRef = useLatestRef(allFields)
  const idIndexRef = useLatestRef(idIndex)
  const historyRef = useLatestRef(history)
  const draftRef = useLatestRef(draft)
  const setSelectedBlockPathRef = useLatestRef(setSelectedBlockPath)

  // Bind the postMessage listener exactly once. All state inputs flow
  // through stable refs (above), so a re-bind is never needed.
  useEffect(
    () =>
      listenForParentInbound((data) => {
        const fields = allFieldsRef.current as FormState
        const currentDraft = draftRef.current
        const select = setSelectedBlockPathRef.current
        const { commit } = historyRef.current

        // Check if data.id is in draft.blocks
        let rowIndex = currentDraft.blocks.findIndex(
          (b) => String(b.id || b._id) === String(data.id),
        )
        let parentPath = 'layout'

        if (rowIndex === -1) {
          const path = idIndexRef.current.get(data.id) ?? null
          if (path) {
            const split = splitFieldPath(path)
            if (split) {
              parentPath = split.parent
              rowIndex = split.index
            }
          }
        }

        if (rowIndex < 0) return

        if (data.type === 'focus-block') {
          select(`${parentPath}.${rowIndex}`)
          return
        }

        if (data.action === 'add') {
          select(`${parentPath}.${rowIndex}`)
          setAddBelowRequestId((id) => id + 1)
          return
        }

        const rowCount =
          currentDraft.blocks.length > 0
            ? currentDraft.blocks.length
            : Array.isArray(fields[parentPath]?.rows)
              ? (fields[parentPath].rows as unknown[]).length
              : 0

        if (rowIndex >= rowCount) return

        switch (data.action) {
          case 'move-up':
            if (rowIndex === 0) return
            commit(() => currentDraft.moveBlock(rowIndex, rowIndex - 1))
            select(`${parentPath}.${rowIndex - 1}`)
            break
          case 'move-down':
            if (rowIndex >= rowCount - 1) return
            commit(() => currentDraft.moveBlock(rowIndex, rowIndex + 1))
            select(`${parentPath}.${rowIndex + 1}`)
            break
          case 'duplicate':
            commit(() => currentDraft.duplicateBlock(rowIndex))
            select(`${parentPath}.${rowIndex + 1}`)
            break
          case 'delete':
            commit(() => currentDraft.removeBlock(rowIndex))
            select(null)
            break
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs are stable
    [],
  )

  return { addBelowRequestId }
}
