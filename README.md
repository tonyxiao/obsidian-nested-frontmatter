# Obsidian Nested Frontmatter

Render nested frontmatter arrays and objects inside Obsidian's native Properties pane.

## What it does

Obsidian shows scalar frontmatter values well, but nested objects and arrays often collapse into hard-to-read JSON-like blobs inside Properties. Obsidian Nested Frontmatter makes those values readable by rendering them as structured rows while keeping the native Properties UI.

Current scope:
- Enhances nested object/array values that Obsidian renders as `unknown` properties
- Preserves Obsidian's existing property row layout and styling as much as possible
- Makes nested wikilinks navigable with a single click

## What it does not do

- It does not create a new metadata editor
- It does not change your frontmatter data format
- It does not add vault-specific schemas or assumptions

## Development

There is no bundling step. `main.js` is the source file Obsidian loads.

```bash
pnpm install
pnpm check
pnpm test
```

## GitHub Actions

- `CI` runs typechecking and tests on every push and pull request.
- `Release` runs the same verification, packages `main.js`, `manifest.json`, and `versions.json`, and publishes a GitHub release when you push a `v*` tag such as `v0.1.0`.

## Testing

The test suite covers:
- structured frontmatter parsing
- wikilink parsing
- DOM enhancement of unknown property rows
- single-click nested link navigation behavior
- regression protection against unnecessary rerender loops

## Status

This plugin is intentionally narrow. The goal is to make nested frontmatter readable in the native Properties pane and do that one thing well.
