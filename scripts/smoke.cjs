// Renderer/preload integration smoke test. No screen capture or network calls.
const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
// Keep this test's Chromium profile separate from the user's Winbot settings.
app.setPath("userData", path.resolve("../../work/smoke-userdata"));
app.whenReady().then(async () => {
  let win;
  try {
    const settings = {
      language: "en",
      theme: "dark",
      accent: "#70e0c4",
      font: "system-ui",
      fontSize: 15,
      opacity: 1,
      position: "right",
      style: "short",
      ocr: true,
      search: true,
      sources: true,
      history: true,
      hotkey: "CommandOrControl+Shift+Space",
      traceHotkey: "CommandOrControl+Shift+T",
      traceColor: "#2388ff",
      traceThickness: 3,
      traceMCQStyle: "answer",
      traceTextStyle: "short",
      traceSpeed: "fastest",
      traceSearch: false,
    };
    const state = {
      settings,
      history: [],
      consent: false,
      mode: false,
      busy: false,
      capturing: false,
      collapsed: false,
      recommendations: [],
      vision: false,
      locale: "en-US",
      traceItems: [],
      traceSelecting: false,
      traceCount: 0,
    };
    ipcMain.handle("command", (_event, action, payload) => {
      if (action === "consent") state.consent = true;
      if (action === "settings") state.settings = payload;
      return { ok: true, state };
    });
    win = new BrowserWindow({
      show: false,
      width: 440,
      height: 800,
      webPreferences: {
        preload: path.resolve("dist-desktop/preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    await win.loadFile(path.resolve("dist/index.html"));
    const evaluate = (code) => win.webContents.executeJavaScript(code);
    const wait = () => new Promise((r) => setTimeout(r, 300));
    await wait();
    assert.equal(await evaluate("typeof window.require"), "undefined");
    assert.match(
      await evaluate("document.body.innerText"),
      /Let’s start with permission/,
    );
    assert.equal(
      await evaluate(
        "[...document.querySelectorAll('button')].find(x=>x.textContent==='Grant permission').disabled",
      ),
      true,
    );
    await evaluate("document.querySelector('input[type=checkbox]').click()");
    await wait();
    await evaluate(
      "[...document.querySelectorAll('button')].find(x=>x.textContent==='Grant permission').click()",
    );
    await wait();
    assert.match(
      await evaluate("document.body.innerText"),
      /Start Answer Mode/,
    );
    win.webContents.send("trace-item", {index:0,question:"Synthetic test",text:"Q1: C) Pacific",status:"done",sources:[]});
    await wait();
    assert.match(await evaluate("document.body.innerText"), /Q1: C\) Pacific/);
    win.webContents.send("trace-item", {index:1,question:"Synthetic Q2",text:"Q2: C) 36",status:"done",sources:[]});
    win.webContents.send("trace-item", {index:2,question:"Synthetic Q3",text:"Q3: B) Nucleus",status:"done",sources:[]});
    await wait();
    assert.match(await evaluate("document.body.innerText"), /Q2: C\) 36/);
    assert.match(await evaluate("document.body.innerText"), /Q3: B\) Nucleus/);
    state.multi={active:false,answering:false,pages:5,basket:[
      {id:1,number:1,question:"Q1. Synthetic",status:"answered",answer:"Q1: B) Mercury"},
      {id:25,number:25,question:"Q25. Synthetic",status:"pending"}
    ]};
    win.webContents.send("state",state);
    await wait();
    assert.match(await evaluate("document.body.innerText"), /Question Basket/);
    assert.match(await evaluate("document.body.innerText"), /Q25/);
    assert.match(await evaluate("document.body.innerText"), /Q1: B\) Mercury/);
    state.traceItems=[{index:0,question:"Synthetic test",text:"",status:"cancelled",sources:[]}];
    win.webContents.send("state",state);
    await wait();
    assert.match(await evaluate("document.body.innerText"), /Cancelled/);
    await fs.writeFile(
      path.resolve("preview.png"),
      (await win.webContents.capturePage()).toPNG(),
    );
    state.settings = { ...settings, language: "hi" };
    win.webContents.send("state", state);
    await wait();
    assert.match(
      await evaluate("document.body.innerText"),
      /उत्तर मोड शुरू करें/,
    );
    console.log(
      "PASS: renderer loads, preload isolation, consent checkbox, permission flow, three result cards, Hindi UI",
    );
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
