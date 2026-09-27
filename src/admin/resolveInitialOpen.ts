/** The shape stored under the toggle's preference key. */
export type TogglePref = { open?: boolean } | null | undefined

/**
 * Decides whether the overlay is open when a document is opened.
 *
 * A saved choice (open or closed) always wins. `defaultOpen` only applies to
 * users who have never clicked the toggle for this entity, so a user who
 * closes the editor once keeps it closed.
 */
export function resolveInitialOpen(pref: TogglePref, defaultOpen: boolean | undefined): boolean {
  if (typeof pref?.open === 'boolean') return pref.open
  return Boolean(defaultOpen)
}
