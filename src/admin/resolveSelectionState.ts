import type React from 'react'

type Setter = React.Dispatch<React.SetStateAction<string | null>>

/**
 * Picks between a lifted selection and the component's own fallback.
 *
 * `LiveEditorOverlay` is exported so a consumer can build its own wrapper
 * around it, so its selection props have to stay optional. When they are
 * absent the overlay owns the selection itself, exactly as it did before the
 * props existed; when they are present the owner above it wins.
 *
 * The setter decides, not the value: `selectedBlockPath` is legitimately
 * `null` while a lifted selection is empty, so a value-based check would drop
 * back to local state on every cleared selection and silently sever the link
 * to the owner.
 */
export function resolveSelectionState(
  liftedPath: string | null | undefined,
  liftedSetter: Setter | undefined,
  ownPath: string | null,
  ownSetter: Setter,
): { selectedBlockPath: string | null; setSelectedBlockPath: Setter } {
  if (liftedSetter === undefined) {
    return { selectedBlockPath: ownPath, setSelectedBlockPath: ownSetter }
  }
  return { selectedBlockPath: liftedPath ?? null, setSelectedBlockPath: liftedSetter }
}
