/**
 * Product startup cover drawn by index.html over the boot page, after the reference desktop's launch screen:
 * the logo settles first, then the cover fades once the application has mounted or reported a failure.
 * The desktop loads this page in a hidden window that still reports itself visible, and shows it only after its
 * Host starts; the entrance and every limit therefore begin when the carrier says the page is first seen.
 */

/** Longest wait for the logo animation before the cover may leave. */
const ANIMATION_LIMIT_MS = 1000
/** A load still running this long after the page appears shows the boot page's progress and failures instead. */
const READY_LIMIT_MS = 30_000
/** Matches the cover's opacity transition, with margin, before it leaves the document. */
const REMOVE_DELAY_MS = 500

/**
 * Settle once a browser tab is first visible.
 * @param doc - document whose visibility is observed.
 * @returns resolves when the page is visible.
 */
export function documentShown(doc: Document = document): Promise<void> {
  return new Promise((resolve) => {
    if (doc.visibilityState !== 'hidden') { resolve(); return }
    const listener = (): void => {
      if (doc.visibilityState === 'hidden') return
      doc.removeEventListener('visibilitychange', listener)
      resolve()
    }
    doc.addEventListener('visibilitychange', listener)
  })
}

/**
 * Fade the startup cover once its logo animation and the application are both done.
 * @param ready - settles after the application mounts or reports a failure.
 * @param shown - settles when the page is first seen; a rejection counts as shown.
 * @param doc - document holding the cover.
 */
export function revealWhenReady(ready: Promise<unknown>, shown: Promise<unknown>, doc: Document = document): void {
  const cover = doc.getElementById('dsh-startup')
  if (cover === null) return
  const logo = cover.querySelector<HTMLImageElement>('[data-startup-logo]')
  const win = doc.defaultView
  let animated = false
  let loaded = false
  let finished = false
  const finish = (): void => {
    if (finished || !animated || !loaded) return
    finished = true
    doc.body.classList.add('dsh-startup-ready')
    win?.setTimeout(() => { cover.remove() }, REMOVE_DELAY_MS)
  }
  const markAnimated = (): void => { animated = true; finish() }
  const markLoaded = (): void => { loaded = true; finish() }
  void ready.then(markLoaded, markLoaded)
  const start = (): void => {
    doc.body.classList.add('dsh-startup-visible')
    // A missing image never animates, so the cover must not wait for it, even when it failed while hidden.
    if (logo === null || (logo.complete && logo.naturalWidth === 0 && logo.getAttribute('src'))
      || win?.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true) markAnimated()
    else {
      // Only the entrance ends; the breathing that follows repeats until the cover leaves.
      logo.addEventListener('animationend', markAnimated, { once: true })
      logo.addEventListener('error', markAnimated, { once: true })
      win?.setTimeout(markAnimated, ANIMATION_LIMIT_MS)
    }
    win?.setTimeout(markLoaded, READY_LIMIT_MS)
  }
  void shown.then(start, start)
}
