import type { Config, GlobalConfig } from 'payload'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { betterEditor, BETTER_EDITOR_SETTINGS_SLUG, betterEditorSettingsGlobal } from '../../src/index'
import { findPermissiveSettingsAccess } from '../../src/internal/settings-access'

const settingsGlobal = (config: Config) =>
  config.globals?.find((g) => g.slug === BETTER_EDITOR_SETTINGS_SLUG) as GlobalConfig

afterEach(() => {
  vi.restoreAllMocks()
})

type AccessFn = (args: { req: { user?: unknown } }) => boolean | Promise<boolean>
const run = (fn: unknown, user?: unknown) => (fn as AccessFn)({ req: { user } })

const configWithUserFields = (fields: Array<Record<string, unknown>>) =>
  ({ collections: [{ slug: 'users', auth: true, fields }] }) as unknown as Config

describe('default settings access', () => {
  const { read, update } = betterEditorSettingsGlobal.access ?? {}

  it('denies anonymous requests', async () => {
    expect(await run(read)).toBe(false)
    expect(await run(update)).toBe(false)
  })

  it('lets any logged-in user read', async () => {
    expect(await run(read, { id: 1, roles: ['editor'] })).toBe(true)
    expect(await run(read, { id: 2 })).toBe(true)
  })

  it('lets admins update', async () => {
    expect(await run(update, { id: 1, roles: ['admin'] })).toBe(true)
    expect(await run(update, { id: 1, roles: ['editor', 'admin'] })).toBe(true)
  })

  it('denies logged-in users whose roles list lacks admin', async () => {
    expect(await run(update, { id: 1, roles: ['editor'] })).toBe(false)
    expect(await run(update, { id: 1, roles: [] })).toBe(false)
  })

  it('falls back to any logged-in user when the user has no roles list', async () => {
    expect(await run(update, { id: 1 })).toBe(true)
    expect(await run(update, { id: 1, roles: 'admin' })).toBe(true)
  })
})

describe('findPermissiveSettingsAccess', () => {
  it('flags only the update fallback when the user collection has no roles field', () => {
    const config = configWithUserFields([{ name: 'name', type: 'text' }])
    expect(findPermissiveSettingsAccess(betterEditorSettingsGlobal, config)).toEqual(['update'])
  })

  it('flags nothing for the defaults when the user collection has a roles field', () => {
    const config = configWithUserFields([{ name: 'roles', type: 'select', hasMany: true, options: ['admin'] }])
    expect(findPermissiveSettingsAccess(betterEditorSettingsGlobal, config)).toEqual([])
  })

  it('finds a roles field nested in tabs and rows', () => {
    const config = configWithUserFields([
      { type: 'tabs', tabs: [{ label: 'a', fields: [{ type: 'row', fields: [{ name: 'roles', type: 'select' }] }] }] },
    ])
    expect(findPermissiveSettingsAccess(betterEditorSettingsGlobal, config)).toEqual([])
  })

  it('reads the user collection slug from admin.user', () => {
    const config = {
      admin: { user: 'staff' },
      collections: [
        { slug: 'users', fields: [{ name: 'roles', type: 'select' }] },
        { slug: 'staff', fields: [] },
      ],
    } as unknown as Config
    expect(findPermissiveSettingsAccess(betterEditorSettingsGlobal, config)).toEqual(['update'])
  })

  it('flags an unset update, which Payload opens to any logged-in user', () => {
    const global = { ...betterEditorSettingsGlobal, access: { read: () => true } }
    const config = configWithUserFields([{ name: 'roles', type: 'select' }])
    expect(findPermissiveSettingsAccess(global, config)).toEqual(['update'])
  })

  it('accepts explicitly configured functions, even allow-all ones', () => {
    const global = { ...betterEditorSettingsGlobal, access: { read: () => true, update: () => true } }
    expect(findPermissiveSettingsAccess(global, configWithUserFields([]))).toEqual([])
  })

  it('does not flag an unset read, which Payload limits to logged-in users', () => {
    const global = { ...betterEditorSettingsGlobal, access: { update: () => false } }
    expect(findPermissiveSettingsAccess(global, configWithUserFields([]))).toEqual([])
  })
})

