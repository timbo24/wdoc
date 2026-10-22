import { expect, test } from 'claude-code/testing'

import { nextTheme, theme } from '../hooks/theme'

test('each mode keeps or drops color and dimness', () => {
  expect(theme('color').color('green')).toBe('green')
  expect(theme('safe').color('green')).toBe('#56B4E9')
  expect(theme('safe').color('#123456')).toBe('#123456')
  expect(theme('mono').color('red')).toBeUndefined()
  expect(theme('mono').loud).toEqual({ inverse: true })
  expect(theme('contrast').dim).toBe(false)
  expect(nextTheme('contrast')).toBe('color')
})
