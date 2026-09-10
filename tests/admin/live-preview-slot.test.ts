import { describe, expect, it } from 'vitest'
import type { Config } from 'payload'
import { betterEditor } from '../../src/index'

/**
 * The data channel's slug must travel with the component registration.
 *
 * `LivePreviewDataChannel` reads `collectionSlug` / `globalSlug` from its props and
 * puts them in every message it posts. `@payloadcms/live-preview` discards any
 * message that arrives without one:
 *
 *     if (!collectionSlug && !globalSlug) return initialData
 *
 * Registering the bare component path leaves those props undefined, so the
 * subscriber keeps returning its initial data and `useLivePreview` never emits an
 * update. Nothing throws. The preview simply stops reflecting unsaved edits, which
 * looks exactly like live preview not being configured - and that is how it went
 * unnoticed: in a host app, six well-formed messages reached the iframe on the same
 * origin and every one was dropped on that line.
 *
 * These tests read the registration rather than a helper, because the defect was in
 * the registration and a helper-level test would have passed throughout.
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

describe('live preview slot registration', () => {
  it('passes the collection slug as a client prop', () => {
    const config = betterEditor({ collections: ['pages'] })(makeConfig())
    const slot = livePreviewOf(config.collections?.[0])

    expect(slot).toBeDefined()
    expect(slot?.path).toBe('payload-better-editor/client#LivePreviewDataChannel')
    expect(slot?.clientProps).toEqual({ collectionSlug: 'pages' })
  })

  it('passes the global slug as a client prop', () => {
    const config = betterEditor({ globals: ['homepage'] })(makeConfig())
    const slot = livePreviewOf(config.globals?.[0])

    expect(slot?.clientProps).toEqual({ globalSlug: 'homepage' })
  })

  it('never registers the component without a slug', () => {
    // The exact shape that broke live preview: a registration carrying no props.
    const config = betterEditor({ collections: ['pages'], globals: ['homepage'] })(makeConfig())

    for (const entity of [config.collections?.[0], config.globals?.[0]]) {
      const slot = livePreviewOf(entity)
      const props = slot?.clientProps as Record<string, unknown> | undefined
      expect(props, 'registration carries no clientProps').toBeDefined()
      expect(
        Boolean(props?.collectionSlug) || Boolean(props?.globalSlug),
        'neither collectionSlug nor globalSlug is set - every message would be dropped',
      ).toBe(true)
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
