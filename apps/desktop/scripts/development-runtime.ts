/** Reuse complete development interpreters whose recorded inputs match the current lock. */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parsePrimaryRuntime, workspaceDependencyPaths } from '../../../packages/skill/tool-workspace-dependencies/src/index.ts'
import { primaryRuntimePayloadDigest, type PrimaryRuntimeTarget } from '../../../scripts/primary-runtime/prepare.ts'
import lock from '../../../scripts/primary-runtime/lock.json' with { type: 'json' }

/**
 * Check existing development resources without extracting archives or executing interpreters.
 * Missing or outdated resources require preparation; malformed metadata stops startup.
 * @param runtime - Resource directory containing primary-runtime and office-skills.
 * @param target - Current desktop target.
 * @param version - Current desktop version.
 * @param pnpmVersion - Installed package-manager version included in the payload.
 * @returns Whether recorded inputs and required runtime entries permit reuse.
 */
export function canReuseDevelopmentRuntime(runtime: string, target: PrimaryRuntimeTarget, version: string, pnpmVersion: string): boolean {
  const root = join(runtime, 'primary-runtime')
  const path = join(root, 'runtime.json')
  if (!existsSync(path)) return false
  const manifest = parsePrimaryRuntime(JSON.parse(readFileSync(path, 'utf8')))
  if (manifest.desktopVersion !== version || manifest.pnpm !== pnpmVersion
    || manifest.payloadDigest !== primaryRuntimePayloadDigest(target, lock, pnpmVersion)
    || manifest.platform !== (target === 'win-x64' ? 'win32' : 'darwin')
    || manifest.arch !== (target.endsWith('arm64') ? 'arm64' : 'x64')) return false
  const entries = workspaceDependencyPaths(root, manifest)
  return [entries.python, entries.pythonPackages, entries.node, entries.nodePackages, entries.pnpm,
    join(runtime, 'office-skills', 'scripts', 'check_office.py')].every(entry => entry !== undefined && existsSync(entry))
}
