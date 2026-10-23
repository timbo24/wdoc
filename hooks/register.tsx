import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Doc, Draft, ThemeName } from '../types'
import { parse } from './md'
import { isThemeName, nextTheme, THEME_NOTES, THEMES, theme } from './theme'
import { renderDoc } from './view'

// Where docs live, under $HOME, and how long a session doc is kept.
const ROOT = 'Developer/wdoc'
const KEEP_DAYS = 7
const POLL_MS = 1500
// Body columns asked of the dock beside a fullscreen transcript (it caps at 45%).
const DOCK_COLUMNS = 60

const PANE = 'wdoc'
const doc = atom({ plugin: 'wdoc', key: 'doc' } as const, null)
const draft = atom({ plugin: 'wdoc', key: 'draft' } as const, null)
const autoOpened = atom({ plugin: 'wdoc', key: 'autoOpened' } as const, false)
const tableX = atom({ plugin: 'wdoc', key: 'tableX' } as const, {})
const themeName = atom({ plugin: 'wdoc', key: 'theme' } as const, 'color')

type $ = EngineInterface

const rootDir = async ($: $) => `${(await $.env.get('HOME')) ?? '~'}/${ROOT}`

const dirName = (cwd: string) =>
  (cwd.split('/').filter(Boolean).pop() ?? 'root').replace(/[^\w.-]/g, '_')

// The person's own calendar day (en-CA formats as YYYY-MM-DD), not UTC's.
const today = async ($: $) =>
  new Date(await $.clock.now()).toLocaleDateString('en-CA')

// The session doc: created as the session starts, its path fixed by working dir, date and session.
async function ensureDoc($: $): Promise<Doc> {
  const current = await read($, doc)
  if (current) return current

  const cwd = await $.session.cwd()
  const sid = (await $.session.id()).slice(0, 8)
  const date = await today($)
  const path = `${await rootDir($)}/${dirName(cwd)}/${date}-${sid}.md`
  const blank = `# Working doc: ${dirName(cwd)}\n\n_${date}, session ${sid}_\n\n## Plan\n\n## Notes\n\n## Tests\n\n`
  if (!(await $.fs.exists(path))) await $.fs.write(path, blank)
  const loaded = await load($, path, blank)
  await update($, doc, () => loaded)

  return loaded
}

async function load($: $, path: string, blank?: string): Promise<Doc> {
  const [text, stat] = await Promise.all([$.fs.read(path), $.fs.stat(path)])

  return { path, text, mtimeMs: stat.mtimeMs, blank }
}

// Picks up edits made outside the pane: Claude's Edit/Write, or another editor.
async function refresh($: $) {
  const current = await read($, doc)
  if (!current) return
  const stat = await $.fs.stat(current.path).catch(() => undefined)
  if (!stat || stat.mtimeMs === current.mtimeMs) return
  const fresh = await load($, current.path, current.blank)
  await update($, doc, () => fresh)
}

// A hot reload cancels the old module's timers and runs no session.start, so
// any hook that runs restarts the watch if this module has none yet.
let isWatching = false
function watch($: $) {
  if (isWatching) return
  isWatching = true
  $.clock.every(POLL_MS, () => void refresh($))
  $.clock.after(0, () => void refresh($))
}

async function save($: $, text: string) {
  const current = await ensureDoc($)
  await $.fs.write(current.path, text)
  const saved = await load($, current.path, current.blank)
  await update($, doc, () => saved)
  await update($, draft, () => null)
}

// Session docs older than KEEP_DAYS go; named copies under saved/ stay.
async function prune($: $) {
  const root = await rootDir($)
  if (!(await $.fs.exists(root))) return
  await $.process.run(['find', root, '-mindepth', '2', '-maxdepth', '2', '-type', 'f',
    '-name', '*.md', '-mtime', `+${KEEP_DAYS}`, '-delete'])
  await $.process.run(['find', root, '-mindepth', '1', '-type', 'd', '-empty', '-delete'])
}

// The display mode outlives sessions: one settings file beside the docs.
const settingsPath = async ($: $) => `${await rootDir($)}/settings.json`

