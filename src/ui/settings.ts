import { Rule } from '../types';
import { PluginSettingTab, App, Setting } from "obsidian";
import TaboutPlugin from "../main";
import RuleEditModal from './ruleEditModal';
import RuleCreateModal from './ruleCreateModal';

export class TaboutSettingsTab extends PluginSettingTab {
	plugin: TaboutPlugin;

	constructor(app: App, plugin: TaboutPlugin) {
		super(app, plugin);
		this.plugin = plugin;

		plugin.registerDomEvent(window, "tabout-continued:edit-complete", async (e: CustomEvent) => {
			this.plugin.settings.rules[e.detail.idx] = e.detail.rule;
			this.display();
			await this.plugin.saveSettings();
		});
		plugin.registerDomEvent(window, "tabout-continued:rule-create", async (e: CustomEvent) => {
			this.plugin.settings.rules.push(e.detail.rule);
			this.display();
			await this.plugin.saveSettings();
		});
	}

	display(): void {
		let { containerEl } = this;
		const { settings } = this.plugin;

		containerEl.empty();

		containerEl.createEl('h2', { text: this.plugin.manifest.name });
		containerEl.createEl('p', { text: 'Tab exits the innermost enabled pair around the cursor. Custom strings that are not closing marks are searched as literal text when no pair applies.' });

		settings.rules.forEach((rule, idx) => {

			new Setting(containerEl)
				.setName(`Rule #${idx}`)
				.setDesc(this.generateDescription(rule))
				.addButton(bt => {
					bt.setButtonText("Edit")
						.onClick(() => {
							new RuleEditModal(this.plugin, rule, idx).open();
						});
				})
				.addExtraButton(bt => {
					bt.setIcon("trash")
						.setTooltip("Delete Rule")
						.onClick(async () => {
							settings.rules.remove(rule);
							await this.plugin.saveSettings();
							this.display();
						});
				});
		});
		const btn = createEl("button", { text: "Add Rule", cls: "tabout-add-rule" });
		btn.onClickEvent(() => {
			new RuleCreateModal(this.plugin).open();
		});
		containerEl.createDiv({ cls: "tabout-add-rule-container" }).append(btn);
	}

	generateDescription(rule: Rule): DocumentFragment {
		let descEl = document.createDocumentFragment();
		descEl.append("This Rule is only active in ")
		descEl.append(createEl("code", { text: rule.tokenMatcher ? rule.tokenMatcher : "all" }));
		descEl.append(" Environments and with the press of ");
		descEl.append(createEl("kbd", { text: "Tab", cls: "tabout-kbd" }));
		descEl.append(rule.literal ? " you will search for this literal text: " : " you will exit a surrounding pair ending with these marks (other custom text is searched literally): ");
		rule.lookups.forEach((char, i) => {
			descEl.append(createEl("code", { text: char }));
			if (i != rule.lookups.length - 1) {
				descEl.append(", ");
			}
		})
		return descEl;
	}
}
