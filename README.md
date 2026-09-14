# Tabout Continued

Press **Tab** to move past a closing quote, bracket, link, or Markdown delimiter.
Rules control where a jump applies and whether the cursor stops before or after
the target. If no rule applies, Obsidian handles Tab normally.

This is a fork of [phibr0/obsidian-tabout](https://github.com/phibr0/obsidian-tabout).
It appears in Obsidian as **Tabout Continued**, with plugin ID `tabout-continued`.
It requires desktop Obsidian 1.13.0 or later. The original author and AGPL-3.0
license are retained.

## What changed

- Tab acts on the editor that receives the key. It no longer reads or changes
  another note through Obsidian's global active-view lookup.
- Selected text and multiple cursors retain normal Tab behavior.
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

Rules are evaluated in saved order. Matching uses the editor's environment name;
an empty environment matches anywhere. Jumps stay on the current line. A rule
with no matching target lets the following rules run.

## Check a missing or broken installation

A console error such as `ENOENT` for `plugins/tabout/main.js` means the plugin's
code file is missing. Restore a complete build while preserving `data.json`.
That error alone does not identify what removed the file.

Open Obsidian's developer tools to inspect load errors. For functional checks,
use a scratch note and test `(hello|)` and `**hello|**`, where `|` marks the cursor.
Pressing Tab should move the cursor beyond the closing delimiter without editing
the text. Normal indentation should still work when no rule applies.
