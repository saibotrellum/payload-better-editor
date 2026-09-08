import { describe, expect, it } from 'vitest'
import { resolveInitialOpen } from '../../src/admin/resolveInitialOpen'

/**
 * `defaultOpen` makes the side-by-side editor the state a document opens in,
 * rather than something the editor switches on at every document.
 *
 * The decision is a pure function so it can be pinned without rendering the
 * whole overlay: given the stored preference and the configured default, is
 * the editor open on arrival?
 */
describe('resolveInitialOpen', () => {
  it('opens when the plugin default says so and nothing is stored', () => {
    expect(resolveInitialOpen(undefined, true)).toBe(true)
  })

  it('stays closed when the plugin default says so and nothing is stored', () => {
    expect(resolveInitialOpen(undefined, false)).toBe(false)
  })

  it('ignores a stored close, because the default wins on every document', () => {
    // The operator chose "always open on arrival": closing the overlay applies
    // to the document at hand, not to the next one. Reading the stored value
    // here is what made the editor stay shut after a single dismissal.
    expect(resolveInitialOpen({ open: false }, true)).toBe(true)
  })

  it('ignores a stored open when the default is off, so turning the option off really turns it off', () => {
    // The inverse matters just as much: a preference row written while the
    // default was on must not keep the editor open after it is switched back.
    expect(resolveInitialOpen({ open: true }, false)).toBe(false)
  })

  it('treats a null preference like a missing one', () => {
    expect(resolveInitialOpen(null, true)).toBe(true)
    expect(resolveInitialOpen(null, false)).toBe(false)
  })

  it('defaults to closed when the option is omitted, so existing installs do not change', () => {
    expect(resolveInitialOpen(undefined, undefined)).toBe(false)
    expect(resolveInitialOpen({ open: true }, undefined)).toBe(false)
  })
})
