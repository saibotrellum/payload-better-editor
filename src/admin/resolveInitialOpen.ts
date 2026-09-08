/** The shape stored under the toggle's preference key. */
export type TogglePref = { open?: boolean } | null | undefined

/**
 * Decides whether the overlay is open when a document is opened.
 *
 * The stored preference is deliberately NOT read here. `defaultOpen` describes
 * the state every document starts in, so closing the overlay applies to the
 * document at hand and not to the next one. Reading the stored value would
 * turn a single dismissal into a permanent one, which is the behaviour
 * `defaultOpen` exists to replace.
 *
 * The preference is still written (the toggle keeps it for callers that read
 * it) and still takes the parameter, so the signature stays honest about what
 * is available rather than pretending the value does not exist.
 */
export function resolveInitialOpen(_pref: TogglePref, defaultOpen: boolean | undefined): boolean {
  return Boolean(defaultOpen)
}