describe('settingsOverrides', () => {
  it('keeps the default global when unset', () => {
    const config = betterEditor({ collections: ['pages'] })({ collections: [] } as unknown as Config)
    expect(settingsGlobal(config).access).toBe(betterEditorSettingsGlobal.access)
  })

  it('registers the overridden global with its slug pinned', () => {
    const update = () => false
    const config = betterEditor({
      collections: ['pages'],
      settingsOverrides: ({ defaultGlobal }) => ({
        ...defaultGlobal,
        slug: 'renamed',
        access: { ...defaultGlobal.access, update },
      }),
    })({ collections: [] } as unknown as Config)
    expect(settingsGlobal(config).access?.update).toBe(update)
    expect(config.globals?.some((g) => g.slug === 'renamed')).toBe(false)
  })
})

describe('permissive access warning', () => {
  it('warns once per process and checks a host-registered settings global', async () => {
    vi.resetModules()
    const { betterEditor: fresh } = await import('../../src/index')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const ownGlobal = { slug: BETTER_EDITOR_SETTINGS_SLUG, fields: [] } as GlobalConfig

    fresh({ collections: ['pages'] })({ collections: [], globals: [ownGlobal] } as unknown as Config)
    fresh({ collections: ['pages'] })({ collections: [], globals: [ownGlobal] } as unknown as Config)

    const accessWarnings = warn.mock.calls.filter(([msg]) => String(msg).includes('permissive'))
    expect(accessWarnings).toHaveLength(1)
    expect(accessWarnings[0][0]).toContain('any logged-in user can update it')
    expect(accessWarnings[0][0]).not.toContain('anyone can read it')
  })

  it('warns for the plugin default when the user has no roles field', async () => {
    vi.resetModules()
    const { betterEditor: fresh } = await import('../../src/index')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    fresh({ collections: ['pages'] })(configWithUserFields([{ name: 'name', type: 'text' }]))

    const accessWarnings = warn.mock.calls.filter(([msg]) => String(msg).includes('permissive'))
    expect(accessWarnings).toHaveLength(1)
    expect(accessWarnings[0][0]).toContain('any logged-in user can update it')
  })

  it('stays silent for the plugin default when the user has a roles field', async () => {
    vi.resetModules()
    const { betterEditor: fresh } = await import('../../src/index')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    fresh({ collections: ['pages'] })(
      configWithUserFields([{ name: 'roles', type: 'select', hasMany: true, options: ['admin'] }]),
    )

    expect(warn.mock.calls.some(([msg]) => String(msg).includes('permissive'))).toBe(false)
  })

  it('stays silent when update is overridden even without a roles field', async () => {
    vi.resetModules()
    const { betterEditor: fresh } = await import('../../src/index')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    fresh({
      collections: ['pages'],
      settingsOverrides: ({ defaultGlobal }) => ({
        ...defaultGlobal,
        access: { ...defaultGlobal.access, update: () => true },
      }),
    })(configWithUserFields([]))

    expect(warn.mock.calls.some(([msg]) => String(msg).includes('permissive'))).toBe(false)
  })

  it('stays silent when both operations are configured', async () => {
    vi.resetModules()
    const { betterEditor: fresh } = await import('../../src/index')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    fresh({
      collections: ['pages'],
      settingsOverrides: ({ defaultGlobal }) => ({
        ...defaultGlobal,
        access: { read: () => true, update: () => true },
      }),
    })({ collections: [] } as unknown as Config)

    expect(warn.mock.calls.some(([msg]) => String(msg).includes('permissive'))).toBe(false)
  })
})
