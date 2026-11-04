import { mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DESKTOP_PRODUCT_FILE, readDesktopProduct, readDesktopProductBundles } from '../src/product.ts'
import { createPluginProfile, DesktopProjectManager } from '../src/project-manager.ts'
import { resolveDesktopPaths } from '../src/paths.ts'
import { writeDesktopRuntime } from '../src/runtime-tree.ts'
import { runtimeFixture, writePackage } from './runtime-fixture.ts'

const roots: string[] = []
function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'desktop-product-'))
  roots.push(root)
  return root
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

describe('bundled Desktop products', () => {
  it('resolves build inputs beside the product configuration without recording absolute paths in profile defaults', () => {
    const root = temporaryRoot()
    writeFileSync(join(root, 'prepare.mjs'), '')
    const config = join(root, 'product.json')
    const value = { schemaVersion: 1, productName: 'Example Desktop', artifactPrefix: 'example-desktop', appId: 'com.example.desktop',
      prepare: './prepare.mjs', packages: 'packed', bundles: ['@example/desktop'] }
    writeFileSync(config, JSON.stringify(value))
    expect(readDesktopProduct(config)).toEqual({ config, productName: value.productName, artifactPrefix: value.artifactPrefix,
      appId: value.appId, prepare: join(root, 'prepare.mjs'), packages: join(root, 'packed'), bundles: value.bundles })
    for (const override of [{ packages: '../outside' }, { bundles: ['link:/source'] }, { bundles: ['x', 'x'] },
      { productName: '../name' }, { artifactPrefix: '${version}' }, { appId: 'invalid' }, { schemaVersion: 2 }]) {
      writeFileSync(config, JSON.stringify({ ...value, ...override }))
      expect(() => readDesktopProduct(config)).toThrow(/desktop product/u)
    }
  })

  it('enables packaged bundles on first launch and preserves user disabling on later launches', async () => {
    const root = temporaryRoot()
    const dsh = join(root, 'relocated-installation')
    const original = runtimeFixture(dsh)
    const name = '@example/desktop'
    const pkg = writePackage(join(dsh, 'node_modules'), name, { dsh: { bundle: { patch: './bundle.yml' } } })
    writeFileSync(join(pkg, 'bundle.yml'), '[]\n')
    writeFileSync(join(dsh, DESKTOP_PRODUCT_FILE), JSON.stringify({ schemaVersion: 1, bundles: [name] }))
    writeDesktopRuntime(dsh, original.release, [...original.sharedPackages.map(pkg => pkg.name), name])
    const manager = new DesktopProjectManager(resolveDesktopPaths(join(root, 'new-user')), { dsh })
    await manager.applyRelease()
    const path = join(manager.paths.profile, 'package.json')
    const manifest = JSON.parse(readFileSync(path, 'utf8')) as { dsh: { profile: { bundles: string[] } } }
    expect(manifest.dsh.profile.bundles).toEqual(['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', name])
    expect(readFileSync(path, 'utf8')).not.toContain(root)
    await manager.disableAllPlugins()
    await manager.applyRelease()
    expect((JSON.parse(readFileSync(path, 'utf8')) as typeof manifest).dsh.profile.bundles).not.toContain(name)
  })

  it('rejects a missing product package or missing sealed defaults before profile creation', async () => {
    const root = temporaryRoot()
    const dsh = join(root, 'runtime')
    const original = runtimeFixture(dsh)
    writeFileSync(join(dsh, DESKTOP_PRODUCT_FILE), JSON.stringify({ schemaVersion: 1, bundles: ['@example/missing'] }))
    writeDesktopRuntime(dsh, original.release, original.sharedPackages.map(pkg => pkg.name))
    const manager = new DesktopProjectManager(resolveDesktopPaths(join(root, 'new-user')), { dsh })
    await expect(manager.applyRelease()).rejects.toThrow(/omits bundle/u)
    unlinkSync(join(dsh, DESKTOP_PRODUCT_FILE))
    await expect(manager.applyRelease()).rejects.toThrow(/ENOENT/u)
  })

  it('adds shipped features to an existing profile while retaining its settings and session files', async () => {
    const root = temporaryRoot()
    const dsh = join(root, 'runtime')
    const original = runtimeFixture(dsh)
    const names = ['@example/desktop', '@example/memory', '@example/archives', '@example/usage']
    for (const name of names) {
      const pkg = writePackage(join(dsh, 'node_modules'), name, { dsh: { bundle: { patch: './bundle.yml' } } })
      writeFileSync(join(pkg, 'bundle.yml'), '[]\n')
    }
    writeFileSync(join(dsh, DESKTOP_PRODUCT_FILE), JSON.stringify({ schemaVersion: 1, bundles: names }))
    writeDesktopRuntime(dsh, original.release, [...original.sharedPackages.map(pkg => pkg.name), ...names])
    const manager = new DesktopProjectManager(resolveDesktopPaths(join(root, 'existing-user')), { dsh })
    createPluginProfile(manager.paths.profile)
    const path = join(manager.paths.profile, 'package.json')
    const manifest = JSON.parse(readFileSync(path, 'utf8')) as { description: string; dsh: { profile: { bundles: string[] } } }
    manifest.description = 'User profile metadata'
    manifest.dsh.profile.bundles.push(names[0]!)
    writeFileSync(path, JSON.stringify(manifest))
    const patch = join(manager.paths.profile, 'cordis.patch.yml')
    writeFileSync(patch, '# user settings\n[]\n')
    const session = join(root, 'existing-user', 'existing-session.jsonl')
    writeFileSync(session, 'existing conversation bytes\n')

    await manager.applyRelease()

    const upgraded = JSON.parse(readFileSync(path, 'utf8')) as typeof manifest
    expect(upgraded.dsh.profile.bundles).toEqual(['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', ...names])
    expect(upgraded.description).toBe(manifest.description)
    expect(readFileSync(patch, 'utf8')).toBe('# user settings\n[]\n')
    expect(readFileSync(session, 'utf8')).toBe('existing conversation bytes\n')
  })

  it('keeps older base runtimes usable and rejects malformed product metadata', () => {
    const root = temporaryRoot()
    expect(readDesktopProductBundles(root)).toEqual([])
    mkdirSync(join(root, 'nested'))
    writeFileSync(join(root, DESKTOP_PRODUCT_FILE), '{broken')
    expect(() => readDesktopProductBundles(root)).toThrow()
  })

  it('enables each new product default once and retains later bundle removals and external plugins', () => {
    const profile = join(temporaryRoot(), 'desktop')
    const first = ['@example/ui', '@example/memory']
    createPluginProfile(profile, first)
    const path = join(profile, 'package.json')
    const manifest = JSON.parse(readFileSync(path, 'utf8')) as { dependencies: Record<string, string>; dsh: { profile: { bundles: string[] } } }
    manifest.dependencies['external-plugin'] = '1.0.0'
    manifest.dsh.profile.bundles = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', '@example/ui', 'external-plugin']
    writeFileSync(path, JSON.stringify(manifest))
    const next = [...first, '@example/archives', '@example/usage']

    createPluginProfile(profile, next)

    const upgraded = JSON.parse(readFileSync(path, 'utf8')) as typeof manifest
    expect(upgraded.dsh.profile.bundles).toEqual([...manifest.dsh.profile.bundles, '@example/archives', '@example/usage'])
    expect(upgraded.dependencies).toEqual(manifest.dependencies)
    upgraded.dsh.profile.bundles = upgraded.dsh.profile.bundles.filter(name => name !== '@example/usage')
    writeFileSync(path, JSON.stringify(upgraded))
    const removed = readFileSync(path, 'utf8')
    createPluginProfile(profile, next)
    expect(readFileSync(path, 'utf8')).toBe(removed)
  })

  it('keeps recovery effective on a legacy profile without product history', async () => {
    const root = temporaryRoot()
    const dsh = join(root, 'runtime')
    runtimeFixture(dsh)
    const manager = new DesktopProjectManager(resolveDesktopPaths(join(root, 'existing-user')), { dsh })
    createPluginProfile(manager.paths.profile)
    await manager.disableAllPlugins()
    createPluginProfile(manager.paths.profile, ['@example/ui', '@example/memory'])
    const manifest = JSON.parse(readFileSync(join(manager.paths.profile, 'package.json'), 'utf8')) as {
      dsh: { profile: { bundles: string[] } }
    }
    expect(manifest.dsh.profile.bundles).toEqual(['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'])
  })

  it.each([null, 1, ['@example/ui', 2], {}])('rejects malformed product history %j without replacing the profile', (history) => {
    const profile = join(temporaryRoot(), 'desktop')
    createPluginProfile(profile)
    const path = join(profile, 'package.json')
    const manifest = JSON.parse(readFileSync(path, 'utf8')) as object
    const saved = JSON.stringify({ ...manifest, dshDesktopProductBundles: history })
    writeFileSync(path, saved)
    expect(() => createPluginProfile(profile, ['@example/ui'])).toThrow(/dshDesktopProductBundles/u)
    expect(readFileSync(path, 'utf8')).toBe(saved)
  })

  it.each([{ dsh: 'broken' }, { dsh: { profile: 'broken' } }, { dsh: { profile: { bundles: 1 } } }])(
    'rejects invalid profile bundle metadata %j without replacing it', (value) => {
      const profile = join(temporaryRoot(), 'desktop')
      createPluginProfile(profile)
      const path = join(profile, 'package.json')
      const saved = JSON.stringify(value)
      writeFileSync(path, saved)
      expect(() => createPluginProfile(profile, ['@example/ui'])).toThrow(/desktop project/u)
      expect(readFileSync(path, 'utf8')).toBe(saved)
    },
  )
})
