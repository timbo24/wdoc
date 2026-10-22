// A small markdown reader for the pane: block structure, inline styles, and
// display widths, so wide tables can be laid out whole and scrolled sideways.
// Every character of the source is kept: styling only changes color, weight or
// dimness, so the doc on screen and the doc on disk read the same.

export type Seg = {
  text: string
  bold?: boolean
  italic?: boolean
  strike?: boolean
  underline?: boolean
  dim?: boolean
  color?: string
  href?: string
}

// `isLoud` marks an open question (a line starting `Q:` or holding `??`), drawn yellow.
export type Block =
  | { kind: 'blank' }
  | { kind: 'heading'; level: number; hashes: string; segs: Seg[]; isLoud: boolean }
  | { kind: 'para'; segs: Seg[]; isLoud: boolean }
  | { kind: 'item'; gutter: string; isDone: boolean; segs: Seg[]; isLoud: boolean }
  | { kind: 'quote'; gutter: string; segs: Seg[]; isLoud: boolean }
  | { kind: 'code'; open: string; lines: string[]; close: string | undefined; width: number }
  | { kind: 'rule'; text: string }
  | { kind: 'table'; lines: Seg[][]; width: number }

// {red:text} or {#ff8800:text} colors a run of text.
const COLORS: Record<string, string> = {
  red: 'red', green: 'green', yellow: 'yellow', blue: 'blue', magenta: 'magenta',
  cyan: 'cyan', white: 'white', gray: 'gray', grey: 'gray',
  orange: '#ff9f43', purple: '#a55eea', pink: '#ff6b9d',
}

