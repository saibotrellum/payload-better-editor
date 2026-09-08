import { describe, expect, it, vi } from 'vitest'
import { resolveSelectionState } from '../../src/admin/resolveSelectionState'

/**
 * `LiveEditorOverlay`'s selection props are optional on purpose: the component
 * is exported for consumers building their own wrapper, and making the pair
 * required would have broken every such consumer at compile time.
 */
describe('resolveSelectionState', () => {
  const ownSetter = vi.fn()
  const liftedSetter = vi.fn()

  it('uses the component\'s own state when nothing is lifted', () => {
    const r = resolveSelectionState(undefined, undefined, 'layout.3', ownSetter)
    expect(r.selectedBlockPath).toBe('layout.3')
    expect(r.setSelectedBlockPath).toBe(ownSetter)
  })

  it('uses the lifted state when a setter is passed', () => {
    const r = resolveSelectionState('layout.7', liftedSetter, 'layout.3', ownSetter)
    expect(r.selectedBlockPath).toBe('layout.7')
    expect(r.setSelectedBlockPath).toBe(liftedSetter)
  })

  it('keeps using the lifted state while its value is null', () => {
    // The trap this guards: an empty lifted selection is `null`, and a check
    // on the VALUE would fall back to local state exactly then - severing the
    // link to the owner the moment a selection is cleared.
    const r = resolveSelectionState(null, liftedSetter, 'layout.3', ownSetter)
    expect(r.selectedBlockPath).toBeNull()
    expect(r.setSelectedBlockPath).toBe(liftedSetter)
  })

  it('treats an undefined lifted value with a setter as no selection', () => {
    const r = resolveSelectionState(undefined, liftedSetter, 'layout.3', ownSetter)
    expect(r.selectedBlockPath).toBeNull()
    expect(r.setSelectedBlockPath).toBe(liftedSetter)
  })
})
