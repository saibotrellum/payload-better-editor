import type { Access } from 'payload'

/**
 * Default access of the auto-registered settings global.
 *
 * - `read`: logged-in users only.
 * - `update`: users whose `roles` list contains `admin`. A user record
 *   without a roles list falls back to "any logged-in user", so projects with
 *   a different role model are not locked out. That fallback is what the
 *   startup warning reports.
 */
export const defaultSettingsRead: Access = ({ req }) => Boolean(req.user)

export const defaultSettingsUpdate: Access = ({ req }) => {
  const user = req.user as { roles?: unknown } | null | undefined
  if (!user) return false
  if (!Array.isArray(user.roles)) return true
  return user.roles.includes('admin')
}
