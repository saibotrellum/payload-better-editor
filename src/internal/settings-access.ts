import type { Config, GlobalConfig } from 'payload'
import { defaultSettingsUpdate } from './default-access.js'

type FieldLike = {
  name?: string
  fields?: FieldLike[]
  tabs?: Array<{ fields?: FieldLike[] }>
}

const hasRolesField = (fields: FieldLike[] | undefined): boolean =>
  (fields ?? []).some(
    (f) =>
      f.name === 'roles' ||
      hasRolesField(f.fields) ||
      (f.tabs ?? []).some((tab) => hasRolesField(tab.fields)),
  )

/** Whether the admin user collection declares a `roles` field. */
const userCollectionHasRoles = (config: Config): boolean => {
  const slug = config.admin?.user ?? 'users'
  const collection = config.collections?.find((c) => c.slug === slug)
  return hasRolesField(collection?.fields as FieldLike[] | undefined)
}

/**
 * Lists the access operations on the settings global that still rely on a
 * permissive fallback. `update` is flagged when it is unset (Payload then
 * allows any logged-in user) or when it is the plugin default while the user
 * collection has no `roles` field, because the default then also allows any
 * logged-in user. `read` is never flagged: the plugin default and an unset
 * value both require a login. An explicitly configured function, even an
 * allow-all one, counts as a deliberate choice.
 */
export const findPermissiveSettingsAccess = (
  global: GlobalConfig,
  config: Config,
): Array<'read' | 'update'> => {
  const permissive: Array<'read' | 'update'> = []
  const update = global.access?.update
  if (!update) permissive.push('update')
  else if (update === defaultSettingsUpdate && !userCollectionHasRoles(config)) permissive.push('update')
  return permissive
}
