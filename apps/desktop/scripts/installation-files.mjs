/** Record every file shipped under the application's resources directory, so a damaged installation can name what is gone. */
import { readdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** File the list is written to, directly inside the resources directory; the application reads the same name. */
export const INSTALLATION_FILES_NAME = 'installation-files.json'

/**
 * Write the list of shipped files beside them. Call after the last step that changes the packaged files.
 * @param {string} resourcesDir Assembled application resources directory.
 * @returns {Promise<number>} Number of files recorded.
 */
export async function writeInstallationFiles(resourcesDir) {
  const files = []
  const walk = async (directory, prefix) => {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((left, right) => left.name < right.name ? -1 : 1)) {
      const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`
      if (entry.isDirectory()) await walk(join(directory, entry.name), path)
      else if (entry.isFile() && path !== INSTALLATION_FILES_NAME) files.push([path, (await stat(join(directory, entry.name))).size])
    }
  }
  await walk(resourcesDir, '')
  await writeFile(join(resourcesDir, INSTALLATION_FILES_NAME), `${JSON.stringify({ schemaVersion: 1, files })}\n`)
  return files.length
}
