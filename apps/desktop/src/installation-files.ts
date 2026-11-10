/**
 * Compare the installed application files with the list recorded when the package was built.
 *
 * Security software and interrupted installers remove or withhold individual files, and the first symptom is an
 * unrelated-looking startup error. The comparison runs only after a fatal failure, so startup pays nothing for it.
 */

import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

/** List written by `scripts/installation-files.mjs` directly inside the resources directory. */
export const INSTALLATION_FILES_NAME = 'installation-files.json'

/** Files compared at once; enough to finish thousands of files quickly without exhausting descriptors. */
const CONCURRENCY = 64

/** What the comparison found. */
export interface InstallationInspection {
  /** Files the package shipped. */
  readonly total: number
  /** Shipped files that no longer exist, as resources-relative paths with forward slashes. */
  readonly missing: readonly string[]
  /** Shipped files whose size differs; runtimes rewrite some caches in place, so this is recorded but not conclusive. */
  readonly changed: readonly string[]
}

/**
 * Inspect the installation under `resourcesDir`.
 * @param resourcesDir - Installed application resources directory.
 * @returns The comparison, or `undefined` when the package recorded no list (development runs, macOS, older builds)
 * or the list itself cannot be read.
 */
export async function inspectInstallation(resourcesDir: string): Promise<InstallationInspection | undefined> {
  let files: unknown
  try {
    const parsed = JSON.parse(await readFile(join(resourcesDir, INSTALLATION_FILES_NAME), 'utf8')) as { schemaVersion?: unknown; files?: unknown }
    if (parsed.schemaVersion !== 1) return undefined
    files = parsed.files
  } catch {
    return undefined
  }
  if (!Array.isArray(files) || !files.every((entry: unknown): entry is [string, number] => Array.isArray(entry)
    && typeof entry[0] === 'string' && typeof entry[1] === 'number')) return undefined
  const missing: string[] = []
  const changed: string[] = []
  let next = 0
  const worker = async (): Promise<void> => {
    for (let index = next++; index < files.length; index = next++) {
      const [path, size] = files[index] as [string, number]
      try {
        if ((await stat(join(resourcesDir, ...path.split('/')))).size !== size) changed.push(path)
      } catch {
        missing.push(path)
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  return { total: files.length, missing: missing.sort(), changed: changed.sort() }
}
