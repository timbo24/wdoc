import { expect, test } from 'claude-code/testing'

import { SAMPLE } from './sample'

const PANE = {
  plugin: 'wdoc',
  component: 'Pane',
  requestId: 'wdoc',
  props: {
    title: 'Working doc',
    isFocused: false,
    bodyColumns: 50,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

test('the pane asks for /wdoc before a doc exists', async $ => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /Run \/wdoc/ }))?.text).toBe('No working doc yet. Run /wdoc.')
    await ui.unmount()
  }
})

const engine = (on: Parameters<Parameters<typeof test>[1]>[1], files: Map<string, string>) => {
  on('command.register', () => ({ value: { command: 'wdoc' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('env.get', () => ({ value: '/home/me' }))
  on('session.cwd', () => ({ value: '/work/proj' }))
  on('session.id', () => ({ value: 'abcdef1234567890' }))
  on('fs.exists', (_, e) => ({ value: files.has(e.path) || files.has('*') }))
  on('fs.write', (_, e) => { files.set(e.path, e.text); return { value: undefined } })
  on('fs.read', (_, e) => ({ value: files.get(e.path) ?? files.get('*') ?? '' }))
  on('fs.stat', () => ({ value: { kind: 'file', size: 1, mtimeMs: 1, isLink: false } }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: '', stderr: '' } }))
  on('clock.now', () => ({ value: Date.UTC(2026, 9, 22) }))
  on('clock.every', () => ({ value: {} }))

}

test('/wdoc creates the session doc and opens the pane', async ($, on) => {
  const files = new Map<string, string>()
  engine(on, files)
  await $.session.start({ cwd: '/work/proj', surface: 'terminal', isInteractive: true })
  const ran = await $.command.run({ command: 'wdoc', args: '' })
  const [path] = [...files.keys()]
  expect(path).toMatch(/^\/home\/me\/Developer\/wdoc\/proj\/\d{4}-\d\d-\d\d-abcdef12\.md$/)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'edit' })
  await ui.input({ key: 'editor', text: '# Plan\n\n- [ ] ship wdoc\n' })
  expect(files.get(path!)).toBe('# Plan\n\n- [ ] ship wdoc\n')
  await ui.unmount()
  expect(JSON.stringify(ran)).toContain(path!)
})

test('the pane draws every kind of block, on every surface', async ($, on) => {
  engine(on, new Map([['*', SAMPLE]]))
  await $.session.start({ cwd: '/work/proj', surface: 'terminal', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect([surface, 'plan', !!(await ui.find({ type: 'Text', text: /Plan/ }))]).toEqual([surface, 'plan', true])
    expect([surface, 'btn', !!(await ui.find({ key: 't1-right' }))]).toEqual([surface, 'btn', true])
    await ui.press({ key: 't1-right' })
    expect([surface, 'cols', (await ui.find({ type: 'Text', text: /cols/ }))?.text]).toEqual([surface, 'cols', expect.stringMatching(/^cols 26-75 of \d+$/)])
    await ui.press({ key: 't1-left' })
    await ui.unmount()
  }
})

test('the theme button cycles modes and saves the choice', async ($, on) => {
  const files = new Map([['*', SAMPLE]])
  engine(on, files)
  await $.session.start({ cwd: '/work/proj', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'theme' })
  expect(files.get('/home/me/Developer/wdoc/settings.json')).toBe('{\n  "theme": "safe"\n}\n')
  expect(await ui.find({ key: 'theme' })).toMatchObject({ props: { label: 'theme: safe' } })
  await ui.unmount()
})

test('Claude is told about the doc even if the first prompt beats its creation', async ($, on) => {
  const files = new Map<string, string>()
  engine(on, files)
  on('prompt.compose', () => ({ sections: [] }))
  const { sections } = await $.prompt.compose({ traits: [], model: 'claude-opus-5-5', promptModel: 'claude-opus-5-5', tools: [], surfaces: ['terminal'], outputStyle: null })
  const section = sections.find(s => s.id === 'wdoc:doc')
  expect(section?.text).toContain('/home/me/Developer/wdoc/proj/')
  expect(section?.text).toContain('"wdoc"')
})
