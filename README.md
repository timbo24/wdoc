# wdoc

A Claude Code mod: a live working doc per session, shared by you and Claude, in a pane beside the chat.

- `/wdoc` opens the pane (docked on the right in fullscreen, 110+ columns; set `CLAUDE_CODE_NO_FLICKER=1`).
- Each session gets a doc at `~/Developer/wdoc/<working-dir>/<date>-<session>.md`, kept 7 days; blank ones are dropped.
- `/wdoc save <name>` keeps a copy for good under `saved/`; `/wdoc path`, `/wdoc close`.
- `/wdoc theme <color|safe|mono|contrast>` (or `t` in the pane) picks a display mode, color-blind safe included.

The pane shows the markdown source, lightly styled: every character stays visible; markers are dim,
headings bold, `Q:` lines yellow, done `[x]` green. Wide tables and code scroll sideways with `< >`.

Claude is told about the doc each session and keeps its `## Plan`, `## Notes` and `## Tests` current.

## Develop

    claude plugin validate .
    claude plugin test .
