// @vitest-environment jsdom
// The prompt asks once per document open, only when a published version and a
// newer draft both exist. "Continue" leaves the document alone; "Restore"
// re-saves the published version through the REST API, as Payload's own
// "Revert to published" action does.

import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

type Info = {
  id?: string
  collectionSlug?: string
  hasPublishedDoc: boolean
  unpublishedVersionCount: number
  docPermissions?: { update?: boolean }
}

let info: Info
const resetForm = vi.fn()
const reportUpdate = vi.fn()
const incrementVersionCount = vi.fn()
const setUnpublishedVersionCount = vi.fn()
const setMostRecentVersionIsAutosaved = vi.fn()
const fetchMock = vi.fn()

vi.mock('@payloadcms/ui', () => ({
  useDocumentInfo: () => ({
    ...info,
    incrementVersionCount,
    setUnpublishedVersionCount,
    setMostRecentVersionIsAutosaved,
  }),
  useConfig: () => ({ config: { routes: { api: '/api' } } }),
  useForm: () => ({ reset: resetForm }),
  useDocumentEvents: () => ({ reportUpdate }),
  useLocale: () => ({ code: 'de' }),
  useTranslation: () => ({ i18n: { translations: {}, language: 'de' } }),
}))

const { DraftPrompt } = await import('../../src/admin/DraftPrompt')

const changedDoc = (): Info => ({
  id: 'doc1',
  collectionSlug: 'content',
  hasPublishedDoc: true,
  unpublishedVersionCount: 2,
  docPermissions: { update: true },
})

const renderPrompt = async () => {
  const view = render(<DraftPrompt />)
  await act(async () => {})
  return view
}

beforeEach(() => {
  info = changedDoc()
  resetForm.mockReset()
  reportUpdate.mockReset()
  incrementVersionCount.mockReset()
  setUnpublishedVersionCount.mockReset()
  setMostRecentVersionIsAutosaved.mockReset()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('DraftPrompt', () => {
  it('shows nothing for a never-published document', async () => {
    info = { ...changedDoc(), hasPublishedDoc: false }
    await renderPrompt()
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('shows nothing when there is no newer draft', async () => {
    info = { ...changedDoc(), unpublishedVersionCount: 0 }
    await renderPrompt()
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('shows nothing for a user who may not update the document', async () => {
    info = { ...changedDoc(), docPermissions: { update: false } }
    await renderPrompt()
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('shows nothing for a document that is not saved yet', async () => {
    info = { ...changedDoc(), id: undefined }
    await renderPrompt()
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('asks when a published version and a newer draft exist', async () => {
    await renderPrompt()
    expect(screen.getByRole('alertdialog')).toBeTruthy()
    expect(screen.getByRole('button', { name: /continue editing the draft/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /restore the published version/i })).toBeTruthy()
  })

  it('puts the draft action left as secondary and the restore action right as primary', async () => {
    await renderPrompt()
    const buttons = screen.getAllByRole('button')
    expect(buttons.map((b) => b.textContent)).toEqual([
      'Continue editing the draft',
      'Restore the published version',
    ])
    expect(buttons[0].className).toContain('btn--style-secondary')
    expect(buttons[1].className).toContain('btn--style-primary')
    expect(screen.getByRole('alertdialog').textContent).toContain(
      'This document has newer, unpublished changes. How would you like to proceed?',
    )
  })

  it('continue closes the prompt and touches nothing', async () => {
    await renderPrompt()
    fireEvent.click(screen.getByRole('button', { name: /continue editing the draft/i }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(resetForm).not.toHaveBeenCalled()
  })

  it('does not ask again when autosave raises the count during the same open', async () => {
    info = { ...changedDoc(), unpublishedVersionCount: 0 }
    const { rerender } = await renderPrompt()
    info = { ...info, unpublishedVersionCount: 1 }
    rerender(<DraftPrompt />)
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('does not come back after continue when the count changes', async () => {
    const { rerender } = await renderPrompt()
    fireEvent.click(screen.getByRole('button', { name: /continue editing the draft/i }))
    info = { ...info, unpublishedVersionCount: 3 }
    rerender(<DraftPrompt />)
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('asks again when another document with a draft is opened', async () => {
    const { rerender } = await renderPrompt()
    fireEvent.click(screen.getByRole('button', { name: /continue editing the draft/i }))
    info = { ...info, id: 'doc2' }
    rerender(<DraftPrompt />)
    expect(screen.getByRole('alertdialog')).toBeTruthy()
  })

  it('restore re-saves the published version and resets the form', async () => {
    const published = { id: 'doc1', title: 'Published title' }
    fetchMock
      .mockResolvedValueOnce({ status: 200, json: async () => published })
      .mockResolvedValueOnce({ status: 200, json: async () => ({ doc: published }) })
    await renderPrompt()
    fireEvent.click(screen.getByRole('button', { name: /restore the published version/i }))

    await waitFor(() => expect(resetForm).toHaveBeenCalledWith(published))
    const [getUrl, getInit] = fetchMock.mock.calls[0]
    expect(getUrl).toBe('/api/content/doc1?locale=de&fallback-locale=null&depth=0')
    expect(getInit?.method ?? 'GET').toBe('GET')
    const [patchUrl, patchInit] = fetchMock.mock.calls[1]
    expect(patchUrl).toBe(getUrl)
    expect(patchInit.method).toBe('PATCH')
    expect(JSON.parse(patchInit.body)).toEqual(published)
    expect(setUnpublishedVersionCount).toHaveBeenCalledWith(0)
    // The editor overlay's preview refreshes from this event.
    expect(reportUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'doc1', entitySlug: 'content', operation: 'update' }),
    )
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('keeps the prompt open with an error when the revert fails', async () => {
    fetchMock
      .mockResolvedValueOnce({ status: 200, json: async () => ({ id: 'doc1' }) })
      .mockResolvedValueOnce({
        status: 403,
        json: async () => ({ errors: [{ message: 'Not allowed' }] }),
      })
    await renderPrompt()
    fireEvent.click(screen.getByRole('button', { name: /restore the published version/i }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Not allowed'))
    expect(resetForm).not.toHaveBeenCalled()
    expect(screen.getByRole('alertdialog')).toBeTruthy()
  })
})
