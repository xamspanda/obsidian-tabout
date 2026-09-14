const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const esbuild = require('esbuild');
const {EditorState, EditorSelection} = require('@codemirror/state');
const fixtures = require('./fixtures/obsidian-syntax.json');

const bundle = esbuild.buildSync({entryPoints:['src/main.ts'], bundle:true, write:false, platform:'node', format:'cjs', external:['obsidian','codemirror','@codemirror/*']}).outputFiles[0].text;

async function setup(rules, doc = '(hello)', anchor = 6, head = anchor) {
  let wrongEditorCalls = 0;
  class Plugin {
    constructor() {
      this.app = {vault:{config:{legacyEditor:false}},workspace:{getActiveViewOfType:()=>({editor:{
        getCursor:()=>({line:0,ch:0}), getLine:()=>'(unrelated note)',
        setCursor:()=>wrongEditorCalls++,
      }})}};
      this.manifest = {id:'tabout-continued'};
    }
    loadData() { return Promise.resolve({rules}); }
    registerEditorExtension(extension) { this.bindings = extension; }
    addSettingTab() {}
    addCommand() {}
    registerDomEvent() {}
  }
  const fixture = fixtures.find(f=>f.text===doc);
  let syntaxAt = pos => fixture?.tokens.find(t=>t.from<=pos && pos<t.to)?.name ?? 'Document';
  const obsidian = {Plugin,MarkdownView:class{},PluginSettingTab:class{},Modal:class{}};
  const context = vm.createContext({module:{exports:{}}, console, window:{}, addEventListener(){}, structuredClone,
    require(id) {
      if(id==='obsidian')return obsidian;
      if(id==='@codemirror/view')return {keymap:{of:bindings=>bindings}};
      if(id==='@codemirror/state')return {Prec:{high:value=>value}};
      if(id==='@codemirror/language')return {syntaxTree:()=>({resolveInner:(pos,side)=>({type:{name:syntaxAt(Math.max(0,pos-(side<0?1:0)))}})})};
      throw Error(id);
    }
  });
  vm.runInContext('String.prototype.contains = String.prototype.includes;',context);
  vm.runInContext(bundle,context);
  const plugin = new context.module.exports.default();
  await plugin.onload();
  const state = EditorState.create({doc,selection:{anchor,head},extensions:EditorState.allowMultipleSelections.of(true)});
  const view = {state, composing:false, dispatch(transaction) {this.state=this.state.update(transaction).state;}};
  return {plugin,view,run:()=>plugin.bindings.find(binding=>binding.key==='Tab').run(view),wrongEditorCalls:()=>wrongEditorCalls,setSyntax(fn){syntaxAt=fn}};
}
const rule = (lookups=[')'], jumpAfter=true, tokenMatcher='Document')=>({lookups,jumpAfter,tokenMatcher});

test('Tab moves the editor that received the key, without consulting another note',async()=>{
  const t=await setup([rule()]);
  assert.equal(t.run(),true);
  assert.equal(t.view.state.selection.main.head,7);
  assert.equal(t.wrongEditorCalls(),0);
});
test('Tab leaves a selection to the normal editor handler',async()=>{
  const t=await setup([rule()], '(hello)',1,6);
  assert.equal(t.run(),false);
  assert.equal(t.view.state.selection.main.anchor,1);
  assert.equal(t.view.state.selection.main.head,6);
  assert.equal(t.wrongEditorCalls(),0);
});
test('Blank lookup fields do not consume Tab',async()=>{
  const t=await setup([rule([''])]);
  assert.equal(t.run(),false);
});
test('A jump-before target at the cursor does not consume Tab without moving',async()=>{
  const t=await setup([rule([')'],false)]);
  assert.equal(t.run(),false);
});
test('Custom rules retain order, duplicate environments and jump settings',async()=>{
  const rules=[rule(['missing']),rule(['”'],false),rule([')'])];
  const t=await setup(rules, '(“hello ”)',7);
  assert.deepEqual(JSON.parse(JSON.stringify(t.plugin.settings)),{rules});
  assert.equal(t.run(),true);
  assert.equal(t.view.state.selection.main.head,8);
});
test('A multi-character target is crossed in full',async()=>{
  const t=await setup([rule(['**'],true,'strong')], '**hello**',7);
  t.setSyntax(pos=>pos<2||pos>=7?'formatting_formatting-strong_strong':'strong');
  assert.equal(t.run(),true);
  assert.equal(t.view.state.selection.main.head,9);
});
test('No matching environment or character falls through to normal Tab',async()=>{
  for(const rules of [[rule([')'],true,'code')],[rule(['”'])]]) {
    const t=await setup(rules);
    assert.equal(t.run(),false);
    assert.equal(t.view.state.selection.main.head,6);
  }
});
test('Multiple cursors are left to the normal editor handler',async()=>{
  const t=await setup([rule()]);
  t.view.dispatch({selection:EditorSelection.create([EditorSelection.cursor(1),EditorSelection.cursor(6)],1)});
  assert.equal(t.run(),false);
  assert.equal(t.view.state.selection.main.head,6);
  assert.equal(t.wrongEditorCalls(),0);
});

