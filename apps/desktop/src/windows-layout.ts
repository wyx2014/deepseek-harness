/** Caption-overlay layout shared between main and preload. */

/** Windows and Linux application titlebar height in device-independent pixels. */
export const WINDOWS_TITLEBAR_HEIGHT = 40

/**
 * Whether the main window uses an in-app caption with native control overlays
 * and Application/Edit popup menus.
 * Windows and Linux share this layout; macOS uses hiddenInset traffic lights.
 * @param platform - Node platform identifier.
 * @returns Whether the platform uses the shared caption overlay.
 */
export function usesCaptionOverlay(platform: NodeJS.Platform = process.platform): boolean {
  return platform === 'win32' || platform === 'linux'
}
