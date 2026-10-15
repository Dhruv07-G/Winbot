# Winbot · MVP

A visible, on-demand screen assistant for Windows, macOS, and Linux. Electron + React + TypeScript, local Hindi/English OCR, replaceable search and AI adapters.

See [VALIDATION.md](VALIDATION.md) for checks performed and outstanding desktop/live-provider validation. The source builds and unit tests pass; native startup could not be verified in the managed build environment.

## Windows first: install and run

Install Node.js 24 LTS (or Node.js 22.12+) and Git. In PowerShell, from this project directory:

```powershell
npm ci
Copy-Item .env.example .env
notepad .env
npm run dev
```

Set `OPENAI_API_KEY` and `BRAVE_API_KEY` in `.env`. The default model is `gpt-4.1-mini`; change `OPENAI_MODEL` and optionally `OPENAI_BASE_URL` for a compatible chat-completions endpoint. No key is exposed to the renderer or included in exports. Restart after changing environment variables.

`npm run dev` builds and launches the real desktop app (no hot reload). `npm start` launches an existing build. `npm test` runs deterministic unit tests. `npm run build` checks TypeScript and bundles both layers. `npm run package` creates an unpacked desktop distribution for the current OS; it does not produce signed installers. In packaged mode, place `.env` in Electron's `userData` directory below, rather than inside the application bundle.

Launch commands automatically run `npm run setup:desktop` to download the pinned Electron runtime if it is missing. This first launch needs internet access; subsequent launches reuse the installed runtime.

MVP packaging leaves application resources unpacked so local OCR worker and WebAssembly assets retain ordinary filesystem paths.

`npm run test:ui` builds and runs the Electron renderer/preload smoke test with synthetic state. It does not capture the desktop or call providers; it creates `preview.png` from Winbot's own UI. If Node 24 reports a certificate-chain error on a managed Windows network, use `$env:NODE_USE_SYSTEM_CA='1'` before installation to use Windows' trusted certificates. Do not disable TLS verification.

## First answer

1. Launch Winbot. Select English, हिन्दी, or automatic language selection.
2. Read the disclosure and explicitly grant access. This permission resets on every launch. The operating system may also require permission.
3. Put a question on the primary display and click **Start Answer Mode**. One capture occurs, with a capture tray indicator; the panel hides briefly to avoid covering the question.
4. Tesseract reads English and Hindi, Brave searches the extracted text, and the AI returns an explanation with numbered references. Source buttons open actual search result pages. References are model-generated and should be checked.
5. Request another capture with **Capture again** or `Ctrl+Shift+Space` (`Command+Shift+Space` on macOS). Nothing captures automatically between requests. Turning mode off cancels pending work.

If OCR is disabled, type a question instead. If search is disabled, answers are marked as not web-verified. A failed network request produces an error, not a fabricated offline answer. There is no offline LLM bundled. Typed questions currently require consent and Answer Mode as well.

## OCR and cloud vision

`OCR_PROVIDER=local` is the default. Tesseract uses `eng` and `hin` together. Its first run needs network access to obtain language assets. To supply offline trained data, set `TESSDATA_PATH` to a directory containing compatible `eng.traineddata.gz` and `hin.traineddata.gz` files. The app does not cache screenshots. OCR quality depends on font size, contrast, display resolution, and layout; enlarge small text or type a question when needed.

`OCR_PROVIDER=vision` selects the multimodal API adapter. The consent screen explicitly discloses that screenshots will be uploaded to the configured AI service. With local OCR, only extracted text is sent to AI/search providers. Do not use Winbot over sensitive content you do not want those providers to receive. Provider policies govern server-side retention.

## macOS

Use the same npm commands; copy the environment file with `cp .env.example .env`. Grant Screen & System Audio Recording / Screen Recording access to the running Electron/Winbot app in System Settings → Privacy & Security, then restart if prompted. The MVP does not record audio. macOS opacity and always-on-top behavior are subject to OS window rules. Signing and notarization are future release work.

## Linux

Use the same npm commands and `cp`. Run inside a desktop session with Electron's required GTK/NSS libraries installed. X11 is the initial target. Wayland capture may require PipeWire and an xdg-desktop-portal backend and may display a source-selection dialog. Wayland window placement and global shortcuts vary by compositor; use the panel's capture button if a shortcut is unavailable. Do not run as root or disable Electron's sandbox.

## Settings and data

Appearance: dark/light themes, accent, system/Arial/Nirmala UI fonts, font size, opacity, left/right edge placement or freely movable floating window, collapse, and normal native resizing. Docking means edge placement, not reserved OS work-area space. Settings take effect with **Save settings**. Import/export includes settings only, not keys or consent. A conflicting shortcut is rejected. Auto UI language follows OS locale; auto answer language detects Devanagari in extracted/typed text. Explicit English/Hindi overrides it. Install suitable Devanagari fonts on Linux if absent.

Settings and up to 30 text answers are stored as JSON under Electron `userData`:
- Windows: `%APPDATA%\winbot`
- macOS: `~/Library/Application Support/winbot`
- Linux: `~/.config/winbot` (or the XDG config location)

**Clear all** deletes saved history and the current displayed answer. Disabling history deletes saved entries. History is plaintext, not encrypted. The follow-up counter is session-only; after three typed follow-ups, short-style users see a recommendation to try detailed answers. Other rules suggest web search or a larger font. Follow-ups are standalone questions in this MVP, without automatic conversation context.

## Privacy and limits

No recording loop, stealth features, screen-sharing evasion, or proctoring evasion exist. Screenshots stay in memory on the client and are not written to history or logs. Logs contain event codes only. The app has no autostart registration. Closing the window hides it; use the tray menu to quit. Users are responsible for following school, workplace, and exam rules.

The full primary screen is captured, so unrelated visible text can enter OCR/search. Selecting a region and reviewing extracted text before upload are roadmap items. Search uses snippets, not full-page crawling. Treat answers as fallible and check cited sources. Native capture behavior must be smoke-tested on each target OS before distribution.

Electron's screen enumeration can transiently create thumbnails of other connected displays; only the selected primary display image is sent into OCR. No thumbnails are saved.

## Development and extension

See [ARCHITECTURE.md](ARCHITECTURE.md) for the module map. Implement `CaptureProvider`, `OCRProvider`, `SearchProvider`, or `LLMProvider` from `src/core/model.ts`, then wire the adapter in `src/desktop/main.ts`. Keep provider credentials and network calls in the main process. Recommendations are a pure rule function and can later be replaced with an opt-in recommendation service.

Manual acceptance checklist:
- No capture before consent or while mode is off; hotkey opens panel without capture in those states.
- Capture badge/tray changes, exactly one screenshot per request, and off/revoke cancels results.
- English and Hindi questions return readable answers; source links open in the browser.
- Missing keys, unavailable network, and empty text show localized errors.
- Settings survive restart; consent does not; invalid imports are rejected.
- History clears, disabling history removes its file contents, close hides, tray Quit exits.

API references: [Electron desktop capture](https://www.electronjs.org/docs/latest/api/desktop-capturer), [Tesseract.js](https://github.com/naptha/tesseract.js), [Brave Search](https://api-dashboard.search.brave.com/documentation), [OpenAI Chat Completions](https://platform.openai.com/docs/api-reference/chat).
