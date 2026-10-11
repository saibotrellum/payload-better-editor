import type { Config } from 'payload'
import { describe, expect, it } from 'vitest'
import { betterEditor } from '../../src/index'

describe('defaultOpen', () => {
  it('passes defaultOpen to the toggle only when enabled', () => {
    const config = betterEditor({ collections: { pages: { defaultOpen: true }, posts: {} } })({
      collections: [
        { slug: 'pages', fields: [{ name: 'layout', type: 'blocks', blocks: [] }] },
        { slug: 'posts', fields: [{ name: 'layout', type: 'blocks', blocks: [] }] },
      ],
    } as unknown as Config)
    const toggleProps = (slug: string) =>
      (
        config.collections?.find((c) => c.slug === slug)?.admin?.components?.edit
          ?.beforeDocumentControls as Array<{ clientProps: Record<string, unknown> }>
      )[0].clientProps
    expect(toggleProps('pages').defaultOpen).toBe(true)
    expect('defaultOpen' in toggleProps('posts')).toBe(false)
  })
})

describe('draftPrompt', () => {
  const build = (collections: Record<string, { draftPrompt?: boolean }> | string[]) =>
    betterEditor({ collections })({
      collections: [
        { slug: 'pages', fields: [{ name: 'layout', type: 'blocks', blocks: [] }] },
        { slug: 'posts', fields: [{ name: 'layout', type: 'blocks', blocks: [] }] },
      ],
    } as unknown as Config)
  const controls = (config: Config, slug: string) =>
    (config.collections?.find((c) => c.slug === slug)?.admin?.components?.edit
      ?.beforeDocumentControls ?? []) as Array<{ path: string }>

  it('adds the prompt component only to opted-in collections', () => {
    const config = build({ pages: { draftPrompt: true }, posts: {} })
    expect(controls(config, 'pages').map((c) => c.path)).toContain(
      'payload-better-editor/client#DraftPrompt',
    )
    expect(controls(config, 'posts').map((c) => c.path)).not.toContain(
      'payload-better-editor/client#DraftPrompt',
    )
  })

  it('is off for the slug-list form', () => {
    const config = build(['pages'])
    expect(controls(config, 'pages')).toHaveLength(1)
  })
})
