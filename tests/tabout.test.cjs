const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const esbuild = require('esbuild');

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
  const obsidian = {Plugin,MarkdownView:class{},PluginSettingTab:class{},Modal:class{}};
  const context = vm.createContext({module:{exports:{}}, console, window:{}, addEventListener(){}, structuredClone,
    require(id) {
      if(id==='obsidian')return obsidian;
      if(id==='@codemirror/view')return {keymap:{of:bindings=>bindings}};
      if(id==='@codemirror/state')return {Prec:{high:value=>value}};
      if(id==='@codemirror/language')return {syntaxTree:state=>({resolveInner:()=>({type:{name:state.token}})})};
      throw Error(id);
    }
  });
  vm.runInContext('String.prototype.contains = String.prototype.includes;',context);
  vm.runInContext(bundle,context);
  const plugin = new context.module.exports.default();
  await plugin.onload();
  const makeSelection=(a,h=a)=>({main:{anchor:a,head:h,empty:a===h},ranges:[{anchor:a,head:h,empty:a===h}]});
  const state = {token:'Document',selection:makeSelection(anchor,head),doc:{length:doc.length,lineAt:()=>({from:0,text:doc}),toString:()=>doc}};
  const view = {state,dispatch(transaction) {state.selection = makeSelection(transaction.selection.anchor);}};
  return {plugin,view,run:()=>plugin.bindings.find(binding=>binding.key==='Tab').run(view),wrongEditorCalls:()=>wrongEditorCalls};
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
  const t=await setup(rules, '(hello ”)',6);
  assert.deepEqual(JSON.parse(JSON.stringify(t.plugin.settings)),{rules});
  assert.equal(t.run(),true);
  assert.equal(t.view.state.selection.main.head,7);
});
test('A multi-character target is crossed in full',async()=>{
  const t=await setup([rule(['**'])], '**hello**',7);
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
  t.view.state.selection.ranges.push({anchor:1,head:1,empty:true});
  assert.equal(t.run(),false);
  assert.equal(t.view.state.selection.main.head,6);
  assert.equal(t.wrongEditorCalls(),0);
});
