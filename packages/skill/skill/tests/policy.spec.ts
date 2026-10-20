import { Context } from '@deepseek-ai/cordis'
import { createScope, scopeOf } from '@deepseek-ai/dsh-scope'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import { describe, expect, it } from 'vitest'

describe('skill management policy', () => {
  it('retries a changed discovery revision and preserves provider incompleteness', async () => {
    const ctx = new Context()
    try {
      await ctx.plugin(SkillRegistry)
      let calls = 0
      let complete = true
      ctx.skills.registerProvider(control => ({
        name: 'changing',
        async list() {
          if (++calls === 1) control.invalidate()
          return { candidates: [], complete }
        },
        async get() { return undefined },
      }))
      expect(await ctx.skills.inventory()).toEqual({ entries: [], complete: true })
      expect(calls).toBe(2)
      complete = false
      expect(await ctx.skills.inventory()).toEqual({ entries: [], complete: false })
    } finally { await ctx.fiber.dispose() }
  })
  it('selects only the nearest runtime definition across scopes', async () => {
    const ctx = new Context()
    try {
      await ctx.plugin(SkillRegistry)
      ctx.skills.register({ name: 'sample', description: 'Global', source: 'runtime', content: 'global' })
      const scope = createScope(ctx, { id: 'inventory-scope' })
      scope.ctx.get('skills')!.register({ name: 'sample', description: 'Scoped', source: 'runtime', content: 'scoped' })
      const inventory = await ctx.skills.inventory({ scope: scopeOf(scope.ctx)! })
      expect(inventory.complete).toBe(true)
      expect(inventory.entries.filter(entry => entry.selected).map(entry => entry.skill.description)).toEqual(['Scoped'])
      expect((await ctx.skills.get('sample', { scope: scopeOf(scope.ctx)! }))?.content).toBe('scoped')
    } finally { await ctx.fiber.dispose() }
  })
  it('denies every same-name provider, keeps management inventory and withdraws on disposal', async () => {
    const ctx = new Context()
    try {
      await ctx.plugin(SkillRegistry)
      ctx.skills.register({ name: 'sample', description: 'Runtime', source: 'runtime', content: 'runtime' })
      ctx.skills.registerProvider(() => ({ name: 'other', list: async () => [{ name: 'sample', description: 'Other', source: 'user', provider: 'other', rank: 500, locator: null, invocation: { modelInvocable: true, userInvocable: true } }], get: async candidate => ({ ...candidate, content: 'other' }) }))
      expect((await ctx.skills.list()).length).toBe(1)
      const policy = await ctx.plugin({ apply(inner) { inner.get('skills')!.registerPolicy(() => ({ allows: name => name !== 'sample' })) } })
      expect(await ctx.skills.snapshot()).toEqual({ complete: true, skills: [] })
      expect(await ctx.skills.get('sample')).toBeUndefined()
      const inventory = await ctx.skills.inventory()
      expect(inventory.entries.length).toBe(2)
      expect(inventory.entries.every(entry => !entry.enabled)).toBe(true)
      await policy.dispose()
      expect((await ctx.skills.get('sample'))?.content).toBe('runtime')
    } finally { await ctx.fiber.dispose() }
  })
  it('isolates a scoped deny and rechecks it after an asynchronous provider load', async () => {
    const ctx = new Context()
    try {
      await ctx.plugin(SkillRegistry)
      let finish: (() => void) | undefined
      ctx.skills.registerProvider(() => ({ name: 'slow', list: async () => [{ name: 'slow', description: 'Slow', provider: 'slow', source: 'runtime', rank: 10, locator: null, invocation: { modelInvocable: true, userInvocable: true } }], get: async (candidate) => { await new Promise<void>((resolve) => { finish = resolve }); return { ...candidate, content: 'loaded' } } }))
      const scope = createScope(ctx, { id: 'policy-scope' })
      const key = scopeOf(scope.ctx)!
      let allow = true
      scope.ctx.get('skills')!.registerPolicy(() => ({ allows: () => allow }))
      expect((await ctx.skills.list({ scope: key })).length).toBe(1)
      const loading = ctx.skills.get('slow', { scope: key })
      for (let n = 0; n < 10 && !finish; n++) await Promise.resolve()
      expect(finish).toBeTypeOf('function')
      allow = false
      finish!()
      expect(await loading).toBeUndefined()
      expect(await ctx.skills.list({ scope: key })).toEqual([])
      expect((await ctx.skills.list()).map(skill => skill.name)).toEqual(['slow'])
    } finally { await ctx.fiber.dispose() }
  })
})
