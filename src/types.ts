import type { CollectionSlug, GlobalSlug } from 'payload'

/** Per-entity overrides for a collection/global. */
export type BetterEditorEntityOptions = {
  /** Blocks-field name for this entity; falls back to the top-level `blocksField`. */
  blocksField?: string
}

export type BetterEditorConfig = {
  /** Skip plugin installation entirely (e.g. behind a feature flag). */
  disabled?: boolean
  /**
   * Collections that get the "Open Better Editor" toggle. Either a list of
   * slugs, or a slug → options record for per-collection settings (e.g. a
   * different `blocksField`). Each collection needs `admin.preview` configured
   * for the preview to render and the toggle to appear.
   */
  collections?: string[] | Partial<Record<CollectionSlug, BetterEditorEntityOptions>>
  /**
   * Globals that get the "Open Better Editor" toggle — a list of slugs or a
   * slug → options record. Each global needs `admin.preview` configured for the
   * toggle to appear.
   */
  globals?: string[] | Partial<Record<GlobalSlug, BetterEditorEntityOptions>>
  /**
   * Default name of the `blocks` field the sidebar targets. Top-level only;
   * nested paths (e.g. `content.layout`) are not supported. Per-collection
   * overrides via the `collections`/`globals` record take precedence.
   * Defaults to `'layout'`.
   */
  blocksField?: string
  /**
   * CSS selector for the Payload admin element the overlay portals into.
   * Override only if the default selector breaks against a future Payload
   * version. The plugin falls back to `<main>` and finally `<body>`.
   */
  adminPortalSelector?: string
  /**
   * Prefix for all `localStorage` keys the editor writes (sidebar width,
   * responsive viewport width, …). Set this if multiple Better Editor
   * instances share the same origin and would otherwise collide.
   * Defaults to `'better-editor'`.
   */
  storageNamespace?: string
  /**
   * Show the plugin info banner (version, GitHub links, "Report a bug")
   * at the top of the `BetterEditorSettings` global. Set to `false` to
   * hide it for end users. Defaults to `true`.
   */
  showSettingsBanner?: boolean
  /**
   * Hide the "Open/Close Better Editor" text next to the toggle button's icon,
   * leaving an icon-only button. The accessible label (`aria-label`/`title`)
   * is kept either way. Defaults to `false` (label shown).
   */
  hideToggleLabel?: boolean
  /**
   * Open the side-by-side editor as soon as a document is opened, instead of
   * waiting for the editor to switch it on.
   *
   * The state is per document, not remembered: closing the overlay applies to
   * the document at hand, and the next one opens with it showing again. That
   * is deliberate - a remembered close would turn one dismissal into a
   * permanent opt-out, which is what this option exists to replace.
   *
   * Defaults to `false`, so an existing install behaves exactly as before.
   */
  defaultOpen?: boolean
  /**
   * Claim `views.edit.livePreview` so the preview can reflect an edit before it
   * is saved. Requires the preview route to run Payload's `useLivePreview`; with
   * `RefreshRouteOnSave` instead, the preview keeps updating on save and this
   * changes nothing. Defaults to `true`.
   *
   * The name is older than the mechanism. The slot used to hold the sender; the
   * unsaved draft now goes out through `useIsolatedDraft`, and what the slot
   * does today is stay occupied. That is still load-bearing: left empty, Payload
   * renders its own `LivePreviewWindow` into it, which builds a SECOND iframe
   * against the same ref as the overlay's.
   *
   * Setting it to `false` gives that view back to Payload deliberately - a
   * second iframe, and a preview that updates only on save. Turn it off if you
   * want Payload's live-preview view alongside the overlay.
   */
  livePreviewData?: boolean
}
