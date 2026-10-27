/** Package terminal launch scripts that reuse the installed Electron runtime. */

import { chmodSync, copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Copy the platform launcher into the application's public command directory.
 * @param destination - Physical runtime/cli directory prepared for the application.
 * @param platform - Target Desktop operating system.
 * @param linuxExecutableName - Stable application executable name selected by the product.
 */
export function prepareDesktopCli(destination: string, platform: 'darwin' | 'win32' | 'linux', linuxExecutableName = 'deepseek-harness'): void {
  const name = platform === 'win32' ? 'dsh.cmd' : 'dsh'
  const command = join(destination, 'bin', name)
  mkdirSync(join(destination, 'bin'), { recursive: true })
  if (platform === 'linux') {
    if (!/^[a-z0-9][a-z0-9-]*$/u.test(linuxExecutableName)) throw new Error('desktop CLI: invalid Linux executable name')
    const template = readFileSync(join(import.meta.dirname, '..', 'cli', 'dsh-linux'), 'utf8')
    writeFileSync(command, template.replace('@EXECUTABLE@', linuxExecutableName))
  } else {
    copyFileSync(join(import.meta.dirname, '..', 'cli', name), command)
  }
  if (platform !== 'win32') chmodSync(command, 0o755)
}
