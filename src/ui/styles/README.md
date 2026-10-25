# Styles

One stylesheet per area of the app, imported from `src/main.tsx` in a fixed order. Later files may override earlier
ones, so keep that order and add a file to it (and to `main.tsx`) only for a new area.

| File                  | What goes in it                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| `tokens.css`          | The token reference, `:root` and the dark theme. Nothing else.                                   |
| `base.css`            | Element defaults: the page, headings, form elements, code, focus.                                |
| `controls.css`        | Shared controls: buttons, badges, fields, toggles, tabs, segmented controls, notes, code blocks. |
| `overlays.css`        | What floats over the page: dialogs, the palette, the toast, the tour and the menus.              |
| `start.css`           | The start screen and the crash screen.                                                           |
| `workspace.css`       | The workspace frame: the top bar, banners, panes and their headers.                              |
| `tree.css`            | The Structure tree.                                                                              |
| `inspector.css`       | The Edit pane: the form, the preview beside it, language rows, the template autocomplete.        |
| `preview.css`         | The wallet previews of both platforms: card, home row, stages and notes.                         |
| `preview-ios.css`     | The iOS details screen.                                                                          |
| `preview-android.css` | The Android details screen.                                                                      |
| `output.css`          | The Output pane: hosting settings, generated file headers, the Changes tab.                      |
| `issues.css`          | The Issues panel.                                                                                |
| `metadata.css`        | The Metadata page.                                                                               |
| `translations.css`    | The Translations view and the Languages dialog.                                                  |
| `i14y.css`            | I14Y: the dialog, suggestions, the concept link and the tree tag.                                |

Before adding a rule, find the area's file and look for a rule to reuse: a control used by more than one area belongs
in `controls.css` (or `overlays.css`), not in the first area that needs it. A phone override goes in a
`@media` block in the same file, after the rules it overrides.

Always use the tokens (`var(--…)`, listed at the top of `tokens.css`), never literal colours, shadows, radii or font
sizes. The only exception is a `/* wallet-preview:start */ … /* wallet-preview:end */` block in the preview files,
which copies the wallets' own values; a block starts and ends in the same file. `src/ui/styles.test.ts` checks all of
this, and that `main.tsx` imports every file here.
