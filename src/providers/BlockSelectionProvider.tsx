'use client'

import React, { createContext, useContext, useMemo, useState } from 'react'

export type BlockSelection = {
  /** Form-state path of the selected block, e.g. `layout.2.columns.0.content.1`. */
  selectedBlockPath: string | null
  /** Select a block by its form-state path, or `null` to clear the selection. */
  setSelectedBlockPath: React.Dispatch<React.SetStateAction<string | null>>
}

const NOOP: React.Dispatch<React.SetStateAction<string | null>> = () => {}

const Ctx = createContext<BlockSelection>({
  selectedBlockPath: null,
  setSelectedBlockPath: NOOP,
})

/**
 * Read and drive the overlay's block selection from any component in the admin.
 *
 * Register `BlockSelectionProvider` as an app-level provider
 * (`admin.components.providers`) to give your own navigation UI - an outline
 * tree, a jump list - the same selection the overlay's sidebar edits.
 * Components rendered into slots such as `beforeDocumentControls` are siblings
 * of the toggle, so only an app-level provider sits above both.
 *
 * Without that registration the hook returns a null selection and a no-op
 * setter, so a component may call it unconditionally.
 */
export const useBlockSelection = (): BlockSelection => useContext(Ctx)

/**
 * Holds the selection. Nesting is safe: an inner instance defers to an outer
 * one rather than shadowing it, so the overlay can mount its own without
 * cutting a consumer off from the shared selection.
 */
export const BlockSelectionProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const outer = useContext(Ctx)
  const [ownPath, setOwnPath] = useState<string | null>(null)
  const hasOuter = outer.setSelectedBlockPath !== NOOP

  const value = useMemo<BlockSelection>(
    () =>
      hasOuter
        ? outer
        : { selectedBlockPath: ownPath, setSelectedBlockPath: setOwnPath },
    [hasOuter, outer, ownPath],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
