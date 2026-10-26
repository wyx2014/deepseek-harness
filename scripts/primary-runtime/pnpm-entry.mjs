#!/usr/bin/env node
/** Run bundled pnpm with bounded recovery from Windows file-sharing violations. */
import fs from 'node:fs'

if (process.platform === 'win32') {
  const rename = fs.rename
  // write-file-atomic uses callback fs.rename directly, bypassing pnpm's own
  // retry helper. Keep recovery inside this pnpm process and retry only the
  // atomic rename: never repeat an install or remove the destination file.
  fs.rename = (source, destination, callback) => {
    const deadline = performance.now() + 5000
    let delay = 10
    const attempt = () => rename(source, destination, (error) => {
      if (error === null || !['EPERM', 'EACCES', 'EBUSY'].includes(error.code)) {
        callback(error)
        return
      }
      const remaining = deadline - performance.now()
      if (remaining <= 0) { callback(error); return }
      setTimeout(() => {
        if (performance.now() >= deadline) callback(error)
        else attempt()
      }, Math.min(delay, remaining))
      delay = Math.min(delay * 2, 100)
    })
    attempt()
  }
}

// Preserve the upstream launcher, version checks, arguments and relative paths.
await import('./pnpm-vendor.mjs')
