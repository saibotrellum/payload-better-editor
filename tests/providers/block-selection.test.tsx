// @vitest-environment jsdom
// The selection context lets a consumer read and drive what the sidebar edits.

import React from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import {
  BlockSelectionProvider,
  useBlockSelection,
} from '../../src/providers/BlockSelectionProvider'

afterEach(cleanup)

const Probe: React.FC<{ label?: string }> = ({ label = '' }) => {
  const { selectedBlockPath, setSelectedBlockPath } = useBlockSelection()
  return (
    <button
      aria-label={label}
      onClick={() => setSelectedBlockPath('layout.2.columns.0.content.1')}
    >
      {selectedBlockPath ?? 'none'}
    </button>
  )
}

describe('useBlockSelection', () => {
  it('is inert outside a provider, so a consumer may call it unconditionally', () => {
    render(<Probe />)
    const btn = screen.getByRole('button')
    expect(btn.textContent).toBe('none')
    fireEvent.click(btn)
    expect(btn.textContent).toBe('none')
  })

  it('holds the selection a consumer sets', () => {
    render(
      <BlockSelectionProvider>
        <Probe />
      </BlockSelectionProvider>,
    )
    const btn = screen.getByRole('button')
    expect(btn.textContent).toBe('none')
    fireEvent.click(btn)
    expect(btn.textContent).toBe('layout.2.columns.0.content.1')
  })

  it('shares one selection across siblings, which slot-rendered components are', () => {
    render(
      <BlockSelectionProvider>
        <Probe label="a" />
        <Probe label="b" />
      </BlockSelectionProvider>,
    )
    fireEvent.click(screen.getByLabelText('a'))
    expect(screen.getByLabelText('b').textContent).toBe('layout.2.columns.0.content.1')
  })

  it('defers to an outer provider instead of shadowing it', () => {
    render(
      <BlockSelectionProvider>
        <Probe label="outer" />
        <BlockSelectionProvider>
          <Probe label="inner" />
        </BlockSelectionProvider>
      </BlockSelectionProvider>,
    )
    fireEvent.click(screen.getByLabelText('inner'))
    expect(screen.getByLabelText('outer').textContent).toBe(
      'layout.2.columns.0.content.1',
    )
  })
})
