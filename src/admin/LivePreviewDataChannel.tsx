'use client'

import { useAllFormFields, useDocumentInfo, useLivePreviewContext, useLocale } from '@payloadcms/ui'
import { reduceFieldsToValues } from 'payload/shared'
import { useEffect } from 'react'

export type LivePreviewDataChannelProps = {
  collectionSlug?: string
  globalSlug?: string
}

/**
 * Posts the current form values into the overlay's preview iframe, so the preview
 * reflects edits that have not been saved.
 *
 * ## Why this exists
 *
 * Payload ships this behaviour in `LivePreviewWindow`: on every form change it
 * reduces the form state to values and posts `{ type: 'payload-live-preview', data }`
 * to the iframe it rendered itself. A preview route running `useLivePreview` listens
 * for exactly that message.
 *
 * The overlay replaces that window, and replacing it removes the sender along with
 * it. Measured before this component existed: after one field edit the overlay's
 * iframe had received nothing at all, while Payload's own hidden iframe held two
 * `payload-live-preview` messages. Nothing errored - the data simply went to an
 * iframe nobody was looking at.
 *
 * ## Where it renders
 *
 * `admin.components.views.edit.livePreview`, which Payload's DefaultEditView renders
 * INSTEAD of its own `LivePreviewWindow` (`CustomLivePreview || <LivePreviewWindow/>`).
 * The plugin fills that slot for every configured entity, so a host gets this without
 * wiring anything. Occupying the slot is load-bearing twice over: it supplies the
 * sender, and it stops a second iframe from being mounted against the shared ref.
 *
 * It renders nothing. The slot is a mounting point, not a place in the layout - the
 * overlay owns the visible preview.
 *
 * ## What it does not do
 *
 * `payload-document-event` on save stays with the overlay's own selection sync, which
 * already posts it. This component is only the unsaved-edit half.
 */
export const LivePreviewDataChannel: React.FC<LivePreviewDataChannelProps> = ({
  collectionSlug,
  globalSlug,
}) => {
  const { iframeRef, url } = useLivePreviewContext()
  const [formState] = useAllFormFields()
  const { id } = useDocumentInfo()
  const locale = useLocale()

  useEffect(() => {
    // No iframe means the overlay is closed - there is nothing to talk to. This
    // stands in for Payload's `isLivePreviewing`, which tracks ITS toggle, not ours.
    const frame = iframeRef?.current
    if (!frame || !formState || !url) return

    const values = reduceFieldsToValues(formState, true)
    if (!values.id) values.id = id

    // Targeted at `url`, never '*': the message carries the whole document, including
    // unpublished fields, and a wildcard would hand it to any origin that framed us.
    frame.contentWindow?.postMessage(
      {
        type: 'payload-live-preview',
        collectionSlug,
        data: values,
        globalSlug,
        locale: locale?.code,
      },
      url,
    )
  }, [formState, iframeRef, url, id, collectionSlug, globalSlug, locale])

  return null
}

export default LivePreviewDataChannel
