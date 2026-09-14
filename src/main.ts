import { Editor, Plugin } from "obsidian";
import { TaboutSettingsTab } from "./ui/settings";
import { TaboutSettings, DEFAULT_SETTINGS } from "./types";
import RuleCreateModal from "./ui/ruleCreateModal";
import { EditorView, keymap } from "@codemirror/view";
import { EditorState, Prec } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";

export default class TaboutPlugin extends Plugin {
  declare settings: TaboutSettings;

  async onload() {
    await this.loadSettings();
    this.registerEditorExtension(
      Prec.high(keymap.of([{ key: "Tab", run: (view) => this.tabout(view) }]))
    );
    this.addSettingTab(new TaboutSettingsTab(this.app, this));
    this.addCommand({
      id: "tabout-add-rule-here",
      name: "Add Rule for this Environment",
      editorCallback: (editor: Editor) => {
        // Obsidian's CodeMirror view is not included in its Editor type.
        const view = (editor as Editor & { cm: EditorView }).cm;
        new RuleCreateModal(this, this.getToken(view.state)).open();
      },
    });
  }

  getToken = (state: EditorState): string => {
    return syntaxTree(state).resolveInner(state.selection.main.head, -1).type.name;
  };

  tabout = (view: EditorView): boolean => {
    const { state } = view;
    // Leave selected text and multiple cursors to normal indentation.
    if (state.selection.ranges.length !== 1 || !state.selection.main.empty) {
      return false;
    }
    const token = this.getToken(state);
    const pos = state.selection.main.head;
    const line = state.doc.lineAt(pos);
    const afterCursor = line.text.substring(pos - line.from);
    for (const rule of this.settings.rules) {
      if (!token.includes(rule.tokenMatcher)) continue;
      const distance = Math.min(
        ...this.getIndices(rule.lookups, afterCursor, rule.jumpAfter)
      );
      if (distance !== Infinity) {
        view.dispatch({ selection: { anchor: pos + distance }, scrollIntoView: true });
        return true;
      }
    }
    return false;
  };

  getIndices(lookups: string[], afterCursor: string, jumpAfter: boolean): number[] {
    const distances: number[] = [];
    for (const lookup of lookups) {
      // Empty fields and targets already reached must not swallow Tab.
      if (!lookup) continue;
      const index = afterCursor.indexOf(lookup);
      if (index === -1) continue;
      const distance = jumpAfter ? index + lookup.length : index;
      if (distance > 0) distances.push(distance);
    }
    return distances;
  }

  async loadSettings() {
    this.settings = Object.assign(structuredClone(DEFAULT_SETTINGS), await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
