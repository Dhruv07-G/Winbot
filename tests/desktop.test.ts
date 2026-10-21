import {beforeAll, afterAll, expect, it, vi} from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';

// Exercise the real main-process IPC handler with simulated OS capabilities.
// No real desktop pixels or provider services are accessed by these tests.
const mock=vi.hoisted(()=>({
  handler:undefined as any, window:undefined as any,
  sources:vi.fn(async()=>[{display_id:'1',thumbnail:{isEmpty:()=>false,toPNG:()=>Buffer.from([1,2,3])}}]),
  extract:vi.fn(async()=> 'What is the capital of India?'),
  answer:vi.fn(async()=> 'New Delhi [1]'),
  shortcuts:new Map<string,()=>void>(),
  profile:'',
}));
vi.mock('electron',()=>({
  app:{getPath:()=>mock.profile,getAppPath:()=>process.cwd(),getLocale:()=> 'en',isPackaged:false,requestSingleInstanceLock:()=>true,on:vi.fn(),quit:vi.fn(),whenReady:async()=>{}},
  BrowserWindow:class {
    webContents={send:vi.fn(),mainFrame:{},on:vi.fn(),setWindowOpenHandler:vi.fn(),session:{setPermissionRequestHandler:vi.fn()}};
    constructor(){mock.window=this;}
    show=vi.fn(); hide=vi.fn(); on=vi.fn(); isDestroyed=()=>false; isVisible=()=>true;
    setOpacity=vi.fn();setMinimumSize=vi.fn();setSize=vi.fn();setBounds=vi.fn();getBounds=()=>({width:440});loadFile=vi.fn(async()=>{});
  },
  ipcMain:{handle:(_channel:string,handler:unknown)=>{mock.handler=handler;}},
  Tray:class {setImage=vi.fn();setToolTip=vi.fn();setContextMenu=vi.fn();},
  Menu:{buildFromTemplate:(items:unknown)=>items},nativeImage:{createFromBuffer:()=>({})},
  desktopCapturer:{getSources:mock.sources},
  screen:{getPrimaryDisplay:()=>({id:1,size:{width:1920,height:1080},scaleFactor:1,workArea:{x:0,y:0,width:1920,height:1080}})},
  globalShortcut:{isRegistered:(key:string)=>mock.shortcuts.has(key),register:(key:string,fn:()=>void)=>{if(key==='invalid')return false;mock.shortcuts.set(key,fn);return true;},unregister:(key:string)=>mock.shortcuts.delete(key),unregisterAll:()=>mock.shortcuts.clear()},
  shell:{openExternal:vi.fn()},dialog:{},
}));
vi.mock('../src/providers',()=>({
  OpenAI:class {answer=mock.answer;extract=mock.extract;selectQuestion=async(text:string)=>text;},
  TesseractOCR:class {extract=mock.extract;},
  BraveSearch:class {search=async()=>[{title:'Reference',url:'https://example.org',description:'New Delhi'}];},
  createSearchProvider:()=>({search:async()=>[{title:'Reference',url:'https://example.org',description:'New Delhi'}]}),
}));
const command=(action:string,payload?:unknown)=>mock.handler({sender:mock.window.webContents,senderFrame:mock.window.webContents.mainFrame},action,payload);
beforeAll(async()=>{
  const root=path.resolve('node_modules/.cache/winbot-tests');await fs.mkdir(root,{recursive:true});
  mock.profile=await fs.mkdtemp(path.join(root,'desktop-test-'));
  await import('../src/desktop/main');
  await vi.waitFor(()=>expect(mock.handler).toBeTypeOf('function'));
});
afterAll(async()=>{await fs.rm(mock.profile,{recursive:true,force:true});});
it('rejects capture before consent and rejects foreign IPC frames',async()=>{
  await command('capture');expect(mock.sources).not.toHaveBeenCalled();
  expect((await command('mode',true)).error).toBe('consent');
  await expect(mock.handler({sender:{},senderFrame:{}},'consent',true)).rejects.toThrow('Unauthorized');
});
it('keeps the startup hotkey registered and only opens the panel while mode is off',async()=>{
  const shortcut=mock.shortcuts.get('CommandOrControl+Shift+Space');expect(shortcut).toBeTypeOf('function');
  shortcut!();expect(mock.sources).not.toHaveBeenCalled();expect(mock.window.show).toHaveBeenCalled();
});
it('runs one capture through OCR/search/answer and persists only text history',async()=>{
  await command('consent',true);await command('mode',true);
  await vi.waitFor(async()=>expect((await command('get')).state.busy).toBe(false),{timeout:3000});
  expect(mock.sources).toHaveBeenCalledTimes(1);expect(mock.extract).toHaveBeenCalledTimes(1);
  const saved=JSON.parse(await fs.readFile(path.join(mock.profile,'history.json'),'utf8'));
  expect(saved[0].text).toBe('New Delhi [1]');expect(Object.keys(saved[0])).not.toContain('image');
});
it('clears history and rejects conflicting shortcuts without losing the previous one',async()=>{
  const current=(await command('get')).state.settings;
  expect((await command('settings',{...current,hotkey:'invalid'})).error).toBe('hotkey');
  expect(mock.shortcuts.has(current.hotkey)).toBe(true);
  await command('clear');expect(JSON.parse(await fs.readFile(path.join(mock.profile,'history.json'),'utf8'))).toEqual([]);
});
it('revoking permission immediately blocks further capture and hotkeys',async()=>{
  await command('revoke');const before=mock.sources.mock.calls.length;
  await command('capture');mock.shortcuts.get('CommandOrControl+Shift+Space')!();
  expect(mock.sources).toHaveBeenCalledTimes(before);
  const state=(await command('get')).state;expect(state.mode).toBe(false);expect(state.consent).toBe(false);
});
it('persists the trace hotkey and rolls back a conflicting registration',async()=>{
  const current=(await command('get')).state.settings;
  const next={...current,traceHotkey:'CommandOrControl+Shift+Y'};
  expect((await command('settings',next)).ok).toBe(true);
  expect(mock.shortcuts.has(current.traceHotkey)).toBe(false);
  expect(mock.shortcuts.has(next.traceHotkey)).toBe(true);
  const saved=JSON.parse(await fs.readFile(path.join(mock.profile,'settings.json'),'utf8'));
  expect(saved.traceHotkey).toBe(next.traceHotkey);
  expect((await command('settings',{...next,traceHotkey:'invalid',hotkey:'CommandOrControl+Shift+X'})).error).toBe('hotkey');
  expect(mock.shortcuts.has(next.hotkey)).toBe(true);
  expect(mock.shortcuts.has(next.traceHotkey)).toBe(true);
  expect(mock.shortcuts.has('CommandOrControl+Shift+X')).toBe(false);
  mock.shortcuts.get(next.traceHotkey)!();
  expect(mock.window.webContents.send).toHaveBeenCalledWith('error','consent');
});
