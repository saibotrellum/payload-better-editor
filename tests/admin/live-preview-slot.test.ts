import { describe, expect, it } from 'vitest'
import type { Config } from 'payload'
import { betterEditor } from '../../src/index'

/**
 * The live-preview slot has exactly one shape Payload reads, and getting it wrong
 * fails silently in both directions.
 *
 * `renderDocumentSlots` (@payloadcms/next) is the only producer of the Edit view's
 * `LivePreview` prop, and it reads one key:
 *
 *     if (LivePreview?.Component) { ... }
 *
 * So the slot value must be `{ Component: <path> }`. Writing a PayloadComponent
 * object into the slot directly - `{ path, clientProps }` - type-checks against
 * `DefaultDocumentViewConfig`, builds, ships, and registers NOTHING: the slot is
 * skipped, the channel never mounts, and the preview receives no messages at all.
 * That shipped once, and the symptom (a preview that ignores unsaved edits) is the
 * same one a mis-registered channel produces, which is what made it hard to see.
 *
 * The slug the channel needs does NOT travel through this config. `renderDocumentSlots`
 * passes no `clientProps` for this slot and its `serverProps` carries no slug either,
 * so a client component here receives no props whatsoever. `LivePreviewDataChannel`
 * reads `useDocumentInfo()` instead - the slot renders inside `DocumentInfoProvider`.
 */

const makeConfig = (): Config =>
  ({
    collections: [
      { slug: 'pages', fields: [{ name: 'layout', type: 'blocks', blocks: [] }] },
      { slug: 'untouched', fields: [] },
    ],
    globals: [{ slug: 'homepage', fields: [{ name: 'layout', type: 'blocks', blocks: [] }] }],
  }) as unknown as Config

const livePreviewOf = (entity: unknown): Record<string, unknown> | undefined =>
  (entity as { admin?: { components?: { views?: { edit?: { livePreview?: Record<string, unknown> } } } } })
    ?.admin?.components?.views?.edit?.livePreview

const DATA_CHANNEL = 'payload-better-editor/client#LivePreviewDataChannel'

describe('live preview slot registration', () => {
  it('registers the channel under `Component`, the only key Payload reads', () => {
    const config = betterEditor({ collections: ['pages'] })(makeConfig())
    const slot = livePreviewOf(config.collections?.[0])

    expect(slot).toBeDefined()
    expect(slot?.Component).toBe(DATA_CHANNEL)
  })

  it('does the same for globals', () => {
    const config = betterEditor({ globals: ['homepage'] })(makeConfig())
    expect(livePreviewOf(config.globals?.[0])?.Component).toBe(DATA_CHANNEL)
  })

  it('never puts the component path anywhere but `Component`', () => {
    // The exact mistake that silently unregistered the channel: a PayloadComponent
    // object written straight into the slot, where `path` is the only thing naming
    // the component and `renderDocumentSlots` finds no `Component` to render.
    const config = betterEditor({ collections: ['pages'], globals: ['homepage'] })(makeConfig())

    for (const entity of [config.collections?.[0], config.globals?.[0]]) {
      const slot = livePreviewOf(entity)
      expect(slot?.Component, 'slot has no `Component` - Payload would skip it').toBeDefined()
      expect(slot?.path, 'a bare `path` on the slot is never read').toBeUndefined()
    }
  })

  it('leaves entities the plugin was not asked to touch alone', () => {
    const config = betterEditor({ collections: ['pages'] })(makeConfig())
    expect(livePreviewOf(config.collections?.[1])).toBeUndefined()
  })

  it('keeps a live-preview view the host declared itself', () => {
    const own = { Component: 'app/MyPreview#MyPreview' }
    const base = makeConfig()
    ;(base.collections![0] as unknown as Record<string, unknown>).admin = {
      components: { views: { edit: { livePreview: own } } },
    }

    const config = betterEditor({ collections: ['pages'] })(base)
    expect(livePreviewOf(config.collections?.[0])).toEqual(own)
  })

  it('registers nothing when livePreviewData is switched off', () => {
    const config = betterEditor({ collections: ['pages'], livePreviewData: false })(makeConfig())
    expect(livePreviewOf(config.collections?.[0])).toBeUndefined()
  })
})
