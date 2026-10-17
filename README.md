# JDH Backlog

A VS Code extension for managing Markdown backlogs. Cards are grouped under
`## Inbox`, `## Now`, `## Next`, `## Later`, `## Parked`, and `## Done`.

## Install

1. In VS Code, open **Extensions → … → Install from VSIX…**.
2. Select `jdh-backlog-0.2.2.vsix`.
3. Open the folder containing `todo.md`, `TODOS.md`, or a case variation of
   either filename. Find **Backlog** under **View: Open View**.

## Features

- **Color-coded groups** — Inbox blue, Now red, Next orange, Later purple,
  Parked gray, and Done green. Each card has a matching colored dot.
- **Drag and drop** — drag one card or multi-select several, then drop them on
  a group. Card order is preserved and each `- Status:` field is synchronized.
- **Parked readiness guard** — moving a card without a readiness trigger to
  Parked requires confirmation, including in multi-card drops.
- **Move cards** — use the card context menu or Command Palette actions.
- **New card** — create a card from the Backlog view with an ID and title.
- **Status bar and navigation** — see live Now / Next / Inbox counts and jump
  directly to any card.

## Backlog format

```md
## Inbox

### [AI-001] AI Governance Discovery

- Status: Inbox
- Problem:
  ...
```

- Cards use `### [ID] Title` headings.
- Automatic file detection recognizes `todo.md` and `todos.md` in any casing.
- A heading such as `## Now and Next` belongs to both groups.
- A card's `- Status:` takes precedence over its section when grouping.
- Nested headings and body content stay with their card when it moves.
- Missing destination sections are created at the end of the file.

## Settings

| Setting | Default | Notes |
|---|---|---|
| `swasthalinkTodo.filePath` | `""` (auto-detect `todo.md` / `TODOS.md`) | Absolute path or workspace-relative. The setting key is retained for compatibility. |
| `swasthalinkTodo.showStatusBar` | `true` | Toggle the status-bar counts |

## Development and packaging

```sh
npm install
npm run compile
node test/run.js
npx @vscode/vsce package
```

## Publishing to the Visual Studio Marketplace

Create or select the `jhapadigitalholdings` publisher in the
[Marketplace publisher portal](https://marketplace.visualstudio.com/manage)
and a matching namespace on Open VSX. Create publisher tokens for both
registries and store them as repository Actions secrets named `VSCE_PAT` and
`OVSX_PAT`. Never commit these tokens.

To publish automatically from GitHub, push a tag matching the package version:

```sh
git tag v0.2.2
git push origin v0.2.2
```

The `Publish JDH Backlog` workflow compiles the source, runs the tests, checks
that the tag matches `package.json`, packages the VSIX, and publishes to both
registries. The publisher accounts and repository secrets must be configured
before pushing the tag.

For a manual Marketplace publish:

   ```sh
   npm install --global @vscode/vsce
   vsce login jhapadigitalholdings
   ```

Run the tests and publish:

   ```sh
   npm install
   npm run compile
   node test/run.js
   vsce publish
   ```

Update `version` in `package.json` for each release. Marketplace publishing
requires the publisher ID to match a registered publisher account.
