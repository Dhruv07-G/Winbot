# Winbot · desktop preview

A visible, on-demand screen assistant built with Electron, React, and TypeScript. It reads selected questions with local Hindi/English OCR and answers through your configured AI provider. The downloadable build currently targets **Windows x64**. macOS and Linux can be built from source, but their screen-capture paths still need device testing. Android and iOS apps do not exist yet.

See [VALIDATION.md](VALIDATION.md) for checks performed and remaining limitations. Answers can be wrong or incomplete, especially with dense or partially visible question lists. Check important answers yourself.

## Download and run on Windows

Download `Winbot-*-win-x64.zip` from [Releases](https://github.com/Dhruv07-G/Winbot/releases), extract the entire ZIP, and keep the folder together. Copy `.env.example` to `.env` beside `Winbot.exe`, then edit `.env` with **your own** AI key, model, and endpoint. To enable web sources, add a Brave or Tavily search key as described below. No key is included in the public download. Double-click `Winbot.exe`; this portable build makes no Start Menu entry and requires no administrator installation. The executable is unsigned, so Windows may show a publisher warning. Download only from this repository's release page and verify the published SHA-256 file if you need to check the download.

Winbot asks for screen consent on each launch. It captures only when you request an answer or start a visible multi-page session. If `%APPDATA%\winbot\.env` already exists, that file takes priority over the portable `.env`. The portable build includes English and Hindi OCR models when available at packaging time. Relative `TESSDATA_PATH` values resolve against the selected `.env` directory.

## Build from source

On Windows, double-click `Start-Winbot.cmd` after setup or use the commands below.

Install Node.js 24 LTS (or Node.js 22.12+) and Git. In PowerShell, from this project directory:

```powershell
npm ci
Copy-Item .env.example .env
notepad .env
npm run dev
```

Set `OPENAI_API_KEY` and `BRAVE_API_KEY` in `.env`. The default model is `gpt-4.1-mini`; change `OPENAI_MODEL` and optionally `OPENAI_BASE_URL` for a compatible chat-completions endpoint. These field names also work with compatible providers; each person must supply their own key and follow that provider's setup and quota rules. If you only have an AI key, turn **Web Search** off in Settings before answering. No key is exposed to the renderer or included in exports. Restart after changing environment variables.

For a search provider with a free plan, sign up at [Tavily](https://app.tavily.com) and set `SEARCH_PROVIDER=tavily` plus `TAVILY_API_KEY` in `.env`; a Brave key is then unnecessary. As checked on 16 October 2026, [Tavily's Researcher plan](https://www.tavily.com/pricing) includes 1,000 credits per month without a credit card. Winbot explicitly uses basic search and disables automatic depth upgrades. This replaces web search only; the AI answer provider still needs usable quota.

`npm run dev` builds and launches the real desktop app (no hot reload). `npm start` launches an existing build. `npm test` runs deterministic unit tests. `npm run build` checks TypeScript and bundles both layers. `npm run package` creates an unpacked desktop distribution for the current OS; it does not produce signed installers. In packaged mode, place `.env` in Electron's `userData` directory below, rather than inside the application bundle.

Launch commands automatically run `npm run setup:desktop` to download the pinned Electron runtime if it is missing. This first launch needs internet access; subsequent launches reuse the installed runtime.

MVP packaging leaves application resources unpacked so local OCR worker and WebAssembly assets retain ordinary filesystem paths.

`npm run package:portable` assembles a local Windows portable folder using the installed Electron runtime and production dependencies. It preserves an existing portable `.env` for local use. **Never upload that folder directly.** `npm run package:public:win` builds a ZIP from an allowlist, excludes `.env` and logs, and emits a SHA-256 file; inspect those outputs before publishing. The standard `npm run package` path remains available for unpacked builds.

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

Multi-page capture is a bounded, visible, user-started session. No background recording outside that session, stealth features, screen-sharing evasion, or proctoring evasion exist. Screenshots stay in memory on the client and are not written to history or logs. Logs contain event codes and per-stage timings, never question text or screenshots. The app has no autostart registration. Closing the window hides it; use the tray menu to quit. Users are responsible for following school, workplace, and exam rules.

Ordinary Answer Mode captures the primary screen, so unrelated visible text can enter OCR/search. Trace mode captures only the selected rectangles. Reviewing extracted text before upload remains a roadmap item. Search uses snippets, not full-page crawling. Treat answers as fallible and check cited sources. Native capture behavior must be smoke-tested on each target OS before distribution.

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

### When an old question is answered
Click **Capture new question** for each new screen. The expanded **Detected question** shows the selected question and choices. Screen OCR is filtered through the configured AI provider before web search, so old answers and app instructions are excluded. This adds one AI call per screen capture. If several questions are visible and selection is unclear, scroll to show only the intended one or type it in the question field.

Optional live regression (uses your configured providers and API quota, with synthetic text only): `node scripts/test-question-live.mjs`.

Screen-derived MCQ answers give the answer text without an option letter because OCR can miss or misread labels. Use the visible original options to match the answer text; typed questions retain their supplied labels.


## Trace & Answer

Grant screen consent in the side panel, then click **Trace & Answer** or press **Ctrl+Shift+T** (macOS: Cmd+Shift+T). Draw rectangles or freehand strokes around complete questions and every option. Each stroke captures its rectangular bounding box. Select up to 16 regions on the monitor containing the pointer. You can put numbered Q1/Q2/Q3 questions in one rectangle; Winbot creates a separate result card for each. Separate rectangles usually give OCR a clearer reading of option labels. To reach questions below the screen, finish the visible selections, release the mouse, then hold the cursor at the blue bottom edge or press **Scroll down ↓**. Winbot saves only those selected rectangles in memory before scrolling the underlying page. On Windows, the wheel is sent into the middle of the document and the cursor returns to its place. Continue tracing below and press Answer once for the whole batch. Move the cursor away and back to the edge to continue scrolling after eight wheel steps. The controls start at the upper-right; drag **Move** if they cover any text. When recognition is unclear, expand **Detected text** to see what OCR read and retrace a larger region.

- **Redraw Rn** replaces a region on the current screen. **Rn ×** removes it; **Undo** / Ctrl+Z removes the last region, including one saved before scrolling. **Clear** removes all selections and erases saved images.
- **Enter**, **Answer**, or the trace hotkey submits all selections. **Esc** cancels selection and erases any selected-region images held in memory. **Cancel batch**, switching Answer Mode off, or revoking consent aborts pending work; unfinished cards become Cancelled and late results are ignored.
- Cards retain Q1/Q2 ordering even when later questions finish first. Expand Detected question to check OCR. MCQ labels and option text come from the selected region. Incomplete option sequences return **Unclear – re-trace**. This initial validator conservatively requires four to eight sequential choices; two- or three-choice MCQs need a later validation improvement.
- Settings persist trace hotkey, color, thickness, MCQ explanation level, short/detailed answers, language, speed preference, and internet toggle. Conflicting shortcuts are rejected and previous shortcuts retained. Auto language follows the detected question.
- Fastest/Balanced/Most accurate use `TRACE_MODEL_FAST`, `TRACE_MODEL_BALANCED`, and `TRACE_MODEL_ACCURATE` in `.env`; omitted values use your existing `OPENAI_MODEL`. Trace always uses local English/Hindi OCR. Internet sources are off by default for speed.

The transparent overlay briefly hides to capture selected rectangles before each scroll, and closes before the final capture. A native worker captures only each requested rectangle in memory; images are resized to at most 1800 pixels on the longest side. Up to three OCR workers run concurrently, followed by parallel streamed model requests. Identical text/settings/model requests share a two-minute memory cache (maximum 50 results), cleared with Clear all. No screenshot files are created. Timing logs cover capture, OCR, search, first token, model completion, and display-ready. Two-second answers are a target, not a guarantee; cold OCR/model and network latency can take longer.

Windows uses GDI region capture and native wheel scrolling. macOS and X11 scrolling use native event adapters that still need device testing. macOS uses CoreGraphics (OS screen permission required; this adapter needs device testing and migration to ScreenCaptureKit). Linux uses X11; Wayland currently reports an unsupported message. Multi-monitor sessions currently select one monitor at a time. Native capture and end-to-end timing require manual verification on each OS.


### Trace OCR recovery
Small selected images are enlarged up to 2× before OCR (longest side remains capped at 1800 pixels). If the first read is empty or has an incomplete MCQ label sequence, Winbot rereads the same in-memory image with sparse-text layout. English questions use an English-only retry; Hindi questions retain bilingual OCR. Labels are never filled in from their positions: if the retry still cannot read every option, retrace at a larger text size.

The OCR cleanup also handles the reproduced `CQ)` punctuation artifact as `C)` only when the observed labels form a complete four-option A/B/C/D sequence. It does not convert unreadable `(0` into C by position.

For a live regression without desktop capture, run `node scripts/test-trace-live.mjs`. It reads a synthetic MCQ image, runs local OCR, then makes one request to your configured AI provider and checks the streamed answer. It uses API quota and prints only stage timings and the final answer. On Windows, the app includes Windows-trusted root certificates for provider connections while retaining Node's default roots and TLS verification.


## Multi-page Capture

After granting screen consent, click **New multi-page capture**. Draw one rectangle around the question list, including its choices. Choose **Auto pages** to let Winbot scroll the document, or **Watch scrolling** to scroll it yourself. The blue capture badge stays visible with a count and **Done** button. In Watch mode, use its **Next** button or **F8** to scroll one page. In Trace selection, **PageUp** and **PageDown** send a scroll to the underlying document while the overlay hides. The existing Trace & Answer flow is unchanged.

Auto mode captures the selected area, scrolls, waits about 300 ms, and repeats. Watch mode samples at up to 2.5 frames per second while the user scrolls. Both modes stop at **Done** or 40 distinct frames; auto mode also stops when the next frame is identical, and Watch mode stops after roughly two seconds of unchanged frames after scrolling. **New multi-page capture** clears the previous Question Basket before selecting a new list. Use **Add more pages** only to continue the current list; previously answered entries are skipped. **Clear basket** erases the session text. The side panel shows numbered Q cards, pending/answered counts, detected text, and compact MCQ answers. Pending questions are answered in groups of six with one provider request per group. Temporary provider failures are retried; **Retry provider errors** reuses recognized text without recapturing the screen. The existing explanation and internet settings apply.

Frames are cropped to the selected area, downscaled to at most 1200 pixels on the longest side, read with local English/Hindi Tesseract, and erased from memory after OCR. Only extracted text reaches the AI and optional search providers. Frame overlap is merged using explicit Q numbers and fuzzy stem matching. Incomplete or unclear MCQs retain the existing “Unclear – re-trace” safeguard. OCR quality still depends on readable text and complete options. A dynamic page can prevent identical-frame detection, so the 40-frame limit is the backstop. The badge briefly hides during a capture if it overlaps the selected rectangle; the tray capture indicator remains active.

The multi-page core is platform-independent. The Windows portable app wires it to GDI capture and the focus-aware wheel adapter. macOS and X11 use the existing native region and synthetic-scroll adapters; device verification is still required. Wayland automatic scrolling is unavailable. The mobile-scroll TypeScript module defines consent-checked Android MediaProjection/Accessibility/ML Kit and iOS ReplayKit/Vision bridge contracts; this repository does not yet contain Android or iOS native hosts or installable mobile apps. iOS permits Watch mode only. A ScrollProvider.readText hook lets a future browser/PDF integration provide DOM/PDF text directly and bypass OCR; external browser/PDF extraction is not yet installed.
