import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { HoverToolbarPosition } from '../internal/constants.js'
import { ACTIVE_CLASS, BLOCK_ID_ATTR, BLOCK_ID_SELECTOR } from '../internal/dom.js'
import type { BlockActionMessage } from './protocol.js'
import { TOOLBAR_ID } from './hover-css.js'
import { HoverToolbar, type HoverToolbarLabels } from './HoverToolbar.js'
import { calculateToolbarPosition } from './toolbar-position.js'
import type { BetterEditorTranslations } from '../i18n/types.js'

export type HoverToolbarOptions = {
  position: HoverToolbarPosition
  outlineWidth: number
  onAction: (id: string, action: BlockActionMessage['action']) => void
  labels: HoverToolbarLabels
}

export type { HoverToolbarLabels }

// The toolbar only needs the five short action labels, not the longer `*Label`
// aria variants in `blocks.actions` — pick them in one place so the two preview
// hooks that build a controller stay in sync.
export const toHoverToolbarLabels = (
  actions: BetterEditorTranslations['blocks']['actions'],
): HoverToolbarLabels => ({
  moveUp: actions.moveUp,
  moveDown: actions.moveDown,
  duplicate: actions.duplicate,
  addBelow: actions.addBelow,
  delete: actions.delete,
})

const FALLBACK_TB_WIDTH = 120
const FALLBACK_TB_HEIGHT = 32

export type SelectOptions = {
  scrollIntoView?: boolean
  smooth?: boolean
}

export class HoverToolbarController {
  private readonly doc: Document
  private opts: HoverToolbarOptions
  private readonly toolbar: HTMLDivElement
  private readonly root: Root
  private destroyed = false
  private currentBlockId: string | null = null
  private currentBlockEl: HTMLElement | null = null
  private activeChain: HTMLElement[] = []
  private positionRaf = 0
  private observerRaf = 0
  private pendingScrollBlockId: string | null = null
  private pendingScrollUntil = 0
  private readonly onScroll: () => void
  private readonly observer: MutationObserver

  constructor(doc: Document, opts: HoverToolbarOptions) {
    this.doc = doc
    this.opts = opts

    doc.getElementById(TOOLBAR_ID)?.remove()
    const toolbar = doc.createElement('div')
    toolbar.id = TOOLBAR_ID
    doc.body.appendChild(toolbar)
    this.toolbar = toolbar

    this.root = createRoot(toolbar)
    this.renderToolbar()

    this.onScroll = () => this.scheduleReposition()
    doc.defaultView?.addEventListener('scroll', this.onScroll, true)

    this.observer = new MutationObserver(() => {
      if (this.destroyed || !this.currentBlockId) return
      // Coalesce mutation bursts into a single re-select on the next paint.
      // Re-using positionRaf avoids the previous two-tier RAF pyramid.
      this.scheduleReselect()
    })
    this.observer.observe(doc.body, { childList: true, subtree: true })
  }

  private scheduleReselect(): void {
    const view = this.doc.defaultView
    if (!view || this.observerRaf) return
    this.observerRaf = view.requestAnimationFrame(() => {
      this.observerRaf = 0
      if (this.destroyed || !this.currentBlockId) return
      const shouldScroll =
        this.pendingScrollBlockId === this.currentBlockId && Date.now() <= this.pendingScrollUntil
      this.select(this.currentBlockId, { scrollIntoView: shouldScroll })
    })
  }

  update(opts: HoverToolbarOptions): void {
    this.opts = opts
    this.renderToolbar()
    if (this.currentBlockEl) this.scheduleReposition()
  }

  private renderToolbar(): void {
    this.root.render(
      React.createElement(HoverToolbar, {
        labels: this.opts.labels,
        onAction: (action) => {
          if (this.currentBlockId) {
            if (action === 'move-up' || action === 'move-down') {
              this.pendingScrollBlockId = this.currentBlockId
              this.pendingScrollUntil = Date.now() + 800
            }
            this.opts.onAction(this.currentBlockId, action)
          }
        },
      }),
    )
  }

