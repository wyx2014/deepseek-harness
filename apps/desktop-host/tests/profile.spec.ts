import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { createRuntimeResolution, initProfile } from '@deepseek-ai/dsh-app-boot'
import { installRuntimeInterception } from '../../../packages/boot/app-boot/src/profile-resolution/resolver.ts'
import { loadDesktopProfile } from '../src/profile.ts'

it('imports a bundled product plugin from an external profile without installing a second copy', async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'desktop-product-profile-')))
  const runtime = join(root, 'app.asar', 'dsh')
  const home = join(root, 'home')
  const project = join(home, 'profiles', 'desktop')
  const productName = '@product/appearance'
  const writePackage = (directory: string, manifest: object): void => {
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'package.json'), JSON.stringify(manifest))
  }
  try {
    writePackage(runtime, { name: 'desktop-runtime', dependencies: {
      '@deepseek-ai/dsh': '1.0.0', [productName]: '1.0.0',
    } })
    writePackage(join(runtime, 'node_modules/@deepseek-ai/dsh'), { name: '@deepseek-ai/dsh', dependencies: {} })
    const product = join(runtime, 'node_modules', productName)
    writePackage(product, { name: productName, version: '1.0.0', exports: './index.cjs',
      dsh: { bundle: { patch: './bundle.yml' } } })
    writeFileSync(join(product, 'bundle.yml'), `- insert:\n    - id: appearance\n      name: '${productName}'\n`)
    writeFileSync(join(product, 'index.cjs'), 'module.exports = { productAppearance: true }\n')
    initProfile(project, [productName])
    const resolved = loadDesktopProfile(runtime, project)
    expect(resolved.profile.skippedBundles).toEqual([])
    const resolution = await createRuntimeResolution({ ...resolved, home })
    const interception = installRuntimeInterception(resolution)
    try {
      const require = createRequire(join(project, 'cordis.yml'))
      expect(require(productName)).toEqual({ productAppearance: true })
      expect(realpathSync(require.resolve(productName))).toBe(realpathSync(join(product, 'index.cjs')))
    } finally { interception.dispose() }
  } finally { rmSync(root, { recursive: true, force: true }) }
})
