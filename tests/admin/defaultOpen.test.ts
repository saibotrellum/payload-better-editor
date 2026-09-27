import { describe, expect, it } from 'vitest'
import { resolveInitialOpen } from '../../src/admin/resolveInitialOpen'

/**
 * `defaultOpen` is the initial state for users without a saved preference for
 * the entity. A saved choice, open or closed, always wins.
 */
describe('resolveInitialOpen', () => {
  it('opens when the default says so and nothing is stored', () => {
    expect(resolveInitialOpen(undefined, true)).toBe(true)
  })

  it('stays closed when the default is off and nothing is stored', () => {
    expect(resolveInitialOpen(undefined, false)).toBe(false)
  })

  it('keeps a stored close even when the default is on', () => {
    expect(resolveInitialOpen({ open: false }, true)).toBe(false)
  })

  it('keeps a stored open even when the default is off', () => {
    expect(resolveInitialOpen({ open: true }, false)).toBe(true)
  })

  it('treats a null preference like a missing one', () => {
    expect(resolveInitialOpen(null, true)).toBe(true)
    expect(resolveInitialOpen(null, false)).toBe(false)
  })

  it('defaults to closed when the option is omitted', () => {
    expect(resolveInitialOpen(undefined, undefined)).toBe(false)
  })
})