const INLINE = new RegExp([
  /\*\*(.+?)\*\*/.source,                         // 1 bold
  /(?<!\w)__(.+?)__(?!\w)/.source,                // 2 bold
  /~~(.+?)~~/.source,                             // 3 strike
  /`([^`]+)`/.source,                             // 4 code
  /\*(?!\s)(.+?)\*/.source,                       // 5 italic
  /(?<!\w)_(?!\s)(.+?)_(?!\w)/.source,            // 6 italic
  /\[([^\]]+)\]\(([^)\s]+)\)/.source,             // 7 link text, 8 url
  /\{(#[0-9a-fA-F]{3,6}|[a-z]+):(.+?)\}/.source,  // 9 color, 10 text
  /(https?:\/\/[^\s<>|]*[^\s<>|.,;:!?'")\]])/.source, // 11 bare URL
].join('|'))

export function inline(text: string, style: Omit<Seg, 'text'> = {}): Seg[] {
  const out: Seg[] = []
  const mark = (t: string, extra: Omit<Seg, 'text'> = {}) => out.push({ ...style, ...extra, text: t, dim: true })
  let rest = text
  while (rest.length > 0) {
    const m = INLINE.exec(rest)
    if (!m) {
      out.push({ ...style, text: rest })
      break
    }
    if (m.index > 0) out.push({ ...style, text: rest.slice(0, m.index) })
    const [whole, b1, b2, s, code, i1, i2, link, href, color, colored, url] = m
    // Markers dim around the styled text: `close` is the closing marker's length.
    const wrap = (inner: string, close: number, extra: Omit<Seg, 'text'>) => {
      const open = whole.length - inner.length - close
      mark(whole.slice(0, open))
      out.push(...inline(inner, { ...style, ...extra }))
      mark(whole.slice(open + inner.length))
    }
    if (b1 ?? b2) wrap((b1 ?? b2)!, 2, { bold: true })
    else if (s) wrap(s, 2, { strike: true })
    else if (code) out.push({ ...style, text: whole, color: 'cyan' })
    else if (i1 ?? i2) wrap((i1 ?? i2)!, 1, { italic: true })
    else if (link) {
      mark('[', { href })
      out.push(...inline(link, { ...style, underline: true, href }))
      mark(`](${href})`, { href })
    } else if (url) mark(url, { href: url })
    else if (color && colored && (color.startsWith('#') || COLORS[color])) {
      wrap(colored, 1, { color: COLORS[color] ?? color })
    } else out.push({ ...style, text: whole })
    rest = rest.slice(m.index + whole.length)
  }

  return out
}

// Display width in terminal cells: emoji and East Asian wide forms take two.
const segmenter = new Intl.Segmenter()
export const graphemes = (s: string) => Array.from(segmenter.segment(s), g => g.segment)

// Emoji the terminal and the renderer measure differently leave stale cells as
// the pane scrolls, so each is drawn as its simplest form: variation selectors,
// skin tones and keycap marks dropped, a joined sequence cut to its first emoji,
// a flag spelled as its two letters. The file keeps what was written.
export const plainEmoji = (s: string) =>
  graphemes(s).map(g => {
    if (/^\p{Regional_Indicator}{2}$/u.test(g)) {
      return Array.from(g, c => String.fromCharCode(c.codePointAt(0)! - 0x1f1e6 + 65)).join('')
    }
    const base = g.split('\u200d')[0]!

    return base.replace(/[\uFE0E\uFE0F\u20E3\u{1F3FB}-\u{1F3FF}]/gu, '')
  }).join('')

export function cellWidth(g: string): number {
  if (/\p{Emoji_Presentation}/u.test(g)) return 2
  const cp = g.codePointAt(0) ?? 0
  if (/^\p{Mn}/u.test(g) || cp === 0x200d) return 0
  const isWide = (cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe4f) || (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) || (cp >= 0x20000 && cp <= 0x3fffd)

  return isWide ? 2 : 1
}

export const width = (s: string) => graphemes(s).reduce((n, g) => n + cellWidth(g), 0)
export const segsWidth = (segs: Seg[]) => segs.reduce((n, s) => n + width(s.text), 0)

// The cells [start, start + cols) of a styled line; a wide glyph cut by an edge becomes a space.
export function sliceSegs(segs: Seg[], start: number, cols: number): Seg[] {
  const out: Seg[] = []
  let col = 0
  for (const seg of segs) {
    let text = ''
    for (const g of graphemes(seg.text)) {
      const w = cellWidth(g)
      const end = col + w
      if (end > start && col < start + cols) {
        text += col >= start && end <= start + cols ? g : ' '.repeat(Math.min(end, start + cols) - Math.max(col, start))
      }
      col = end
    }
    if (text) out.push({ ...seg, text })
  }

  return out
}

const PIPE: Seg = { text: '|', dim: true }

// A table as written, its pipes lined up: the header bold, the dash row dim.
function table(rows: string[]): Block {
  const split = (row: string) =>
    row.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(c => c.trim())
  const [head = [], spec = [], ...body] = rows.map(split)
  const aligns = spec.map(c => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : 'left'))
  const n = Math.max(head.length, spec.length, ...body.map(r => r.length))
  const cells = [head, ...body].map((r, i) =>
    Array.from({ length: n }, (_, c) => inline(r[c] ?? '', i === 0 ? { bold: true } : {})))
  const widths = Array.from({ length: n }, (_, c) => Math.max(3, ...cells.map(r => segsWidth(r[c]!))))

  const line = (row: Seg[][]): Seg[] => {
    const out: Seg[] = [PIPE]
    row.forEach((cell, c) => {
      const pad = widths[c]! - segsWidth(cell)
      const align = aligns[c] ?? 'left'
      const left = align === 'right' ? pad : align === 'center' ? Math.floor(pad / 2) : 0
      out.push({ text: ' '.repeat(left + 1) }, ...cell, { text: ' '.repeat(pad - left + 1) }, PIPE)
    })

    return out
  }
  const dashes: Seg[] = [{
    dim: true,
    text: '|' + widths.map((w, c) => {
      const cell = spec[c] ?? ''
      const left = cell.startsWith(':') ? ':' : '-'
      const right = cell.endsWith(':') && cell.length > 1 ? ':' : '-'

      return left + '-'.repeat(w) + right
    }).join('|') + '|',
  }]
  const lines = [line(cells[0]!), dashes, ...cells.slice(1).map(line)]

  return { kind: 'table', lines, width: segsWidth(lines[0]!) }
}

const isLoud = (line: string) =>
  /^\s*(?:#+\s+|>\s?|(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?)?Q:/.test(line) || line.includes('??')

export function parse(text: string): Block[] {
  const lines = plainEmoji(text.replace(/\r\n?/g, '\n')).split('\n')
  if (lines.at(-1) === '') lines.pop()
  const blocks: Block[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trimEnd()
    const loud = isLoud(line)
    let m: RegExpMatchArray | null

    if (line.trim() === '') {
      blocks.push({ kind: 'blank' })
    } else if ((m = line.match(/^\s*(```|~~~)/))) {
      const fence = m[1]!
      const body: string[] = []
      while (++i < lines.length && !lines[i]!.trim().startsWith(fence)) body.push(lines[i]!.trimEnd().replace(/\t/g, '  '))
      const close = lines[i]?.trimEnd()
      blocks.push({ kind: 'code', open: line, lines: body, close, width: Math.max(0, ...body.map(width)) })
    } else if ((m = line.match(/^(#{1,6})\s+(.*)$/))) {
      blocks.push({ kind: 'heading', level: m[1]!.length, hashes: m[1]!, segs: inline(m[2]!), isLoud: loud })
    } else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      blocks.push({ kind: 'rule', text: line })
    } else if (line.trim().startsWith('|') && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1] ?? '')) {
      const rows = [line]
      while (i + 1 < lines.length && lines[i + 1]!.trim().startsWith('|')) rows.push(lines[++i]!)
      blocks.push(table(rows))
    } else if ((m = line.match(/^(\s*(?:[-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?)(.*)$/))) {
      const task = m[2]?.trim()
      blocks.push({
        kind: 'item',
        gutter: m[1]!.replace(/\t/g, '  '),
        isDone: task !== undefined && task !== '[ ]',
        segs: inline(m[3]!),
        isLoud: loud,
      })
    } else if ((m = line.match(/^(\s*>\s?)(.*)$/))) {
      blocks.push({ kind: 'quote', gutter: m[1]!, segs: inline(m[2]!, { italic: true }), isLoud: loud })
    } else {
      blocks.push({ kind: 'para', segs: inline(line), isLoud: loud })
    }
  }

  return blocks
}
