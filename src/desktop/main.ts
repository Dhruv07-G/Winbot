import {
  app,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
  nativeImage,
  desktopCapturer,
  screen,
  globalShortcut,
  shell,
  dialog,
} from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import {existsSync} from "node:fs";
import dotenv from "dotenv";
import {
  defaults,
  settingsSchema,
  Settings,
  Answer,
  WinbotError,
  recommendations,
} from "../core/model";
import { TraceSession } from "./trace-session";
import { DesktopMultiPageSession } from "./multi-page-session";
import { trustWindowsCertificates } from "./trust";
import { TraceItem } from "../core/trace";
import { Pipeline } from "../core/pipeline";
import { ConsentGate } from "../core/consent";
const gate = new ConsentGate();
import { OpenAI, TesseractOCR, createSearchProvider } from "../providers";
let win: BrowserWindow,
  tray: Tray,
  settings: Settings = defaults,
  history: Answer[] = [],
  busy = false,
  capturing = false,
  collapsed = false,
  quitting = false,
  followups = 0;
let controller: AbortController | undefined;
let traceItems: TraceItem[]=[];
const trace = new TraceSession({assert:()=>gate.assertCapture(),capturing:active=>{capturing=active;emit();},changed:()=>emit()});
const multi = new DesktopMultiPageSession({assert:()=>gate.assertCapture(),capturing:active=>{capturing=active;emit();},changed:()=>emit(),showPanel:()=>win?.show(),hidePanel:()=>win?.hide(),error:code=>win?.webContents.send("error",code)});
let f8Active=false;
const file = (name: string) => path.join(app.getPath("userData"), name);
const hi = () =>
  settings.language === "hi" ||
  (settings.language === "auto" && app.getLocale().startsWith("hi"));