  select(id: string, opts?: SelectOptions): void {
    if (this.destroyed) return

    const forceScroll = Boolean(opts?.scrollIntoView)
    if (forceScroll) {
      this.pendingScrollBlockId = id
      this.pendingScrollUntil = Date.now() + 800
    }

    const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id.replace(/["\\]/g, '\\$&')
    const el = this.doc.querySelector<HTMLElement>(`[${BLOCK_ID_ATTR}="${escaped}"]:not([data-preview-removed])`)
    if (!el) {
      // Block nicht im DOM (noch nicht) — ID merken, Toolbar ausblenden
      this.currentBlockId = id
      this.currentBlockEl = null
      this.clearActive()
      this.toolbar.classList.remove('is-visible')
      return
    }
    this.currentBlockId = id
    this.currentBlockEl = el
    this.markActiveChain(el)
    const isNested = this.activeChain.length > 1
    this.toolbar.dataset.nested = isNested ? '1' : '0'
    this.toolbar.classList.add('is-visible')
    this.scheduleReposition()

    const isPendingScroll =
      this.pendingScrollBlockId === id && Date.now() <= this.pendingScrollUntil
    this.scrollToElement(el, opts?.smooth !== false, forceScroll || isPendingScroll)

    // DOM-Fokus setzen ohne unkontrolliertes Scrollen
    if (!el.hasAttribute('tabindex')) {
      el.setAttribute('tabindex', '-1')
    }
    try {
      el.focus({ preventScroll: true })
    } catch {
      // Ignoriert
    }
  }

  deselect(): void {
    if (this.destroyed) return
    if (!this.currentBlockId) return
    this.pendingScrollBlockId = null
    this.pendingScrollUntil = 0
    this.clearActive()
    this.currentBlockId = null
    this.currentBlockEl = null
    this.toolbar.classList.remove('is-visible')
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.pendingScrollBlockId = null
    this.pendingScrollUntil = 0
    this.observer.disconnect()
    const view = this.doc.defaultView
    view?.removeEventListener('scroll', this.onScroll, true)
    if (this.positionRaf) view?.cancelAnimationFrame(this.positionRaf)
    if (this.observerRaf) view?.cancelAnimationFrame(this.observerRaf)
    this.positionRaf = 0
    this.observerRaf = 0
    this.clearActive()
    this.currentBlockId = null
    this.currentBlockEl = null
    // Defer unmount — React 19 throws if it lands synchronously mid-render of
    // another tree; StrictMode also double-invokes us, so only remove the
    // toolbar node if we still own it.
    const { root, toolbar } = this
    queueMicrotask(() => {
      try { root.unmount() } catch { /* already unmounted */ }
      if (toolbar.isConnected) toolbar.remove()
    })
  }

  private scheduleReposition(): void {
    const view = this.doc.defaultView
    if (!view) {
      this.positionToolbar()
      return
    }
    if (this.positionRaf) view.cancelAnimationFrame(this.positionRaf)
    this.positionRaf = view.requestAnimationFrame(() => {
      this.positionRaf = 0
      this.positionToolbar()
    })
  }

  private positionToolbar(): void {
    const el = this.currentBlockEl
    if (!el || !el.isConnected) return
    const view = this.doc.defaultView
    if (!view) return
    const { top, left } = calculateToolbarPosition(
      el.getBoundingClientRect(),
      {
        width: this.toolbar.offsetWidth || FALLBACK_TB_WIDTH,
        height: this.toolbar.offsetHeight || FALLBACK_TB_HEIGHT,
      },
      { scrollX: view.scrollX, scrollY: view.scrollY },
      this.opts.position,
      this.opts.outlineWidth,
    )
    const { style } = this.toolbar
    style.top = `${top}px`
    style.left = `${left}px`
    style.right = 'auto'
  }

  private scrollToElement(el: HTMLElement, smooth = true, forceCenter = false): void {
    const view = this.doc.defaultView
    if (!view) return

    const rect = el.getBoundingClientRect()
    const viewportHeight = view.innerHeight || this.doc.documentElement.clientHeight

    if (!forceCenter) {
      const isComfortablyVisible = rect.top >= 40 && rect.bottom <= viewportHeight - 20
      if (isComfortablyVisible) return
    }

    const absTop = view.scrollY + rect.top

    // Große Blöcke oben ausrichten (Platz für Toolbar), kleinere vertikal zentrieren.
    let targetY: number
    if (rect.height > viewportHeight - 80) {
      targetY = Math.max(0, absTop - 40)
    } else {
      targetY = Math.max(0, absTop - (viewportHeight - rect.height) / 2)
    }

    view.scrollTo({
      top: targetY,
      behavior: smooth ? 'smooth' : 'auto',
    })
  }

  // Only clears the chain we marked, avoiding a full-document scan.
  private clearActive(): void {
    for (const node of this.activeChain) node.classList.remove(ACTIVE_CLASS)
    this.activeChain = []
  }

  private markActiveChain(el: HTMLElement): void {
    this.clearActive()
    const chain: HTMLElement[] = []
    for (
      let cur: HTMLElement | null = el;
      cur;
      cur = cur.parentElement?.closest<HTMLElement>(BLOCK_ID_SELECTOR) ?? null
    ) {
      cur.classList.add(ACTIVE_CLASS)
      chain.push(cur)
    }
    this.activeChain = chain
  }
}
