'use client'

import { useRef } from 'react'
import { useLivePreviewContext } from '@payloadcms/ui'

/**
 * Payload's `previewURL` is not stable while a document is being edited.
 *
 * The server recomputes it after every save and pushes the result back into
 * the live-preview context. Verified against @payloadcms/ui 3.85.2:
 *
 *   utilities/buildFormState.js:205-219   `previewURL` is attached to the
 *                                         response ONLY when truthy, so a slow
 *                                         or throwing `admin.preview` callback
 *                                         drops the field entirely
 *   views/Edit/index.js:332               the client then runs
 *                                         `setPreviewURL(undefined)`
 *
 * With autosave enabled that path runs constantly, so the context value blinks
 * to `undefined` and back. Consumers that render from it directly pay for each
 * blink twice: the iframe `src` goes blank (full reload, theme flash) and
 * PreviewFrame's `useEffect` on `previewURL` re-raises the loading skeleton.
 *
 * Payload's own provider refuses to unmount its iframe for exactly this reason
 * (providers/LivePreview/index.js:26-29: "Rendering the iframe is a one-way
 * event, e.g. defer load and never unmount").
 *
 * This hook holds the last non-empty URL. `undefined` now means "no preview URL
 * has ever resolved", which is the real signal, rather than "the last save is
 * still in flight".
 */
export const useStablePreviewURL = (): string | undefined => {
  const { previewURL } = useLivePreviewContext()
  const lastGoodRef = useRef<string | undefined>(undefined)

  if (typeof previewURL === 'string' && previewURL.length > 0) {
    lastGoodRef.current = previewURL
  }

  return lastGoodRef.current
}