const tr = (en: string, h: string) => (hi() ? h : en);
const state = () => ({
  settings,
  history,
  consent: gate.granted,
  mode: gate.enabled,
  busy:busy||multi.busy,
  capturing:capturing||multi.state.active,
  multi:multi.state,
  traceSelecting: trace.selecting,
  traceCount: trace.selectedCount,
  traceSavedCount: trace.savedCount,
  traceItems,
  collapsed,
  recommendations: recommendations(settings, followups),
  vision: process.env.OCR_PROVIDER === "vision",
  locale: app.getLocale(),
});
function icon(active = false) {
  const bytes = Buffer.alloc(16 * 16 * 4);
  for (let i = 0; i < 256; i++) {
    bytes[i * 4] = active ? 60 : 190;
    bytes[i * 4 + 1] = active ? 70 : 210;
    bytes[i * 4 + 2] = active ? 240 : 70;
    bytes[i * 4 + 3] = 255;
  }
  return nativeImage.createFromBuffer(bytes, { width: 16, height: 16 });
}
function emit() {
  if(f8Active&&!multi.busy){globalShortcut.unregister("F8");f8Active=false;}
  if (!win?.isDestroyed()) win.webContents.send("state", state());
  if (tray) {
    tray.setImage(icon(capturing||multi.state.active));
    tray.setToolTip(
      capturing||multi.state.active
        ? tr("Winbot — capturing", "Winbot — स्क्रीन कैप्चर जारी")
        : tr("Winbot — idle", "Winbot — निष्क्रिय"),
    );
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: tr("Open Winbot", "Winbot खोलें"), click: () => win.show() },
        {
          label: tr("Capture once", "एक बार कैप्चर करें"),
          enabled: gate.granted && gate.enabled && !busy,
          click: () => void answer(),
        },
        {
          label: tr("Done multi-page capture", "कई पेज कैप्चर पूरा"),
          enabled: multi.state.active,
          click: () => multi.done(),
        },
        {
          label: tr("Turn Answer Mode off", "उत्तर मोड बंद करें"),
          click: () => stop(),
        },
        {
          label: tr("Quit", "बाहर निकलें"),
          click: () => {
            quitting = true;
            app.quit();
          },
        },
      ]),
    );
  }
}
function cancelPending() {
  controller?.abort();
  traceItems=traceItems.map(item=>["done","error"].includes(item.status)?item:{...item,status:"cancelled",text:""});
  trace.cancel();
  multi.cancel();
}
function stop() {
  gate.setMode(false);
  cancelPending();
  win?.show();
  emit();
}
let writes = Promise.resolve();
function persist(name: string, value: unknown) {
  const data = JSON.stringify(value, null, 2);
  writes = writes
    .catch(() => {})
    .then(async () => {
      await fs.mkdir(app.getPath("userData"), { recursive: true });
      const target = file(name);
      await fs.writeFile(target + ".tmp", data, { mode: 0o600 });
      await fs.rename(target + ".tmp", target);
    });
  return writes;
}
function place() {
  const area = screen.getPrimaryDisplay().workArea;
  win.setOpacity(settings.opacity);
  win.setMinimumSize(320, collapsed ? 170 : 420);
  const width = Math.min(win.getBounds().width, area.width);
  const height = collapsed ? 190 : Math.min(800, area.height);
  if (settings.position === "floating") win.setSize(width, height);
  else
    win.setBounds({
      x: settings.position === "left" ? area.x : area.x + area.width - width,
      y: area.y,
      width,
      height,
    });
}
function hotkey(next: string) {
  if (next === settings.hotkey && globalShortcut.isRegistered(next)) return;
  let ok = false;
  try {
    ok = globalShortcut.register(next, () => {
      if (gate.granted && gate.enabled && !busy) void answer();
      else win.show();
    });
  } catch {}
  if (!ok) throw new WinbotError("hotkey");
  if (next !== settings.hotkey) globalShortcut.unregister(settings.hotkey);
}
let registeredTraceKey = "";
function traceHotkey(next:string){
 if(next===registeredTraceKey&&globalShortcut.isRegistered(next))return;
 let ok=false;try{ok=globalShortcut.register(next,()=>{if(trace.selecting)trace.requestSubmit();else void openTrace();});}catch{}
 if(!ok)throw new WinbotError('hotkey');
 if(registeredTraceKey)globalShortcut.unregister(registeredTraceKey);registeredTraceKey=next;
}
async function openTrace(multiPage=false){
 if(busy||multi.busy)return;
 if(!gate.granted){win.show();win.webContents.send('error','consent');return;}
 gate.setMode(true);win.hide();
 try{await trace.open({...settings},multiPage);}catch(e){trace.cancel();win.show();win.webContents.send('error',e instanceof WinbotError?e.code:'capture');}emit();
}
async function answerTrace(){
 if(busy||multi.busy)return;
 gate.assertCapture();if(!trace.selecting||!trace.selectedCount)throw new WinbotError('traceRegions');
 busy=true;controller=new AbortController();const signal=controller.signal;traceItems=[];
 win.webContents.send('trace-reset');emit();const snapshot={...settings};
 try{
  const items=await trace.run(snapshot,signal,item=>{
   if(signal.aborted)return;
   if(item.status==='error'&&item.error?.startsWith('capture'))void persist('capture-diagnostic.json',{at:new Date().toISOString(),code:item.error,platform:process.platform,electron:process.versions.electron}).catch(()=>{});
   traceItems[item.index]=item;win.webContents.send('trace-item',item);
   // Keep the side panel hidden until every selected region has been captured.
   if(!capturing&&item.status!=="reading")win.show();
  });
  signal.throwIfAborted();
  if(settings.history){history=[...items.filter(i=>i.status==='done').map(i=>({id:crypto.randomUUID(),question:i.question,text:i.text,sources:i.sources,at:new Date().toISOString(),language:(/[\u0900-\u097f]/.test(i.question)?'hi':'en') as 'hi'|'en',web:snapshot.traceSearch&&i.sources.length>0})),...history].slice(0,30);await persist('history.json',history);}
 }catch(e){if(!signal.aborted){const code=e instanceof WinbotError?e.code:'apiFailure';void persist('capture-diagnostic.json',{at:new Date().toISOString(),code,platform:process.platform,electron:process.versions.electron}).catch(()=>{});win.webContents.send('error',code);}}
 finally{trace.cancel();busy=false;capturing=false;controller=undefined;win.show();emit();}
}
const capture = {
  async capture(signal: AbortSignal) {
    gate.assertCapture();
    capturing = true;
    emit();
    await new Promise((r) => setTimeout(r, 180));
    signal.throwIfAborted();
    const visible = win.isVisible();
    win.hide();
    try {
      await new Promise((r) => setTimeout(r, 180));
      signal.throwIfAborted();
      gate.assertCapture();
      const display = screen.getPrimaryDisplay();
      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: {
          width: Math.round(display.size.width * display.scaleFactor),
          height: Math.round(display.size.height * display.scaleFactor),
        },
      });
      signal.throwIfAborted();
      const source =
        sources.find((s) => s.display_id === String(display.id)) || sources[0];
      if (!source || source.thumbnail.isEmpty())
        throw new WinbotError("capture");
      return source.thumbnail.toPNG();
    } catch (error) {
      if (signal.aborted) throw error;
      throw new WinbotError("capture");
    } finally {
      capturing = false;
      if (visible) win.show();
      emit();
    }
  },
};
async function answer(question?: string) {
  if (busy || trace.selecting || multi.busy) return;
  if (!gate.granted || !gate.enabled) {
    win.webContents.send("error", "consent");
    return;
  }
  traceItems=[];win.webContents.send("trace-reset");
  busy = true;
  controller = new AbortController();
  const signal = controller.signal;
  emit();
  try {
    const llm = new OpenAI();
    const pipeline = new Pipeline({
      capture,
      ocr: process.env.OCR_PROVIDER === "vision" ? llm : new TesseractOCR(),
      question: llm,
      search: createSearchProvider(),
      llm,
    });
    const result = await pipeline.run({ ...settings }, signal, question);
    signal.throwIfAborted();
    if (settings.history) {
      history = [result, ...history].slice(0, 30);
      await persist("history.json", history);
    }
    if (!signal.aborted) {
      win.show();
      win.webContents.send("answer", result);
    }
  } catch (e) {
    if (!signal.aborted) {
      const code = e instanceof WinbotError ? e.code : "apiFailure";
      console.warn("winbot:event", code);
      win.show();
      win.webContents.send("error", code);
    }
  } finally {
    busy = false;
    capturing = false;
    controller = undefined;
    emit();
  }
}
async function act(action: string, payload: unknown) {
  switch (action) {
    case "trace-get": return state();
    case "trace-open": await openTrace(); break;
    case "multi-open": if(busy||multi.busy)throw new WinbotError("multiBusy");if(gate.granted)multi.clear();await openTrace(true);break;
    case "multi-add": await openTrace(true);break;
    case "multi-start": {
      if(busy||multi.busy)throw new WinbotError("multiBusy");
      gate.assertCapture();
      const data=payload as {mode?:unknown;regions?:unknown}|null;
      if(data?.mode!=="auto"&&data?.mode!=="watch")throw new WinbotError("traceRegions");
      trace.select(data.regions);
      if(trace.regions.length!==1||!trace.display)throw new WinbotError("multiRegion");
      const region=trace.regions[0],display=trace.display;
      trace.cancel();traceItems=[];win.webContents.send("trace-reset");
      await multi.start(data.mode,region,display,{...settings});
      try{if(globalShortcut.register("F8",()=>void multi.nextPage().catch(()=>win.webContents.send("error","traceScrollUnsupported"))))f8Active=true;else win.webContents.send("error","hotkey");}catch{win.webContents.send("error","hotkey");}
      break;
    }
    case "multi-done": multi.done();break;
    case "multi-next": await multi.nextPage();break;
    case "multi-retry": await multi.retryFailures();break;
    case "multi-clear": multi.clear();break;
    case "trace-select": trace.select(payload); break;
    case "trace-scroll": {
      const direction=(payload as {direction?:unknown}|null)?.direction;
      const auto=(payload as {auto?:unknown}|null)?.auto===true;
      if(direction!=="down"&&direction!=="up")throw new WinbotError("traceRegions");
      await trace.scroll(direction,auto);break;
    }
    case "trace-undo-saved": trace.removeLastSaved();break;
    case "trace-clear-selections": trace.clearSelections();break;
    case "trace-submit":
      if(busy)break;
      gate.assertCapture();trace.select(payload);
      if(!trace.selectedCount)throw new WinbotError("traceRegions");
      void answerTrace().catch(()=>win.webContents.send("error","apiFailure"));break;
    case "trace-cancel": cancelPending();win.show();break;
    case "get":
      return state();
    case "consent":
      if (payload !== true) throw new WinbotError("consent");
      gate.grant();
      break;
    case "revoke":
      gate.revoke();
      stop();
      break;
    case "mode":
      if (payload === false) {
        stop();
        break;
      }
      if (payload !== true || !gate.granted) throw new WinbotError("consent");
      gate.setMode(true);
      void answer();
      break;
    case "capture":
      void answer();
      break;
    case "followup":
      if (
        typeof payload !== "string" ||
        !payload.trim() ||
        payload.length > 4000
      )
        throw new WinbotError("noText");
      if (!busy && gate.enabled && gate.granted) {
        followups++;
        void answer(payload);
      }
      break;
    case "settings": {
      const next = settingsSchema.parse(payload);
      // A settings change cancels work using the old privacy/provider options.
      cancelPending();
      if(next.hotkey===next.traceHotkey)throw new WinbotError('hotkey');
      hotkey(next.hotkey);
      try{traceHotkey(next.traceHotkey);}catch(e){if(next.hotkey!==settings.hotkey)globalShortcut.unregister(next.hotkey);hotkey(settings.hotkey);throw e;}
      if (!next.history) {
        history = [];
        await persist("history.json", []);
      }
      await persist("settings.json", next);
      settings = next;
      place();
      break;
    }
    case "clear":
      cancelPending();trace.clear();multi.clear();traceItems=[];win.webContents.send("trace-reset");
      controller?.abort();
      history = [];
      await persist("history.json", []);
      win.webContents.send("cleared");
      break;
    case "collapse":
      collapsed = !collapsed;
      place();
      break;
    case "export": {
      const result = await dialog.showSaveDialog(win, {
        defaultPath: "winbot-settings.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (result.filePath)
        await fs.writeFile(result.filePath, JSON.stringify(settings, null, 2));
      break;
    }
    case "import": {
      const result = await dialog.showOpenDialog(win, {
        properties: ["openFile"],
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (result.filePaths[0]) {
        const stat = await fs.stat(result.filePaths[0]);
        if (stat.size > 64000) throw new WinbotError("settings");
        const next = settingsSchema.parse(
          JSON.parse(await fs.readFile(result.filePaths[0], "utf8")),
        );
        await act("settings", next);
      }
      break;
    }
    case "link":
      if (typeof payload !== "string") throw new Error();
      {
        const url = new URL(payload);
        if (!["https:", "http:"].includes(url.protocol)) throw new Error();
        await shell.openExternal(url.href);
      }
      break;
    default:
      throw new Error("Unsupported action");
  }
  emit();
  return state();
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => win?.show());
  app.whenReady().then(async () => {
    try {
      trustWindowsCertificates();
    } catch {
      console.warn("winbot:event", "systemCa");
    }
    const userEnv=file(".env");
    const envPath=app.isPackaged
      ? (existsSync(userEnv)?userEnv:path.join(path.dirname(app.getPath("exe")),".env"))
      : path.join(app.getAppPath(),".env");
    dotenv.config({
      path: envPath,
      quiet: true,
    } as any);
    if(process.env.TESSDATA_PATH&&!path.isAbsolute(process.env.TESSDATA_PATH)){
      process.env.TESSDATA_PATH=path.resolve(path.dirname(envPath),process.env.TESSDATA_PATH);
    }
    try {
      settings = settingsSchema.parse(
        JSON.parse(await fs.readFile(file("settings.json"), "utf8")),
      );
    } catch {}
    try {
      const saved = JSON.parse(await fs.readFile(file("history.json"), "utf8"));
      if (settings.history && Array.isArray(saved))
        history = saved
          .filter(
            (x) =>
              typeof x.text === "string" &&
              typeof x.question === "string" &&
              Array.isArray(x.sources),
          )
          .slice(0, 30);
    } catch {}
    win = new BrowserWindow({
      width: 440,
      height: 800,
      minWidth: 320,
      minHeight: 420,
      alwaysOnTop: true,
      title: "Winbot",
      backgroundColor: "#111922",
      webPreferences: {
        preload: path.join(__dirname, "preload.cjs"),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    win.webContents.on("will-navigate", (e) => e.preventDefault());
    win.webContents.session.setPermissionRequestHandler((_w, _p, callback) =>
      callback(false),
    );
    ipcMain.handle("command", async (event, action, payload) => {
      if (
        !(event.sender === win.webContents || (trace.owns(event.sender) && ["trace-get","trace-select","trace-scroll","trace-undo-saved","trace-clear-selections","trace-submit","trace-cancel","multi-start"].includes(action))) ||
        event.senderFrame !== event.sender.mainFrame
      )
        throw new Error("Unauthorized");
      try {
        return { ok: true, state: await act(action, payload) };
      } catch (e) {
        return {
          ok: false,
          error: e instanceof WinbotError ? e.code : "settings",
        };
      }
    });
    tray = new Tray(icon());
    place();
    emit();
    try {
      hotkey(settings.hotkey);
      traceHotkey(settings.traceHotkey);
    } catch {
      console.warn("winbot:event", "hotkey");
    }
    win.on("close", (e) => {
      if (!quitting) {
        e.preventDefault();
        win.hide();
      }
    });
    await win.loadFile(path.join(__dirname, "../dist/index.html"));
  });
  app.on("before-quit", () => {
    quitting = true;
    controller?.abort();
    trace.cancel();
    multi.cancel();
    globalShortcut.unregisterAll();
  });
  app.on("window-all-closed", () => {});
  app.on("activate", () => win?.show());
}
