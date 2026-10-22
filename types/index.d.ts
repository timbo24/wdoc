export type Doc = { path: string; text: string; mtimeMs: number; blank?: string }
export type Draft = { text: string; baseMtimeMs: number }
export type ThemeName = 'color' | 'safe' | 'mono' | 'contrast'

declare module 'claude-code' {
  interface PluginState {
    wdoc: {
      doc: Doc | null
      draft: Draft | null
      autoOpened: boolean
      // Sideways scroll of each wide table, by its place in the doc (t0, t1, ...).
      tableX: Record<string, number>
      // Display mode, kept across sessions in the docs folder's settings.json.
      theme: ThemeName
    }
  }
}
