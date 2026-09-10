import type { CollectionConfig, Config, Field, GlobalConfig } from 'payload'
import type { BetterEditorConfig } from './types.js'
import { BETTER_EDITOR_SETTINGS_BANNER_FIELD, betterEditorSettingsGlobal } from './global.js'
import { normalizeEntities } from './internal/entities.js'
import { translations as builtinTranslations } from './i18n/index.js'
import { mergeTranslations } from './i18n/merge.js'

export type { BetterEditorConfig }
export type { BetterEditorSettings, HoverToolbarPosition } from './state/useBetterEditorSettings.js'
export type { SidebarPosition } from './internal/constants.js'
export type { BetterEditorTranslations } from './i18n/types.js'
export { BETTER_EDITOR_SETTINGS_SLUG, betterEditorSettingsGlobal } from './global.js'

/** Plugin signature — handy for typing plugin lists in consumer code. */
export type BetterEditorPlugin = (config: Config) => Config

export { VERSION } from './version.js'

const DEFAULT_BLOCKS_FIELD = 'layout'
const TOGGLE_COMPONENT_PATH = 'payload-better-editor/client#LiveEditorToggle'
const DATA_CHANNEL_COMPONENT_PATH = 'payload-better-editor/client#LivePreviewDataChannel'
const isDev = process.env.NODE_ENV !== 'production'

/**
 * Checks whether a field with the given `name` exists at the document's
 * top-level data path. Recurses into presentational containers that do
 * not introduce a path segment (`tabs` without a name, `row`, `collapsible`)
 * but stops at `group` and named tabs, since those namespace their children.
 */
const hasBlocksField = (fields: Field[] | undefined, name: string): boolean => {
  if (!Array.isArray(fields)) return false
  return fields.some((field) => {
    if ('name' in field && field.name === name) return true
    if (field.type === 'row' || field.type === 'collapsible') {
      return hasBlocksField(field.fields, name)
    }
    if (field.type === 'tabs') {
      return field.tabs.some((tab) =>
        'name' in tab && tab.name ? false : hasBlocksField(tab.fields, name),
      )
    }
    return false
  })
}

type ToggleSlot = 'edit' | 'elements'

type ToggleClientProps = {
  blocksField: string
  adminPortalSelector?: string
  storageNamespace?: string
  hideToggleLabel?: boolean
  defaultOpen?: boolean
}

const withToggleInjected = <T extends CollectionConfig | GlobalConfig>(
  entity: T,
  slot: ToggleSlot,
  clientProps: ToggleClientProps,
): T => {
  const admin = { ...(entity.admin ?? {}) } as NonNullable<T['admin']>
  const components = { ...(admin.components ?? {}) } as Record<string, unknown>
  const target = { ...((components[slot] as Record<string, unknown>) ?? {}) }
  const before = (target.beforeDocumentControls as unknown[]) ?? []
  return {
    ...entity,
    admin: {
      ...admin,
      components: {
        ...components,
        [slot]: {
          ...target,
          beforeDocumentControls: [
            ...before,
            { path: TOGGLE_COMPONENT_PATH, clientProps },
          ],
        },
      },
    },
  }
}

/**
 * Fill `admin.components.views.edit.livePreview` with the data channel.
 *
 * Payload's DefaultEditView renders this slot INSTEAD of its own
 * `LivePreviewWindow` (`CustomLivePreview || <LivePreviewWindow/>`), which is what
 * this needs to achieve two things at once: the channel gets a mounting point, and
 * Payload stops rendering a second iframe against the ref the overlay shares with it.
 *
 * An entity that already declares a component here keeps it - a host that went to the
 * trouble of writing its own live-preview view means it.
 */
const withDataChannelInjected = <T extends CollectionConfig | GlobalConfig>(entity: T): T => {
  const admin = { ...(entity.admin ?? {}) } as NonNullable<T['admin']>
  const components = { ...(admin.components ?? {}) } as Record<string, unknown>
  const views = { ...((components.views as Record<string, unknown>) ?? {}) }
  const edit = { ...((views.edit as Record<string, unknown>) ?? {}) }

  if (edit.livePreview) return entity

  // The slug reaches the component through `useDocumentInfo()`, not through props -
  // see the note in LivePreviewDataChannel for why config plumbing does not work here.
  return {
    ...entity,
    admin: {
      ...admin,
      components: {
        ...components,
        views: {
          ...views,
          // `renderDocumentSlots` reads `LivePreview.Component` and nothing else, so
          // this key has to be `Component`. Writing the PayloadComponent object
          // straight into the slot (`{ path, clientProps }`) type-checks, ships, and
          // silently registers NOTHING - the slot is skipped, the channel never
          // mounts, and the preview stops receiving messages altogether.
          edit: { ...edit, livePreview: { Component: DATA_CHANNEL_COMPONENT_PATH } },
        },
      },
    },
  }
}

