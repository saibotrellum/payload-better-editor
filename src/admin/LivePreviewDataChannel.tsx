'use client'

export type LivePreviewDataChannelProps = {
  collectionSlug?: string
  globalSlug?: string
}

/**
 * Occupies Payload's live-preview slot and renders nothing.
 *
 * ## Why an empty component is the point
 *
 * `DefaultEditView` renders `CustomLivePreview || <LivePreviewWindow/>`. Leaving
 * the slot empty therefore mounts Payload's own window, which builds a SECOND
 * iframe against the shared ref - the overlay already owns the visible preview,
 * so the two fight over it. Filling the slot with a component that returns null
 * is what keeps that from happening.
 *
 * ## Why it no longer sends anything
 *
 * It used to be the sender too: on every form change it reduced form state to
 * values and posted `{ type: 'payload-live-preview', data }` into the iframe.
 * `useIsolatedDraft` now owns that channel, because the draft it posts is not
 * the form state - block order, additions and deletions live in the isolated
 * draft, and posting form state over the top of them put the old block list
 * back. Two senders on one channel also raced, and the loser was whichever
 * posted second.
 *
 * Keeping the props is deliberate: a host that mounts this component by hand
 * can still say which entity it is for, and removing them would be a breaking
 * change for no gain.
 *
 * ## What it does not do
 *
 * `payload-document-event` on save stays with the overlay's own selection sync,
 * which already posts it.
 */
export const LivePreviewDataChannel: React.FC<LivePreviewDataChannelProps> = () => null

export default LivePreviewDataChannel
