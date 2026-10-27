import { describe, expect, it } from 'vitest'
import { aboutWindowHtml } from '../src/about-window.ts'

describe('aboutWindowHtml', () => {
  it('escapes copy and renders heading lines, note and button', () => {
    const html = aboutWindowHtml({ title: 'T', heading: ['A <b>', 'V1'], note: 'n & m', ok: 'OK' }, 'data:image/png;base64,AA', 'en')
    expect(html).toContain('A &lt;b&gt;<br>V1')
    expect(html).toContain('n &amp; m')
    expect(html).toContain('<img class="icon" src="data:image/png;base64,AA"')
    expect(html).toContain('>OK</button>')
  })

  it('omits the icon when none is readable', () => {
    expect(aboutWindowHtml({ title: 'T', heading: ['A'], note: '', ok: 'OK' }, undefined, 'en')).not.toContain('<img')
  })
})
