import { expect, test } from 'claude-code/testing'

import { inline, parse, plainEmoji, sliceSegs, width } from '../hooks/md'

test('emoji and wide text count two cells', () => {
  expect(width('ab')).toBe(2)
  expect(width('✅')).toBe(2)
  expect(width('🎉')).toBe(2)
  expect(width('日本')).toBe(4)
})

const joined = (segs: { text: string }[]) => segs.map(s => s.text).join('')

test('inline styles keep their markers, dim', () => {
  const src = 'a **b {red:c}** `x` _i_ snake_case_x'
  const segs = inline(src)
  expect(joined(segs)).toBe(src)
  expect(segs.find(s => s.text === 'c')).toEqual({ text: 'c', bold: true, color: 'red' })
  expect(segs.find(s => s.text === '{red:')).toMatchObject({ dim: true, bold: true })
  expect(segs.find(s => s.text === '`x`')).toEqual({ text: '`x`', color: 'cyan' })
  expect(segs.find(s => s.text === 'i')).toEqual({ text: 'i', italic: true })
  expect(segs.at(-1)?.text).toBe(' snake_case_x')
  expect(inline('{nope:x}')[0]?.text).toBe('{nope:x}')
})

test('blocks keep every line of the source', () => {
  const src = '## Head\n\n\n- one\n  2) two\n- [x] done\nQ: why??\n---\n\n| a | b |\n|---|--:|\n| 1 | 22 |\n'
  const blocks = parse(src)
  expect(blocks.map(b => b.kind)).toEqual(['heading', 'blank', 'blank', 'item', 'item', 'item', 'para', 'rule', 'blank', 'table'])
  expect(blocks[0]).toMatchObject({ hashes: '##', isLoud: false })
  expect(blocks[4]).toMatchObject({ gutter: '  2) ', isDone: false })
  expect(blocks[5]).toMatchObject({ gutter: '- [x] ', isDone: true })
  expect(blocks[6]).toMatchObject({ isLoud: true })
  const table = blocks[9]
  if (table?.kind !== 'table') throw new Error('no table')
  expect(table.lines.map(joined)).toEqual(['| a   |   b |', '|-----|----:|', '| 1   |  22 |'])
})

test('code blocks keep their fences', () => {
  const [code] = parse('```ts\nconst a = 1\n```')
  expect(code).toMatchObject({ kind: 'code', open: '```ts', lines: ['const a = 1'], close: '```', width: 11 })
})

test('slicing a line by cells', () => {
  const text = (s: { text: string }[]) => s.map(x => x.text).join('')
  expect(text(sliceSegs([{ text: 'abc' }, { text: 'def', bold: true }], 2, 3))).toBe('cde')
  expect(text(sliceSegs([{ text: 'a✅b' }], 2, 2))).toBe(' b')
})

test('links: markdown and bare URLs carry their target', () => {
  const segs = inline('see [docs](https://a.com/x) or https://b.com/y.')
  expect(joined(segs)).toBe('see [docs](https://a.com/x) or https://b.com/y.')
  expect(segs.find(s => s.text === 'docs')).toMatchObject({ underline: true, href: 'https://a.com/x' })
  expect(segs.find(s => s.text === '](https://a.com/x)')).toMatchObject({ dim: true })
  expect(segs.find(s => s.text === 'https://b.com/y')).toMatchObject({ dim: true, href: 'https://b.com/y' })
  expect(segs.at(-1)?.text).toBe('.')
})

test('emoji the terminal mismeasures are drawn plain', () => {
  expect(plainEmoji('⚠️ 👩‍💻 🇺🇸 👍🏽 1️⃣ ✅ 日本')).toBe('⚠ 👩 US 👍 1 ✅ 日本')
  expect(width(plainEmoji('⚠️'))).toBe(1)
})