const textCases = [
  ["(|that's fine)", "(that's fine)|"],
  ["(that's |fine, it's okay)", "(that's fine, it's okay)|"],
  ["that's |fine, it's okay", null],
  ["'|that's fine'", "'that's fine'|"],
  ["(that|'s fine)", "(that's fine)|"],
  ["‘|that’s fine’", "‘that’s fine’|"],
  ["(one |(two) three)", "(one (two) three)|"],
  ["outside |(inside)", null],
  ['(“near|” later)', '(“near”| later)'],
  [String.raw`"say |a \"quoted\" word"`, String.raw`"say a \"quoted\" word"|`],
  ['(|unmatched', null],
  ['one|) unmatched', null],
  ['[[ali|as]]', '[[alias]]|'],
  ['[[alias]|]', '[[alias]]|'],
];
for (const [input, expected] of textCases) {
  test(`surrounding pairs: ${input}`, async () => {
    const pos=input.indexOf('|'),doc=input.replace('|','');
    const rules=[rule(['"',"'",')','}',']']),rule(['”','’'])];
    const t=await setup(rules,doc,pos);
    assert.equal(t.run(),expected!==null);
    assert.equal(t.view.state.selection.main.head,expected===null?pos:expected.indexOf('|'));
  });
}

test('Repeated Tab exits inner then outer pairs, without revisiting either',async()=>{
  const t=await setup([rule(['”',')'])], '(“near” later)',6);
  assert.equal(t.run(),true);
  assert.equal(t.view.state.selection.main.head,7);
  assert.equal(t.run(),true);
  assert.equal(t.view.state.selection.main.head,14);
  assert.equal(t.run(),false);
});
test('A before-target option does not fall through to an outer pair',async()=>{
  const t=await setup([rule(['”'],false),rule([')'])], '(“near” later)',6);
  assert.equal(t.run(),false);
  assert.equal(t.view.state.selection.main.head,6);
});
test('Unknown custom strings retain literal behavior and settings',async()=>{
  const rules=[rule(['{}'],true,'bracket_math')];
  const t=await setup(rules, 'a {}',0);
  t.setSyntax(()=> 'bracket_math');
  assert.equal(t.run(),true);
  assert.equal(t.view.state.selection.main.head,4);
  assert.deepEqual(JSON.parse(JSON.stringify(t.plugin.settings)),{rules});
});
test('Explicit literal rules can search known punctuation outside a pair',async()=>{
  const t=await setup([{...rule([')']),literal:true}],'outside (inside)',0);
  assert.equal(t.run(),true);
  assert.equal(t.view.state.selection.main.head,16);
});
test('Composition input does not trigger cursor navigation',async()=>{
  const t=await setup([rule()]);t.view.composing=true;
  assert.equal(t.run(),false);
});
test('Line-relative targets keep the correct document offset',async()=>{
  const t=await setup([rule()], 'first\n(second)\nthird',10);
  assert.equal(t.run(),true);
  assert.equal(t.view.state.selection.main.head,14);
});
test('The target must close on the current line',async()=>{
  const t=await setup([rule()], '(first\nsecond)',2);
  assert.equal(t.run(),false);
});
for(const [doc,cursor,expected,lookups,matcher] of [
 ['**bold *italic* text**',10,15,['*','**'],''],
 ['**bold *italic* text**',5,22,['*','**'],''],
 ['`literal (x) **bold**`',9,22,['`',')','**'],''],
 ['``literal ` (x)``',10,17,['`',')'],''],
 ['==highlight==',7,13,['=='],''],
 ['~~strike~~',5,10,['~~'],''],
 ['a*b*c and foo_bar_baz',15,null,['_'],''],
]){
 test(`Markdown syntax: ${doc} at ${cursor}`,async()=>{
  const t=await setup([rule(lookups,true,matcher)],doc,cursor);
  assert.equal(t.run(),expected!==null);
  assert.equal(t.view.state.selection.main.head,expected??cursor);
 });
}
test('Unmatched possessive apostrophes are not quote openers',async()=>{
  const t=await setup([rule(["'"])], "students' work and teachers' notes",12);
  assert.equal(t.run(),false);
});
test('Unicode word-internal apostrophes are skipped',async()=>{
  const t=await setup([rule(["'",')'])], "(l'été)",2);
  assert.equal(t.run(),true);
  assert.equal(t.view.state.selection.main.head,7);
});
test('The nearest innermost enabled pair wins independently of rule order',async()=>{
  const t=await setup([rule([')']),rule(['”'])], '(“near” later)',4);
  assert.equal(t.run(),true);
  assert.equal(t.view.state.selection.main.head,7);
});
for(const [input,expected] of [
 ['*em |**bold** em*','*em **bold** em*|'],
 ['*em **bo|ld** em*','*em **bold**| em*'],
 ['***bo|th***','***both***|'],
 ['**bold *ita|lic***','**bold *italic*|**'],
 ['*em **bo|ld***','*em **bold**|*'],
 ['(text |`literal )` end)','(text `literal )` end)|'],
]){
 test(`nested Markdown: ${input}`,async()=>{
  const pos=input.indexOf('|'),doc=input.replace('|','');
  const t=await setup([rule(['*','**','`',')'],true,'')],doc,pos);
  assert.equal(t.run(),true);
  assert.equal(t.view.state.selection.main.head,expected.indexOf('|'));
 });
}
