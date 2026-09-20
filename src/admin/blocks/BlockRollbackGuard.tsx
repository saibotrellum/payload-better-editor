'use client'

import { useEffect, useRef } from 'react'
import { useAllFormFields, useDocumentInfo, useForm } from '@payloadcms/ui'
import type { FormState } from 'payload'

const CLAIM_TTL_MS = 6000

export type BlockRollbackGuardProps = {
  blocksField: string
}

let intentionalRemovalUntil = 0

/**
 * Mark that an intentional row removal is taking place.
 * Prevents the guard from treating a deliberate user deletion as a rollback.
 */
export function markIntentionalRemoval(durationMs: number = 2000): void {
  intentionalRemovalUntil = Date.now() + durationMs
}

export function isIntentionalRemoval(): boolean {
  return Date.now() < intentionalRemovalUntil
}

function getRowCount(fields: Record<string, any> | undefined, blocksField: string): number {
  if (!fields) return 0
  const field = fields[blocksField]
  if (field && Array.isArray(field.rows)) {
    return field.rows.length
  }
  let count = 0
  const regex = new RegExp(`^${blocksField}\\.\\d+\\.id$`)
  for (const k of Object.keys(fields)) {
    if (regex.test(k)) count++
  }
  return count
}

/**
 * Guards against the Payload CMS block rollback defect where an asynchronous
 * server component roundtrip or late REPLACE_STATE reverts the form state back
 * to the saved database state (e.g. dropping from 13 rows back to 12 rows).
 */
export function BlockRollbackGuard({ blocksField }: BlockRollbackGuardProps): null {
  const [fields] = useAllFormFields()
  const form = useForm()
  const { id } = useDocumentInfo()

  const claim = useRef<{
    state: FormState
    count: number
    at: number
  } | null>(null)

  const previousCount = useRef<number>(-1)
  const repairing = useRef(false)
  const docIdRef = useRef(id)

  // Reset claim on document navigation
  if (docIdRef.current !== id) {
    docIdRef.current = id
    claim.current = null
    previousCount.current = -1
    repairing.current = false
  }

  // Intercept form.dispatchFields and form.replaceState if called directly on form
  useEffect(() => {
    if (!form) return
    const origDispatch = form.dispatchFields
    const origReplaceState = form.replaceState

    form.dispatchFields = (action: any) => {
      if (action?.type === 'REMOVE_ROW') {
        markIntentionalRemoval(2000)
      }

      if (action?.type === 'REPLACE_STATE' && action.state) {
        const held = claim.current
        if (held && Date.now() - held.at < CLAIM_TTL_MS && !isIntentionalRemoval()) {
          const incoming = getRowCount(action.state, blocksField)
          if (incoming < held.count) {
            console.warn(
              `[better-editor] Blocked late REPLACE_STATE dropping ${blocksField} rows from ${held.count} to ${incoming}`,
            )
            return
          }
        }
      }
      return origDispatch ? origDispatch(action) : undefined
    }

    form.replaceState = (state: any) => {
      const held = claim.current
      if (held && Date.now() - held.at < CLAIM_TTL_MS && !isIntentionalRemoval()) {
        const incoming = getRowCount(state, blocksField)
        if (incoming < held.count) {
          console.warn(
            `[better-editor] Blocked late replaceState dropping ${blocksField} rows from ${held.count} to ${incoming}`,
          )
          return
        }
      }
      return origReplaceState ? origReplaceState(state) : undefined
    }
  }, [form, blocksField])

  // Reactive observation: restore if state reverted behind our back
  useEffect(() => {
    const currentFields = fields as FormState
    const currentCount = getRowCount(currentFields, blocksField)

    if (repairing.current) {
      repairing.current = false
      claim.current = { state: currentFields, count: currentCount, at: Date.now() }
      return
    }

    const prev = previousCount.current
    previousCount.current = currentCount

    // First render: initialize previous count
    if (prev === -1) {
      return
    }

    // Row count increased or maintained: update claim
    if (currentCount > prev) {
      claim.current = { state: currentFields, count: currentCount, at: Date.now() }
      return
    }

    const held = claim.current
    const isWithinWindow = held && Date.now() - held.at < CLAIM_TTL_MS

    if (isIntentionalRemoval()) {
      // User deliberately deleted a block; accept new count
      claim.current = { state: currentFields, count: currentCount, at: Date.now() }
      return
    }

    // If row count decreased within TTL window below held count without an intentional remove: rollback!
    if (isWithinWindow && currentCount < held.count) {
      console.warn(
        `[better-editor] Rollback detected (${blocksField} dropped from ${held.count} to ${currentCount}). Restoring state...`,
      )
      repairing.current = true
      form.dispatchFields({ type: 'REPLACE_STATE', state: held.state })
      form.setModified(true)
    }
  }, [fields, blocksField, form])

  return null
}