async function loadTheme($: $) {
  const path = await settingsPath($)
  if (!(await $.fs.exists(path))) return
  const saved: unknown = JSON.parse(await $.fs.read(path)).theme
  if (typeof saved === 'string' && isThemeName(saved)) await update($, themeName, () => saved)
}

async function setTheme($: $, name: ThemeName) {
  await update($, themeName, () => name)
  await $.fs.write(await settingsPath($), `${JSON.stringify({ theme: name }, null, 2)}\n`)
}

const open = async ($: $) => {
  await ensureDoc($)

  return $.ui.open({ id: PANE, title: 'Working doc', focus: true, columns: DOCK_COLUMNS })
}

// Opened unasked once per session, and only as a fullscreen sidebar.
async function autoOpen($: $) {
  if (await read($, autoOpened)) return
  await update($, autoOpened, () => true)
  await ensureDoc($)
  await $.ui.open({ id: PANE, title: 'Working doc', columns: DOCK_COLUMNS })
}

// A session doc nobody wrote in is not worth keeping.
async function discardIfBlank($: $) {
  const current = await read($, doc)
  if (current?.blank !== undefined && current.text === current.blank) {
    await $.process.run(['rm', '-f', current.path])
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'wdoc',
      description: 'Open the session working doc (wdoc [close | save <name> | path | theme <mode>])',
      argumentHint: '[close | save <name> | path | theme <color|safe|mono|contrast>]',
    })
    watch($)
    void loadTheme($).catch(() => undefined)
    if (e.isInteractive) {
      void prune($).catch(() => undefined).then(() => ensureDoc($))
    }

    return next(e)
  })

  on('session.end', async ($, e, next) => {
    await $.ui.close({ id: PANE })
    await discardIfBlank($).catch(() => undefined)
    // A /clear starts a new session id, and with it a new doc.
    if (e.reason === 'clear') {
      await update($, doc, () => null)
      await update($, draft, () => null)
      await update($, autoOpened, () => false)
    }

    return next(e)
  })

  on('command.run', { command: 'wdoc' }, async ($, e) => {
    watch($)
    const [verb = '', ...rest] = e.args.trim().split(/\s+/)

    if (verb === 'close') {
      await $.ui.close({ id: PANE })

      return { text: 'Working doc closed (still saved).' }
    }
    if (verb === 'theme') {
      const [name = ''] = rest
      if (isThemeName(name)) {
        await setTheme($, name)

        return { text: `Working doc theme: ${name} (${THEME_NOTES[name]}).` }
      }
      const current = await read($, themeName)

      return { text: [`Theme: ${current}. Pick one with /wdoc theme <mode>:`, ...THEMES.map(n => `  ${n}: ${THEME_NOTES[n]}`)].join('\n') }
    }
    if (verb === 'path') {
      return { text: (await ensureDoc($)).path }
    }
    if (verb === 'save') {
      const name = rest.join('-').replace(/[^\w.-]/g, '_') || `${await today($)}`
      const current = await ensureDoc($)
      const target = `${await rootDir($)}/${dirName(await $.session.cwd())}/saved/${name}.md`
      await $.fs.write(target, current.text)

      return { text: `Working doc saved to ${target} (kept until you delete it).` }
    }

    const { isPlaced } = await open($)
    const { path } = await ensureDoc($)

    return {
      text: isPlaced
        ? `Working doc open: ${path}`
        : `Working doc ready at ${path} (widen the terminal or use fullscreen to see the pane).`,
    }
  })

  // Tell Claude the doc exists and how to share it, once it does.
  on('prompt.compose', async ($, e, next) => {
    const result = await next(e)
    watch($)
    // The doc is made at session start without waiting; a first prompt that
    // comes sooner makes it here, so Claude is never told nothing.
    const current = (await read($, doc)) ??
      (e.traits.includes('print') ? null : await ensureDoc($).catch(() => null))
    if (!current) return result

    return {
      sections: [
        ...result.sections,
        {
          id: 'wdoc:doc',
          scope: 'session',
          text: [
            '# Working doc',
            `The user and you share a live working doc for this session at ${current.path}, shown to them in a pane beside the chat (the wdoc mod; the user may call it "wdoc", "the working doc" or "the doc"). When they ask to put something in it, add it there with the Edit tool. It is this local file, not a Claude Docs doc or an Artifact: never create one of those for it.`,
            'It is markdown, shown as source with light styling (every character visible): headings, lists, `- [ ]` checkboxes, tables (wide ones scroll sideways, so do not squeeze them), bold, italic, code, emoji, and colored text written {red:text} (red, green, yellow, blue, magenta, cyan, orange, purple, pink, gray, or a #hex). Read it before relying on it, since the user edits it too.',
            'It has a ## Plan section: as work proceeds, keep it current with the steps of the work as a checklist, ticking items off as they are done and adding new ones as plans change. Its ## Tests section records what was tested and how, with results. Use ## Notes for decisions and findings. Write an open question for the user as a line starting `Q:`; the pane shows those in yellow, so use them only for questions.',
            'Update it with the Edit tool (prefer small edits over rewrites). Keep it tidy and concise; do not paste long logs into it.',
          ].join('\n'),
        },
      ],
    }
  })

  // The band is drawn on every surface once the session is up: the first
  // fullscreen drawing opens the pane (a render hook may not write state itself).
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.viewport?.isFullscreen === true && !(await read($, autoOpened))) {
      $.clock.after(0, () => void autoOpen($))
    }

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Link } = $.ui.resolve(e)
    watch($)
    const saved = await read($, doc)
    const editing = await read($, draft)

    if (!saved) return <Text dimColor>No working doc yet. Run /wdoc.</Text>

    // Drawn from disk when the file moved on since the last refresh, so an edit
    // shows even if the watch timer is not running.
    const stat = await $.fs.stat(saved.path).catch(() => undefined)
    const current = stat && stat.mtimeMs !== saved.mtimeMs ? await load($, saved.path, saved.blank) : saved
    const name = current.path.split('/').pop()
    const mode = await read($, themeName)

    if (editing && e.surface !== 'mobile') {
      const { Input } = $.ui.resolve(e)
      const isStale = current.mtimeMs !== editing.baseMtimeMs
      const rows = Math.max(4, (e.viewport?.rows ?? 30) - 8)

      return (
        <Box flexDirection="column">
          <Text dimColor>Editing {name} - Enter saves, shift+Enter for a new line</Text>
          {isStale && <Text color="yellow">Changed by Claude while you edit: saving overwrites it.</Text>}
          <Input
            key="editor"
            rows={rows}
            autoFocus
            value={editing.text}
            submitLabel="save"
            onInput={text => void update($, draft, d => (d ? { ...d, text } : d))}
            onSubmit={text => void save($, text)}
          />
          <Box flexDirection="row" gap={1}>
            <Button key="save" variant="primary" label="Save"
              onPress={async () => { const d = await read($, draft); if (d) await save($, d.text) }} />
            <Button key="cancel" label="Cancel" onPress={() => void update($, draft, () => null)} />
          </Box>
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={1}>
          {e.surface !== 'mobile' && <Button key="edit" hotkey="e" variant="primary" label="Edit"
            onPress={() => void update($, draft, () => ({ text: current.text, baseMtimeMs: current.mtimeMs }))} />}
          <Button key="open" hotkey="o" label="Open in editor"
            onPress={() => void $.process.run(['open', '-t', current.path])} />
        </Box>
        <Box flexDirection="row" gap={1}>
          <Text dimColor>{name}</Text>
          <Button key="theme" hotkey="t" plain label={`theme: ${mode}`} onPress={() => void setTheme($, nextTheme(mode))} />
        </Box>
        {e.props.placement === 'inline' && (
          <Text color="yellow">
            Shown above the prompt: the pane docks on the right only in fullscreen, at 110+ columns.
          </Text>
        )}
        {renderDoc({ Box, Text, Button, Link }, theme(mode), parse(current.text), e.props.bodyColumns, {
          offsets: await read($, tableX),
          by: (key, delta, max) =>
            void update($, tableX, x => ({ ...x, [key]: Math.max(0, Math.min(max, (x[key] ?? 0) + delta)) })),
        })}
      </Box>
    )
  })
}
