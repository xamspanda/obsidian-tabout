# Tabout Continued

Press **Tab** to leave the innermost enabled quote, bracket, link, or Markdown pair.
Rules control where a jump applies and whether the cursor stops before or after
the target. If no rule applies, Obsidian handles Tab normally.

This is a fork of [phibr0/obsidian-tabout](https://github.com/phibr0/obsidian-tabout).
It appears in Obsidian as **Tabout Continued**, with plugin ID `tabout-continued`.
It requires desktop Obsidian 1.13.0 or later. The original author and AGPL-3.0
license are retained.

## What changed

- Tab finds a matching pair around the cursor on the current line. It skips
  apostrophes inside words such as `that's` and `it's`, escaped marks, and
  unrelated pairs ahead of the cursor.
- Nested pairs are crossed from inside to outside. Markdown formatting uses
  Obsidian's syntax information; literal punctuation inside code spans does not
  become a jump target. A wikilink closes past both characters in `]]`.
- Existing rules and jump-before/after options are retained. A new
  **Search for literal text** option enables a forward search for a custom rule.
- Tab acts on the editor that receives the key. It no longer reads or changes
  another note through Obsidian's global active-view lookup.
- Selected text, multiple cursors, and composition input retain normal behavior.
- Empty character fields and targets already reached do not consume Tab.
- Settings events are removed when the plugin is disabled and are separate from
  the original plugin's events.
- The build uses current CodeMirror 6 types and includes regression tests.

## Install from a build

1. Run `npm ci` and `npm run check` using Node.js 22 or later.
2. Disable the original **Tabout** plugin in Obsidian.
3. Create `.obsidian/plugins/tabout-continued` in your vault.
4. Copy `main.js`, `manifest.json`, and `styles.css` into that folder.
5. Restart Obsidian and enable **Tabout Continued** in Community plugins.

The Checks workflow also provides these three files as a downloadable artifact.
An installation requires all three files; a manifest alone cannot load the plugin.

## Keep your existing settings

Before changing plugins, back up `.obsidian/plugins/tabout`.
With both plugins disabled, copy its `data.json` into
`.obsidian/plugins/tabout-continued/data.json`. All rules, their order, duplicate
environments, lookup strings, and jump-before/after options remain intact.
Personal settings are not included in this repository or build artifacts.

If you assigned a hotkey to **Add Rule for this Environment**, assign the same
hotkey to that command under **Tabout Continued**. The normal Tab key is supplied
by the editor extension and needs no custom hotkey.

To switch back, disable **Tabout Continued** and enable **Tabout**. Keep only one
of them enabled at a time. The fork does not change the original settings file.

## Add a custom rule

1. Place the cursor inside the formatting where you want to use Tab.
2. Run **Tabout Continued: Add Rule for this Environment**.
3. Enter the characters to jump to, then choose **Add this Rule**.

The innermost surrounding pair enabled by your rules wins. If several rules
enable that pair, the first matching rule supplies the jump-before/after option.
Matching uses the editor's environment name at the cursor or the pair;
an empty environment matches anywhere. Jumps stay on the current line.

Known quotes, brackets, Markdown marks, and backticks require a surrounding pair.
When no enabled pair applies, other custom strings are searched literally, in
saved rule order. Turn on **Search for literal text** to also search for known
closing marks outside a pair. Literal search can intentionally stop at an
apostrophe in a word.

With matching rules enabled, these examples show where Tab moves the cursor
(marked by `|`):

| Before | After |
| --- | --- |
| `(that\|’s fine)` | `(that’s fine)\|` |
| `(one \|(two) three)` | `(one (two) three)\|` |
| `(“ne\|ar” later)` | `(“near”\| later)` |
| `[[ali\|as]]` | `[[alias]]\|` |
| `**bo\|ld**` | `**bold**\|` |

Natural-language quotation can be ambiguous. The matcher skips word-internal
apostrophes and unmatched possessives; it does not attempt to parse prose grammar.
Pairs split across lines are outside its scope. LaTeX Suite keeps priority for
its snippet fields and math Tab commands when both plugins are enabled.

## Development checks

Run `npm run check` to run the regression tests and build with TypeScript checks.
Tests use real CodeMirror document and selection state, plus syntax fixtures
captured from Obsidian 1.13.7. The fixture notes contain only synthetic examples.
Also verify changes in a scratch note in Obsidian, because its syntax tokens and
other plugins' key handlers are supplied by the host application.

## Check a missing or broken installation

A console error such as `ENOENT` for `plugins/tabout/main.js` means the plugin's
code file is missing. Restore a complete build while preserving `data.json`.
That error alone does not identify what removed the file.

Open Obsidian's developer tools to inspect load errors. For functional checks,
use a scratch note and test `(hello|)` and `**hello|**`, where `|` marks the cursor.
Pressing Tab should move the cursor beyond the closing delimiter without editing
the text. Normal indentation should still work when no rule applies.
