import type { BoxProps, ButtonProps, ElementConstructor, LinkProps, RenderElement, TextProps } from 'claude-code'

import { sliceSegs } from './md'
import type { Block, Seg } from './md'
import type { Theme } from './theme'

export type Els = {
  Box: ElementConstructor<BoxProps>
  Text: ElementConstructor<TextProps>
  Button: ElementConstructor<ButtonProps>
  Link: ElementConstructor<LinkProps>
}

type Scroll = {
  offsets: Readonly<Record<string, number>>
  by: (key: string, delta: number, max: number) => void
}

const segText = ({ Text, Link }: Els, t: Theme, segs: Seg[]) =>
  segs.map(s => {
    const text = (
      <Text bold={s.bold} italic={s.italic} strikethrough={s.strike} underline={s.underline}
        dimColor={s.dim && t.dim} color={t.color(s.color)}>
        {s.text}
      </Text>
    )

    return s.href ? <Link href={s.href}>{text}</Link> : text
  })

// < > under a block wider than the pane, and where in it the view sits.
function scroller({ Box, Text, Button }: Els, t: Theme, key: string, offset: number, cols: number, full: number, scroll: Scroll) {
  const max = Math.max(0, full - cols)
  const step = Math.max(8, Math.floor(cols / 2))

  return max > 0 && (
    <Box flexDirection="row" gap={1}>
      <Button key={`${key}-left`} plain label="<" onPress={() => scroll.by(key, -step, max)} />
      <Button key={`${key}-right`} plain label=">" onPress={() => scroll.by(key, step, max)} />
      <Text dimColor={t.dim}>cols {offset + 1}-{Math.min(full, offset + cols)} of {full}</Text>
    </Box>
  )
}

const offsetOf = (scroll: Scroll, key: string, max: number) => Math.min(scroll.offsets[key] ?? 0, Math.max(0, max))

// Draws the doc's blocks into a pane `cols` wide, one row per source line:
// wrapped lines hang under their marker, tables and code scroll sideways.
export function renderDoc(els: Els, t: Theme, blocks: Block[], cols: number, scroll: Scroll): RenderElement[] {
  const { Box, Text } = els
  const segs = (s: Seg[]) => segText(els, t, s)
  const loud = (isLoud: boolean) => (isLoud ? t.loud : {})
  const done = t.color('green')
  let tables = 0
  let codes = 0

  const hanging = (gutter: string | RenderElement, body: RenderElement, isLoud = false) => (
    <Box flexDirection="row">
      {typeof gutter === 'string' ? <Text dimColor={t.dim} {...loud(isLoud)}>{gutter}</Text> : gutter}
      <Box flexShrink={1}>{body}</Box>
    </Box>
  )

  return blocks.map(block => {
    switch (block.kind) {
      case 'blank':
        return <Text> </Text>
      case 'heading':
        return hanging(`${block.hashes} `,
          <Text bold={block.level <= 2} {...loud(block.isLoud)}>{segs(block.segs)}</Text>, block.isLoud)
      case 'para':
        return <Text {...loud(block.isLoud)}>{segs(block.segs)}</Text>
      case 'item': {
        // A done task's [x] is green (bold where there is no color); the rest of its line dims.
        const box = block.isDone ? block.gutter.match(/^(.*)(\[[xX]\])(\s*)$/) : null
        const gutter = box
          ? <Text><Text dimColor={t.dim}>{box[1]}</Text><Text bold={!done} color={done}>{box[2]}</Text>{box[3]}</Text>
          : block.gutter

        return hanging(gutter,
          <Text dimColor={block.isDone && t.dim} {...loud(block.isLoud)}>{segs(block.segs)}</Text>, block.isLoud)
      }
      case 'quote':
        return hanging(block.gutter,
          <Text dimColor={t.dim} {...loud(block.isLoud)}>{segs(block.segs)}</Text>)
      case 'rule':
        return <Text dimColor={t.dim}>{block.text}</Text>
      case 'code': {
        const key = `c${codes++}`
        const offset = offsetOf(scroll, key, block.width - cols)

        return (
          <Box flexDirection="column">
            <Text dimColor={t.dim} wrap="truncate">{block.open}</Text>
            {block.lines.map(line => (
              <Text dimColor={t.dim} wrap="truncate">{segs(sliceSegs([{ text: line || ' ' }], offset, cols))}</Text>
            ))}
            {block.close !== undefined && <Text dimColor={t.dim} wrap="truncate">{block.close}</Text>}
            {scroller(els, t, key, offset, cols, block.width, scroll)}
          </Box>
        )
      }
      case 'table': {
        const key = `t${tables++}`
        const offset = offsetOf(scroll, key, block.width - cols)

        return (
          <Box flexDirection="column">
            {block.lines.map(line => <Text wrap="truncate">{segs(sliceSegs(line, offset, cols))}</Text>)}
            {scroller(els, t, key, offset, cols, block.width, scroll)}
          </Box>
        )
      }
    }
  })
}
