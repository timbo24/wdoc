// Display modes. Meaning is always carried by the text itself ([x], Q:, the
// markers), so color only reinforces it and each mode can change or drop it.

import type { ThemeName } from '../types'

export const THEMES: readonly ThemeName[] = ['color', 'safe', 'mono', 'contrast']

export const THEME_NOTES: Record<ThemeName, string> = {
  color: 'default colors',
  safe: 'color-blind safe palette (Okabe-Ito)',
  mono: 'no color: questions inverse, the rest by weight and dimness',
  contrast: 'default colors, nothing dimmed',
}

export type Theme = {
  name: ThemeName
  // Whether structure (markers, fences, done lines) is drawn dim.
  dim: boolean
  // Open questions: a color, or inverse where there is none.
  loud: { color?: string; inverse?: boolean }
  // Any color the doc asks for (done green, code cyan, {red:text}) as this mode draws it.
  color: (c: string | undefined) => string | undefined
}

// Okabe-Ito: distinguishable under the common forms of color blindness.
const SAFE: Record<string, string> = {
  red: '#D55E00', green: '#56B4E9', yellow: '#F0E442', blue: '#0072B2',
  magenta: '#CC79A7', cyan: '#E69F00', '#ff9f43': '#E69F00', '#a55eea': '#CC79A7', '#ff6b9d': '#CC79A7',
}

export function theme(name: ThemeName): Theme {
  switch (name) {
    case 'safe':
      return { name, dim: true, loud: { color: SAFE.yellow }, color: c => (c && SAFE[c]) ?? c }
    case 'mono':
      return { name, dim: true, loud: { inverse: true }, color: () => undefined }
    case 'contrast':
      return { name, dim: false, loud: { color: 'yellow' }, color: c => c }
    default:
      return { name: 'color', dim: true, loud: { color: 'yellow' }, color: c => c }
  }
}

export const isThemeName = (s: string): s is ThemeName => (THEMES as readonly string[]).includes(s)

export const nextTheme = (name: ThemeName) => THEMES[(THEMES.indexOf(name) + 1) % THEMES.length]!
