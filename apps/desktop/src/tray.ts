/** Windows and Linux system tray: the always-present way back to a hidden window and the explicit quit entry. */

import { Menu, nativeImage, Tray } from 'electron'
import type { DesktopLocale } from './locale.ts'

/** Edge of the Linux tray bitmap: panels draw it at 16-24 px, and 64 px stays sharp at 200-400 % scale. */
export const LINUX_TRAY_ICON_SIZE = 64

/** Main-process actions the tray triggers; both run the same paths as the window and application menu. */
export interface DesktopTrayOptions {
  /**
   * Windows: multi-size ICO rendered by `scripts/render-tray-icon.ts`, from which Windows picks the bitmap for the display
   * scale. Linux: the product PNG, scaled to {@link size}.
   */
  readonly iconPath: string
  /** Square edge to scale the icon to; omitted keeps the file's own bitmaps. */
  readonly size?: number
  readonly locale: () => DesktopLocale
  /** Show and focus the primary window. */
  readonly open: () => void
  /** Request quit through the same confirmation as every other quit entry. */
  readonly quit: () => void
}

/** Tray icon present for the whole run, not only while the window is hidden. */
export class DesktopTray {
  private tray: Tray | undefined

  /** @param options - Icon path, locale reader, and the open and quit actions. */
  constructor(private readonly options: DesktopTrayOptions) {
    const image = nativeImage.createFromPath(options.iconPath)
    const tray = new Tray(options.size === undefined ? image : image.resize({ width: options.size, height: options.size, quality: 'best' }))
    this.tray = tray
    tray.on('click', () => { options.open() })
    this.relabel()
  }

  /** Rebuild the tooltip and context menu in the current locale. */
  relabel(): void {
    const tray = this.tray
    if (tray === undefined) return
    const { messages } = this.options.locale()
    tray.setToolTip(messages.aboutProduct)
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: messages.openApplication, click: () => { this.options.open() } },
      { type: 'separator' },
      { label: messages.quitApplication, click: () => { this.options.quit() } },
    ]))
  }

  /** Remove the icon; called once the quit is confirmed so no dead icon outlives the process. */
  dispose(): void {
    const tray = this.tray
    this.tray = undefined
    tray?.destroy()
  }
}
