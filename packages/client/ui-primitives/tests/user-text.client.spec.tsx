// @vitest-environment jsdom
/**
 * Inline projection of sent user text: decoration adds no block containers,
 * preserves whitespace, and folds wire session forms to their label.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { projectUserText, type UserTextReference } from '../src/user-text.tsx'

afterEach(cleanup)

const project = (
  text: string,
  labels: readonly string[] = [],
  slashNames: readonly string[] = [],
  slashKind: 'skill' | 'command' = 'skill',
) =>
  render(<div data-host>{projectUserText(text, labels, slashNames, slashKind)}</div>).container.querySelector('[data-host]')!

describe('projectUserText', () => {
  const capabilities: readonly UserTextReference[] = [
    { text: '$office-docx', kind: 'skill', name: 'office-docx' },
    { text: '@聚源', kind: 'mcp', name: '聚源' },
    { text: '@Research API', kind: 'mcp', name: 'Research API' },
    { text: '@资产投研团队', kind: 'team', name: '资产投研团队' },
  ]

  it('gives Add-selected skills the slash preview and leaves MCP and team mentions as labels', () => {
    const openFile = vi.fn()
    const openSkill = vi.fn()
    const view = render(<div>{projectUserText(
      '$office-docx /office-docx @聚源， @Research API @资产投研团队 @src/report.md',
      [], ['office-docx'], 'skill', { openFile, openSkill }, capabilities,
    )}</div>)
    const skills = view.getAllByRole('button', { name: '/office-docx' })
    expect(skills).toHaveLength(2)
    skills.forEach((skill) => { fireEvent.click(skill) })
    expect(openSkill.mock.calls).toEqual([['office-docx'], ['office-docx']])
    for (const kind of ['mcp', 'team']) {
      for (const label of view.container.querySelectorAll(`[data-ref-chip="${kind}"]`)) {
        expect(label.tagName).toBe('SPAN')
        expect(label.querySelector('svg')).not.toBeNull()
        fireEvent.click(label)
      }
    }
    expect(openFile).not.toHaveBeenCalled()
    fireEvent.click(view.getByRole('button', { name: 'report.md' }))
    expect(openFile).toHaveBeenCalledWith('src/report.md')
    expect(view.container.textContent).toBe('/office-docx /office-docx 聚源， Research API 资产投研团队 report.md')
  })

  it('opens the catalog document when the native skill provider is absent or no longer lists the skill', () => {
    const openFile = vi.fn()
    const openSkill = vi.fn()
    const view = render(<div>{projectUserText('$office-docx', [], [], 'skill', { openFile, openSkill }, [
      { text: '$office-docx', kind: 'skill', name: 'office-docx', path: '/personal/skills/office-docx/SKILL.md' },
    ])}</div>)
    fireEvent.click(view.getByRole('button', { name: '/office-docx' }), { detail: 1 })
    expect(openFile).toHaveBeenCalledWith('/personal/skills/office-docx/SKILL.md')
    expect(openSkill).not.toHaveBeenCalled()
  })

  it('matches complete capability names and preserves unknown dollars, file paths and recalled sessions', () => {
    const text = '$office-docx-more $office-docx.md $PATH $100 @聚源/data.csv @聚源.json @"聚源" @聚源'
    const view = render(<div>{projectUserText(text, [], [], 'skill', undefined, capabilities)}</div>)
    expect(view.container.querySelector('[data-ref-chip="skill"]')).toBeNull()
    expect(view.container.querySelectorAll('[data-ref-chip="mcp"]')).toHaveLength(1)
    expect([...view.container.querySelectorAll('[data-ref-chip="file"]')].map(node => node.textContent))
      .toEqual(['data.csv', '聚源.json', '聚源'])
    expect(view.container.textContent).toContain('$office-docx-more $office-docx.md $PATH $100')
    const longest = render(<div>{projectUserText('@Research API Pro', [], [], 'skill', undefined, [
      ...capabilities, { text: '@Research API Pro', kind: 'mcp', name: 'Research API Pro' },
    ])}</div>)
    expect(longest.container.querySelector('[data-ref-chip="mcp"]')?.textContent).toBe('Research API Pro')
    expect(longest.container.querySelectorAll('[data-ref-chip]')).toHaveLength(1)
    const recalled = render(<div>{projectUserText('@聚源', ['聚源'], [], 'skill', undefined, capabilities)}</div>)
    expect(recalled.container.querySelector('[data-ref-chip="session"]')?.textContent).toBe('聚源')
    expect(recalled.container.querySelector('[data-ref-chip="mcp"]')).toBeNull()
  })

  it('keeps decorated text inline and preserves whitespace between references', () => {
    const host = project('反反复复 /dsh-acp-test @执行几个命令测试', ['执行几个命令测试'], ['dsh-acp-test'])
    expect(host.querySelectorAll('div').length).toBe(0)
    expect(host.textContent).toBe('反反复复 /dsh-acp-test 执行几个命令测试')
    const chips = host.querySelectorAll('[data-ref-chip]')
    expect([...chips].map(c => c.getAttribute('data-ref-chip'))).toEqual(['skill', 'session'])
    // The whitespace between tokens survives as its own inline run.
    const runs = [...host.querySelectorAll('span')].filter(s => !s.hasAttribute('data-ref-chip') && s.closest('[data-ref-chip]') === null)
    expect(runs.map(r => r.textContent)).toEqual(['反反复复 ', ' '])
  })

  it('folds the wire session form to its label with the session glyph', () => {
    const host = project('看看 @[查看并分析图片](dsh-session:InNlc3Npb24tNDM0) 的结论')
    const chip = host.querySelector('[data-ref-chip="session"]')!
    expect(chip.textContent).toBe('查看并分析图片')
    expect(chip.getAttribute('title')).toBe('@[查看并分析图片](dsh-session:InNlc3Npb24tNDM0)')
    expect(chip.querySelector('svg')).not.toBeNull()
    expect(host.textContent).toBe('看看 查看并分析图片 的结论')
  })

  it('prefers the wire fold over the bare-token scan on the same range', () => {
    const host = project('@[a](dsh-session:x)', [])
    expect(host.querySelectorAll('[data-ref-chip]').length).toBe(1)
    expect(host.querySelector('[data-ref-chip="session"]')!.textContent).toBe('a')
  })

  it('decorates recall-associated labels, files, folders, and quoted paths', () => {
    const host = project('@会话一 说 @src/deep/file.txt 与 @dir/ 与 @"a b.md"', ['会话一'])
    const kinds = [...host.querySelectorAll('[data-ref-chip]')].map(c =>
      [c.getAttribute('data-ref-chip'), c.textContent])
    expect(kinds).toEqual([
      ['session', '会话一'],
      ['file', 'file.txt'],
      ['folder', 'dir'],
      ['file', 'a b.md'],
    ])
  })

  it('repeated recall labels decorate every occurrence once', () => {
    const host = project('@再看 前情 @再看', ['再看', '再看'])
    expect(host.querySelectorAll('[data-ref-chip="session"]').length).toBe(2)
  })

  it('keeps a punctuation-glued slash token plain and skips degenerate tokens', () => {
    // The host skill gesture ends at whitespace or the text end, so `/plan。`
    // never loads a skill; the bubble must not suggest otherwise.
    const host = project('用 /plan。 试试 @。', [], ['plan'])
    expect(host.querySelectorAll('[data-ref-chip]').length).toBe(0)
    expect(host.textContent).toBe('用 /plan。 试试 @。')
  })

  it('decorates a slash token only when the host resolved it as a skill in that step', () => {
    const bare = project('/123')
    expect(bare.querySelectorAll('[data-ref-chip]').length).toBe(0)
    expect(bare.textContent).toBe('/123')
    const unresolved = project('用 /plan 看看')
    expect(unresolved.querySelectorAll('[data-ref-chip]').length).toBe(0)
    const resolved = project('用 /plan 看看', [], ['plan'])
    expect([...resolved.querySelectorAll('[data-ref-chip]')].map(c => [c.getAttribute('data-ref-chip'), c.textContent]))
      .toEqual([['skill', '/plan']])
  })

  it('marks a resolved slash token as a command chip when the caller says so', () => {
    const host = project('/goal ship it\nsecond line', [], ['goal'], 'command')
    const chips = [...host.querySelectorAll('[data-ref-chip]')]
    expect(chips.map(c => [c.getAttribute('data-ref-chip'), c.textContent])).toEqual([['command', '/goal']])
    expect(host.textContent).toBe('/goal ship it\nsecond line')
  })

  it('leaves slash paths undecorated even for a resolved name: a /name token ends at whitespace', () => {
    const text = '测试一下ui，不用管我：\n/nfs-hg/xxx/yyy 与 /root-dir/ 和 /plan.md'
    const host = project(text, [], ['nfs-hg', 'root-dir', 'plan'])
    expect(host.querySelectorAll('[data-ref-chip]').length).toBe(0)
    expect(host.textContent).toBe(text)
  })

  it('prefers the longer recall label when one nests inside another', () => {
    const host = project('@会话一 收尾', ['会话', '会话一'])
    const chips = [...host.querySelectorAll('[data-ref-chip="session"]')]
    expect(chips.map(c => c.textContent)).toEqual(['会话一'])
    expect(host.textContent).toBe('会话一 收尾')
  })

  it('falls back to the raw quoted label when the path has no basename', () => {
    const host = project('看 @"/" 下面')
    const chip = host.querySelector('[data-ref-chip="folder"]')!
    expect(chip.textContent).toBe('"/"')
  })

  it('opens decoded files and loaded skills without activating session, folder, or command references', () => {
    const openFile = vi.fn()
    const openSkill = vi.fn()
    const view = render(<div>{projectUserText(
      '@src/a.ts @"notes a.md" /review @history @dir/ @"dir a/"', ['history'], ['review'], 'skill',
      { openFile, openSkill },
    )}</div>)
    fireEvent.click(view.getByRole('button', { name: 'a.ts' }))
    fireEvent.click(view.getByRole('button', { name: 'notes a.md' }))
    fireEvent.click(view.getByRole('button', { name: '/review' }))
    expect(openFile.mock.calls).toEqual([['src/a.ts'], ['notes a.md']])
    expect(openSkill).toHaveBeenCalledWith('review')
    expect(view.container.querySelectorAll('button')).toHaveLength(3)
    const command = render(<div>{projectUserText('/help', [], ['help'], 'command', { openFile, openSkill })}</div>)
    expect(command.container.querySelector('button')).toBeNull()
  })

  it('preserves text-selection gestures and keyboard activation', () => {
    const openFile = vi.fn()
    const view = render(<div>{projectUserText('@notes.md', [], [], 'skill', { openFile, openSkill: vi.fn() })}</div>)
    const button = view.getByRole('button', { name: 'notes.md' })
    const selection = document.getSelection()!
    const range = document.createRange()
    range.selectNodeContents(button)
    selection.addRange(range)
    fireEvent.click(button, { detail: 1 })
    expect(openFile).not.toHaveBeenCalled()
    fireEvent.click(button, { detail: 0 })
    expect(openFile).toHaveBeenCalledWith('notes.md')
    selection.removeAllRanges()
    openFile.mockClear()
    fireEvent.click(button, { detail: 2 })
    expect(openFile).not.toHaveBeenCalled()
  })

  it('renders undecorated text as one inline run', () => {
    const host = project('纯文本，无引用')
    expect(host.querySelectorAll('div').length).toBe(0)
    expect(host.querySelectorAll('[data-ref-chip]').length).toBe(0)
    expect(host.textContent).toBe('纯文本，无引用')
  })
})
