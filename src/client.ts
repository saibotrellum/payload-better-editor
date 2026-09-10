/**
 * The button rendered in `beforeDocumentControls` that toggles the
 * Better Editor overlay. Auto-injected by the plugin factory; consumers
 * usually don't render it directly.
 */
export { LiveEditorToggle } from './admin/LiveEditorToggle.js'
export type { LiveEditorToggleProps } from './admin/LiveEditorToggle.js'

/**
 * Posts unsaved form values into the overlay's preview iframe. Auto-injected by
 * the plugin factory into `views.edit.livePreview`; consumers usually don't render
 * it directly. Pass `livePreviewData: false` to the plugin to leave that slot alone.
 */
export { LivePreviewDataChannel } from './admin/LivePreviewDataChannel.js'
export type { LivePreviewDataChannelProps } from './admin/LivePreviewDataChannel.js'

/**
 * The full editor overlay (preview iframe + 3-tab sidebar). Mounted into
 * the Payload admin shell when the toggle opens it. Exported so consumers
 * can build a custom toggle / wrapper if they need to bypass the
 * auto-injected button.
 */
export { LiveEditorOverlay } from './admin/LiveEditorOverlay.js'
export type { LiveEditorOverlayProps } from './admin/LiveEditorOverlay.js'

/**
 * Banner shown at the top of the `BetterEditorSettings` global. Wired up
 * automatically; hide it via `betterEditor({ showSettingsBanner: false })`.
 */
export { SettingsBanner } from './admin/SettingsBanner.js'

/**
 * Read and drive the overlay's block selection from a component rendered
 * inside it - for a custom outline tree, a jump list, or any navigation UI
 * that should stay in step with what the sidebar is editing.
 *
 * `selectedBlockPath` is the form-state path of the selected block
 * (`layout.2.columns.0.content.1`); pass such a path to
 * `setSelectedBlockPath` to select it, or `null` to clear.
 *
 * @example
 *   import { useBlockSelection } from 'payload-better-editor/client'
 *
 *   const { selectedBlockPath, setSelectedBlockPath } = useBlockSelection()
 */
export { useBlockSelection } from './providers/BlockSelectionProvider.js'
/**
 * Register this as an app-level provider to share the selection with your own
 * UI - it has to sit above both the toggle and your component, and slot-
 * rendered components are siblings of each other:
 *
 *   admin: { components: { providers: [
 *     'payload-better-editor/client#BlockSelectionProvider',
 *   ] } }
 */
export { BlockSelectionProvider } from './providers/BlockSelectionProvider.js'
export type { BlockSelection } from './providers/BlockSelectionProvider.js'

export { useIsolatedDraft, IsolatedDraftProvider } from './state/useIsolatedDraft.js'
export type { IsolatedDraftContextValue } from './state/useIsolatedDraft.js'

/**
 * Spread these props on every block wrapper in your frontend so the
 * Better Editor can target it. The plugin uses the resulting
 * `data-better-editor-id` attribute for hover outlines, click-to-focus,
 * the in-iframe action toolbar, and selection sync.
 *
 * @example
 *   import { getBlockProps } from 'payload-better-editor/client'
 *
 *   <section {...getBlockProps(block)}>...</section>
 */
export const getBlockProps = (
  block: { id?: string | null },
): Record<string, string> =>
  block.id ? { 'data-better-editor-id': block.id } : {}
