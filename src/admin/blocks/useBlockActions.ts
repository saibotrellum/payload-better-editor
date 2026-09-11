'use client'

import { useAllFormFields } from '@payloadcms/ui'
import { useEditorHistory } from '../../state/useEditorHistory.js'
import { useIsolatedDraft } from '../../state/useIsolatedDraft.js'
import { splitFieldPath } from '../../internal/path.js'

type Args = {
  selectedBlockPath: string | null
  onSelectPath: (path: string | null) => void
  onClearSelection: () => void
}

const rowCountAt = (
  fields: ReturnType<typeof useAllFormFields>[0],
  path: string,
): number => {
  const field = fields[path]
  if (field && Array.isArray(field.rows)) return field.rows.length
  if (field && typeof field.value === 'number') return field.value
  if (field && Array.isArray(field.value)) return field.value.length
  return 0
}

export const useBlockActions = ({
  selectedBlockPath,
  onSelectPath,
  onClearSelection,
}: Args) => {
  const [fields] = useAllFormFields()
  const { commit } = useEditorHistory()
  const draft = useIsolatedDraft()

  const split = selectedBlockPath ? splitFieldPath(selectedBlockPath) : null
  const parentPath = split?.parent ?? ''
  const rowIndex = split ? split.index : NaN
  const isTopLevel = parentPath === 'layout' || parentPath === ''
  const rowCount = (isTopLevel && draft.blocks.length > 0)
    ? draft.blocks.length
    : (parentPath ? rowCountAt(fields, parentPath) : (draft.blocks.length || 0))
  const canMutate = !Number.isNaN(rowIndex) && parentPath !== '' && rowIndex < rowCount
  const canMoveUp = canMutate && rowIndex > 0
  const canMoveDown = canMutate && rowIndex < rowCount - 1

  // Re-check bounds at call time: form state may have shifted between
  // render and click (e.g. another action just removed the row).
  const runRowAction = (
    kind: 'move-up' | 'move-down' | 'duplicate' | 'remove',
  ): void => {
    if (kind === 'move-up' && !canMoveUp) return
    if (kind === 'move-down' && !canMoveDown) return
    if ((kind === 'duplicate' || kind === 'remove') && !canMutate) return
    const liveCount = (isTopLevel && draft.blocks.length > 0)
      ? draft.blocks.length
      : (parentPath ? rowCountAt(fields, parentPath) : (draft.blocks.length || 0))
    if (rowIndex >= liveCount) return
    if (kind === 'move-down' && rowIndex >= liveCount - 1) return

    commit(() => {
      switch (kind) {
        case 'move-up':
          draft.moveBlock(rowIndex, rowIndex - 1, parentPath)
          break
        case 'move-down':
          draft.moveBlock(rowIndex, rowIndex + 1, parentPath)
          break
        case 'duplicate':
          draft.duplicateBlock(rowIndex, parentPath)
          break
        case 'remove':
          draft.removeBlock(rowIndex, parentPath)
          break
      }
    })

    if (kind === 'remove') {
      onClearSelection()
      return
    }
    const nextIndex =
      kind === 'move-up' ? rowIndex - 1 : kind === 'move-down' ? rowIndex + 1 : rowIndex + 1
    onSelectPath(`${parentPath}.${nextIndex}`)
  }

  const moveUp = () => runRowAction('move-up')
  const moveDown = () => runRowAction('move-down')
  const duplicate = () => runRowAction('duplicate')
  const remove = () => runRowAction('remove')

  const addAfter = ({
    blockType,
    containerPath,
    schemaPath,
    index,
  }: {
    blockType?: string
    schemaPath: string
    containerPath: string
    index: number
  }) => {
    commit(() => {
      draft.addBlock(index, blockType || 'unknown', containerPath, schemaPath)
    })
    onSelectPath(`${containerPath}.${index}`)
  }

  return {
    moveUp,
    moveDown,
    duplicate,
    remove,
    addAfter,
    canMoveUp,
    canMoveDown,
    canMutate,
    parentPath,
    rowIndex,
    rowCount,
  }
}
