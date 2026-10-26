// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { documentShown, revealWhenReady } from '../src/startup-splash.ts'

beforeEach(() => {
  vi.useFakeTimers()
  document.body.className = ''
  document.body.innerHTML = '<div id="root"></div><div id="dsh-startup"><img data-startup-logo /></div>'
})
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = '' })

const cover = () => document.getElementById('dsh-startup')
const logo = () => document.querySelector('[data-startup-logo]')!
const ready = () => document.body.classList.contains('dsh-startup-ready')
const shown = Promise.resolve()

describe('startup cover', () => {
  it('waits for both the logo animation and the application before fading out', async () => {
    let mounted!: () => void
    revealWhenReady(new Promise<void>((resolve) => { mounted = resolve }), shown)
    await vi.advanceTimersByTimeAsync(0)
    logo().dispatchEvent(new Event('animationend'))
    expect(ready()).toBe(false)
    mounted()
    await vi.advanceTimersByTimeAsync(0)
    expect(ready()).toBe(true)
    expect(cover()).not.toBeNull()
    await vi.advanceTimersByTimeAsync(500)
    expect(cover()).toBeNull()
  })

  it('lets a quick mount finish the animation, and reveals failures too', async () => {
    revealWhenReady(Promise.reject(new Error('boot failed')), shown)
    await vi.advanceTimersByTimeAsync(999)
    expect(ready()).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(ready()).toBe(true)
  })

  it('shows the boot page progress when loading runs long, and never waits for a missing logo', async () => {
    revealWhenReady(new Promise(() => {}), shown)
    await vi.advanceTimersByTimeAsync(0)
    logo().dispatchEvent(new Event('error'))
    await vi.advanceTimersByTimeAsync(29_999)
    expect(ready()).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(ready()).toBe(true)
  })

  it('starts the entrance and every limit only when the hidden desktop window is shown', async () => {
    let show!: () => void
    revealWhenReady(Promise.resolve(), new Promise<void>((resolve) => { show = resolve }))
    await vi.advanceTimersByTimeAsync(60_000)
    expect(document.body.classList.contains('dsh-startup-visible')).toBe(false)
    expect(ready()).toBe(false)
    show()
    await vi.advanceTimersByTimeAsync(0)
    expect(document.body.classList.contains('dsh-startup-visible')).toBe(true)
    await vi.advanceTimersByTimeAsync(999)
    expect(ready()).toBe(false)
    logo().dispatchEvent(new Event('animationend'))
    expect(ready()).toBe(true)
  })

  it('treats a browser tab as shown once it becomes visible', async () => {
    let state: DocumentVisibilityState = 'hidden'
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
    try {
      const seen = vi.fn()
      void documentShown().then(seen)
      await vi.advanceTimersByTimeAsync(0)
      expect(seen).not.toHaveBeenCalled()
      state = 'visible'
      document.dispatchEvent(new Event('visibilitychange'))
      await vi.advanceTimersByTimeAsync(0)
      expect(seen).toHaveBeenCalledOnce()
    } finally {
      Reflect.deleteProperty(document, 'visibilityState')
    }
  })

  it('does nothing without a cover', () => {
    document.body.innerHTML = '<div id="root"></div>'
    expect(() => { revealWhenReady(Promise.resolve(), shown) }).not.toThrow()
  })
})
