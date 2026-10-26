/** Decide which cheap development artifacts `start:desktop` must rebuild before reusing the rest. */

import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** One artifact the launcher can rebuild on its own, with the sources that produce it. */
export interface DevelopmentArtifact {
  /** Label printed when the artifact is rebuilt. */
  readonly name: string
  /** Built file whose modification time stands for the whole artifact. */
  readonly output: string
  /** Files or directories whose newest modification invalidates the output. */
  readonly inputs: readonly string[]
}

/** Dependency and build directories never hold sources. */
const IGNORED = new Set(['node_modules', 'lib', 'dist', '.desktop-build'])

function newest(path: string): number {
  if (!existsSync(path)) return 0
  const stat = statSync(path)
  if (!stat.isDirectory()) return stat.mtimeMs
  let latest = 0
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (IGNORED.has(entry.name) || entry.name.startsWith('.')) continue
    latest = Math.max(latest, newest(join(path, entry.name)))
  }
  return latest
}

/**
 * Whether an artifact is missing or older than any of its sources. Check each artifact right before building it,
 * so one built from an earlier artifact's output sees that rebuild.
 * @param artifact - candidate artifact.
 * @returns true when the artifact must be rebuilt.
 */
export function developmentArtifactStale(artifact: DevelopmentArtifact): boolean {
  return !existsSync(artifact.output) || Math.max(0, ...artifact.inputs.map(newest)) > statSync(artifact.output).mtimeMs
}
