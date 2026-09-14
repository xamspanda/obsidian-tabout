import { Editor, Plugin } from "obsidian";
import { TaboutSettingsTab } from "./ui/settings";
import { TaboutSettings, DEFAULT_SETTINGS } from "./types";
import RuleCreateModal from "./ui/ruleCreateModal";
import { findTabTarget } from "./targets";
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
    if (view.composing) return false;
    const pos = state.selection.main.head;
    const line = state.doc.lineAt(pos);
    const tree = syntaxTree(state);
    const target = findTabTarget(
      line.text, pos - line.from, this.settings.rules, this.getToken(state),
      offset => tree.resolveInner(line.from + offset, 1).type.name,
    );
    if (target === null) return false;
    view.dispatch({ selection: { anchor: line.from + target }, scrollIntoView: true });
    return true;
  };

  async loadSettings() {
    this.settings = Object.assign(structuredClone(DEFAULT_SETTINGS), await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
