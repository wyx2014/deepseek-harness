import { it, expect } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { LlmAdapter } from '../src/index.ts'
import type { GenerateOptions, StreamChunk } from '../src/types.ts'

it('probes an enabled model without a session and distinguishes failure or missing finish', async () => {
  const ctx = new Context()
  let mode = 'ok'
  let sent: GenerateOptions | undefined
  class ProbeAdapter extends LlmAdapter {
    override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
      sent = options
      if (mode === 'empty') return
      if (mode === 'fail') throw new Error('connection refused')
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
  }
  try {
    await ctx.plugin(LlmRuntime)
    ctx.llm.registerAdapter(['test'], new ProbeAdapter())
    expect(await ctx.llm.testModel('test', 'model', new AbortController().signal)).toEqual({ ok: true, message: '连接成功' })
    expect(sent?.sessionId).toBeUndefined()
    expect(sent?.maxTokens).toBe(32)
    mode = 'fail'
    expect(await ctx.llm.testModel('test', 'model', new AbortController().signal)).toMatchObject({ ok: false })
    mode = 'empty'
    expect(await ctx.llm.testModel('test', 'model', new AbortController().signal)).toMatchObject({ ok: false })
    expect(await ctx.llm.testModel('missing', 'model', new AbortController().signal)).toMatchObject({ ok: false })
  } finally { await ctx.fiber.dispose() }
})