const warnMissingBlocksField = (kind: 'collection' | 'global', slug: string, blocksField: string) => {

  console.warn(
    `[better-editor] ${kind} "${slug}" has no top-level field named "${blocksField}" — the sidebar Blocks tab will be empty. Set \`blocksField\` to the actual blocks field name.`,
  )
}

/**
 * Payload CMS plugin factory for the Better Editor overlay. Adds an
 * "Open Better Editor" toggle to the configured collections / globals
 * and registers a `BetterEditorSettings` global with editor-wide options.
 *
 * @example
 *   import { betterEditor } from 'payload-better-editor'
 *
 *   export default buildConfig({
 *     plugins: [betterEditor({ collections: ['pages'] })],
 *     // ...
 *   })
 *
 * @see {@link BetterEditorConfig} for all options.
 */
export const betterEditor =
  (pluginOptions?: BetterEditorConfig): BetterEditorPlugin =>
  (config: Config): Config => {
    if (pluginOptions?.disabled) return config

    const defaultBlocksField = pluginOptions?.blocksField || DEFAULT_BLOCKS_FIELD
    const collectionMap = normalizeEntities(pluginOptions?.collections, defaultBlocksField)
    const globalMap = normalizeEntities(pluginOptions?.globals, defaultBlocksField)
    const injectDataChannel = pluginOptions?.livePreviewData !== false
    const toggleClientProps = (blocksField: string): ToggleClientProps => ({
      blocksField,
      adminPortalSelector: pluginOptions?.adminPortalSelector,
      storageNamespace: pluginOptions?.storageNamespace,
      hideToggleLabel: pluginOptions?.hideToggleLabel,
      defaultOpen: pluginOptions?.defaultOpen,
    })

    const showBanner = pluginOptions?.showSettingsBanner !== false
    const settingsGlobal: GlobalConfig = showBanner
      ? betterEditorSettingsGlobal
      : {
          ...betterEditorSettingsGlobal,
          fields: betterEditorSettingsGlobal.fields.filter(
            (f) => !('name' in f && f.name === BETTER_EDITOR_SETTINGS_BANNER_FIELD),
          ),
        }

    const existingGlobals = config.globals ?? []
    const hasSettingsGlobal = existingGlobals.some((g) => g.slug === settingsGlobal.slug)
    config.globals = hasSettingsGlobal
      ? existingGlobals
      : [...existingGlobals, settingsGlobal]

    const existingTranslations = (config.i18n?.translations ?? {}) as Record<
      string,
      Record<string, unknown> | undefined
    >
    config.i18n = {
      ...config.i18n,
      translations: {
        ...existingTranslations,
        ...Object.fromEntries(
          Object.entries(builtinTranslations).map(([locale, builtin]) => [
            locale,
            {
              ...(existingTranslations[locale] ?? {}),
              betterEditor: mergeTranslations(builtin, existingTranslations[locale]),
            },
          ]),
        ),
      },
    }

    if (collectionMap.size === 0 && globalMap.size === 0) {
      if (isDev) {

        console.warn(
          '[better-editor] plugin loaded with empty `collections` and `globals` — toggle button will not appear anywhere. Pass `collections: ["pages"]` (or similar) to BetterEditorConfig.',
        )
      }
      return config
    }

    if (collectionMap.size > 0 && config.collections) {
      config.collections = config.collections.map((collection) => {
        const blocksField = collectionMap.get(collection.slug)
        if (blocksField === undefined) return collection
        if (isDev && !hasBlocksField(collection.fields, blocksField)) {
          warnMissingBlocksField('collection', collection.slug, blocksField)
        }
        const withToggle = withToggleInjected(collection, 'edit', toggleClientProps(blocksField))
        return injectDataChannel ? withDataChannelInjected(withToggle) : withToggle
      })
    }

    if (globalMap.size > 0) {
      config.globals = (config.globals ?? []).map((global) => {
        const blocksField = globalMap.get(global.slug)
        if (blocksField === undefined) return global
        if (isDev && !hasBlocksField(global.fields, blocksField)) {
          warnMissingBlocksField('global', global.slug, blocksField)
        }
        const withToggle = withToggleInjected(global, 'elements', toggleClientProps(blocksField))
        return injectDataChannel ? withDataChannelInjected(withToggle) : withToggle
      })
    }

    return config
  }
