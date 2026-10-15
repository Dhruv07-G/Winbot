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
      "PASS: renderer loads, preload isolation, consent checkbox, permission flow, Hindi UI",
    );
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
