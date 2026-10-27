import { describe, expect, it } from 'vitest'
import { applyReasoningLevel, resolveReasoningSpec } from '../src/reasoning-rules.ts'

const levels = (model: string, api: Parameters<typeof resolveReasoningSpec>[1], baseUrl?: string) =>
  resolveReasoningSpec(model, api, baseUrl)?.values
const patch = (model: string, api: Parameters<typeof resolveReasoningSpec>[1], baseUrl: string | undefined, level: string) => {
  const spec = resolveReasoningSpec(model, api, baseUrl)
  if (spec === undefined) throw new Error(`no spec for ${model}`)
  return JSON.parse(JSON.stringify(applyReasoningLevel({ model, max_tokens: 1 }, spec, level))) as Record<string, unknown>
}

describe('reference product reasoning rules', () => {
  it('gives unknown models the catch-all on/off toggle and spells it per protocol', () => {
    expect(levels('step-3.7-flash', 'openai-completions', 'https://api.stepfun.com/step_plan/v1')).toEqual(['disabled', 'enabled'])
    expect(patch('step-3.7-flash', 'openai-completions', undefined, 'enabled')).toEqual({
      model: 'step-3.7-flash', max_tokens: 1,
      thinking: { type: 'enabled' }, enable_thinking: true, reasoning_effort: 'high', reasoning: { effort: 'high' },
    })
    // A protocol without a rule sends nothing beyond the body pi-ai built.
    expect(patch('step-3.7-flash', 'google-generative-ai', undefined, 'enabled')).toEqual({ model: 'step-3.7-flash', max_tokens: 1 })
  })

  it('gives DeepSeek models their own levels with the protocol spelling, matching names case-insensitively', () => {
    for (const model of ['deepseek-flash', 'deepseek-v4-pro', 'DeepSeek-V4-Flash', 'deepseek-v4.1-flash']) {
      expect(levels(model, 'anthropic-messages', 'https://api.deepseek.com')).toEqual(['disabled', 'low', 'high', 'max'])
    }
    expect(patch('deepseek-flash', 'anthropic-messages', 'https://api.deepseek.com', 'high'))
      .toMatchObject({ thinking: { type: 'enabled' }, output_config: { effort: 'high' } })
    expect(patch('deepseek-flash', 'anthropic-messages', 'https://api.deepseek.com', 'disabled'))
      .toEqual({ model: 'deepseek-flash', max_tokens: 1, thinking: { type: 'disabled' } })
    expect(patch('deepseek-v4-pro', 'openai-completions', 'https://api.deepseek.com', 'max'))
      .toMatchObject({ thinking: { type: 'enabled' }, reasoning_effort: 'max' })
  })

  it('lets a provider-site rule narrow the levels for its endpoint only', () => {
    expect(levels('deepseek-v4-pro', 'openai-completions', 'https://opencode.ai/zen/go/v1/')).toEqual(['high', 'max'])
    expect(patch('deepseek-v4-pro', 'openai-completions', 'https://OPENCODE.ai/zen/go/v1', 'high')).toMatchObject({ reasoning_effort: 'high' })
    expect(levels('deepseek-v4-pro', 'openai-completions', 'https://example.com/v1')).toEqual(['disabled', 'low', 'high', 'max'])
  })
})
