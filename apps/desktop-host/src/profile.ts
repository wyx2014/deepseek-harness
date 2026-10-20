/** Profile loading against the packages carried by the Desktop runtime. */
import { join } from 'node:path'
import { loadProfileDirectory } from '@deepseek-ai/dsh-app-boot'
import type { ResolvedProfileRuntime } from '@deepseek-ai/dsh/profile-boot'

/**
 * Load the external profile using the complete packaged installation as its module lookup anchor.
 * @param runtimeDir - Prepared or ASAR-contained Desktop package tree.
 * @param projectDir - User-owned Desktop plugin profile.
 * @returns Profile layers and the installation manifest used by the Host resolver.
 */
export function loadDesktopProfile(runtimeDir: string, projectDir: string): ResolvedProfileRuntime {
  const installAnchor = join(runtimeDir, 'package.json')
  return { profile: loadProfileDirectory('dsh', projectDir, installAnchor), installAnchor }
}
