/** Product notice card shared by About and the first-close tray notice. */
import { BrowserWindow } from 'electron'
import { readFile } from 'node:fs/promises'

/** Copy supplied by the shell locale; nothing here comes from a product document. */
export interface AboutWindowCopy {
  readonly title: string
  /** Bold heading lines, one per row. */
  readonly heading: readonly string[]
  /** Plain note under the heading. */
  readonly note: string
  readonly ok: string
}

const WIDTH = 256
const HEIGHT = 312
const CONFIRMED = 'confirmed'
let open: BrowserWindow | undefined

/** Bring the open notice to the front, e.g. when the close button is pressed again. */
export function focusAboutWindow(): void { if (open !== undefined && !open.isDestroyed()) open.focus() }

const escapeHtml = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

/** Render the self-contained, script-light document; it only closes its own window. */
export function aboutWindowHtml(copy: AboutWindowCopy, icon: string | undefined, locale: string): string {
  return `<!doctype html>
<html lang="${escapeHtml(locale)}"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<title>${escapeHtml(copy.title)}</title>
<style>
:root { color-scheme: light dark; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  --bg: #f4f4f5; --ink: #1d1d1f; --meta: #303033; --primary: #0a0a0a; --primary-ink: #fafafa; }
@media (prefers-color-scheme: dark) { :root { --bg: #171717; --ink: #e8e8e8; --meta: #e2e2e2; --primary: #fafafa; --primary-ink: #0a0a0a; } }
* { box-sizing: border-box; }
html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: var(--bg); user-select: none; }
.card { height: 100%; padding: 22px 17px 16px; display: flex; flex-direction: column; color: var(--ink); -webkit-app-region: drag; }
.content { flex: 1; min-height: 0; }
.icon { width: 52px; height: 52px; display: block; border-radius: 12px; object-fit: contain;
  box-shadow: 0 10px 13px -3px rgb(0 0 0 / .2), 0 4px 5px -3px rgb(0 0 0 / .2); }
h1 { margin: 20px 0 0; font-size: 13.5px; line-height: 1.3; font-weight: 700; }
.meta { margin-top: 24px; font-size: 13px; line-height: 1.3; color: var(--meta); }
button { width: 100%; height: 36px; border: 0; border-radius: 18px; background: var(--primary); color: var(--primary-ink);
  font: inherit; font-size: 13px; font-weight: 500; outline: none; cursor: default; -webkit-app-region: no-drag; }
button:active { background: color-mix(in oklab, var(--primary) 80%, transparent); }
button:focus-visible { box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px var(--primary); }
</style></head><body>
<main class="card" role="dialog" aria-modal="true" aria-labelledby="title">
<div class="content">
${icon === undefined ? '' : `<img class="icon" src="${escapeHtml(icon)}" alt="">`}
<h1 id="title">${copy.heading.map(escapeHtml).join('<br>')}</h1>
<div class="meta">${escapeHtml(copy.note)}</div>
</div>
<button type="button" autofocus>${escapeHtml(copy.ok)}</button>
</main>
<script>
// Button and Enter confirm through the document title, which main observes; Escape only dismisses.
const confirm = () => { document.title = '${CONFIRMED}'; window.close(); };
document.querySelector('button').addEventListener('click', confirm);
addEventListener('keydown', (event) => { if (event.key === 'Enter') confirm(); else if (event.key === 'Escape') window.close(); });
</script></body></html>`
}

/**
 * Show the notice window and settle when it closes.
 * @param parent - Window blocked while the About window is open.
 * @param copy - Localized text.
 * @param iconPath - Product icon file; omitted from the card when unreadable.
 * @param locale - Language id for the document.
 * @returns true when confirmed with the button or Enter; false when dismissed.
 */
export async function showAboutWindow(
  parent: BrowserWindow | undefined, copy: AboutWindowCopy, iconPath: string, locale: string,
): Promise<boolean> {
  const icon = await readFile(iconPath).then(data => `data:image/png;base64,${data.toString('base64')}`, () => undefined)
  const modal = parent !== undefined && !parent.isDestroyed()
  const window = new BrowserWindow({
    width: WIDTH, height: HEIGHT, ...(modal ? { parent, modal: true } : {}), frame: false, resizable: false, minimizable: false,
    maximizable: false, fullscreenable: false, show: false, title: copy.title, skipTaskbar: modal,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  window.setMenuBarVisibility(false)
  open = window
  window.webContents.on('will-navigate', (event) => { event.preventDefault() })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  let confirmed = false
  window.webContents.on('page-title-updated', (event, title) => { event.preventDefault(); if (title === CONFIRMED) confirmed = true })
  await new Promise<void>((resolve) => {
    window.once('closed', () => { if (open === window) open = undefined; resolve() })
    window.once('ready-to-show', () => { window.show() })
    void window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(aboutWindowHtml(copy, icon, locale))}`)
      .catch(() => { if (!window.isDestroyed()) window.destroy() })
  })
  return confirmed
}
