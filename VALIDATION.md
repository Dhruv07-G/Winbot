# Validation · 16 October 2026

## Passed
- Production TypeScript check, Vite renderer build, and Electron main/preload bundling with Electron 44.7.2 types.
- 24 tests across consent, pipeline, settings, recommendations, provider adapters, and the real desktop IPC command handler with simulated OS capabilities, running on Vitest 5.0.4. Tavily tests verify provider selection, basic-search parameters, Hindi queries, safe source URLs, and missing-key handling.
- Tests cover capture gating, permission revocation, no capture when OCR is disabled, cancellation before network stages, image-buffer clearing on success/failure, empty OCR, Hindi detection, typed questions, invalid settings, safe source protocols, missing credentials, authentication failures, and network failures.
- npm dependency installation completed; package-lock.json pins the resolved dependencies.
- Portable Windows bundle assembled at `release/portable-win-x64/Winbot.exe` with 18 production dependency directories. Required main/preload/renderer and OCR files were checked.
- Real Tesseract OCR recognized both English and Hindi text in a synthetic bilingual PNG. Repeated successfully using the portable bundle's own dependencies and local gzip model files, with model caching disabled for that test.
- Local development and portable `.env` files are configured for installed OCR models. Credentials are kept out of Git and generated diagnostic output.

## Live provider check
- Tavily is selected in the local configurations and included in the rebuilt portable app. The newly configured Tavily key was tested successfully: its API returned HTTP 200 and five sources. A Brave key is unnecessary for this configuration.
- After switching the portable configuration to Gemini's compatible endpoint and `gemini-3.5-flash-lite`, the complete synthetic-image pipeline passed: local OCR, Tavily search (HTTP 200, five sources), and Gemini answering (HTTP 200). The Hindi response identified India's capital and included source references. The earlier OpenAI quota/billing rejection no longer blocks the currently configured provider.
- Existing credentials were preserved and were not printed, committed, or copied into diagnostics.
- No actual screen content was captured or uploaded. Existing application settings were not changed by this check.

## Not verified
- Electron's native process exits before the UI smoke test reports any assertions in this managed Windows environment. The earlier runtime returned Windows exit code `0x80000003`; the updated runtime also exits without test output. The cause is not confirmed. No desktop UI pass or preview image is claimed.
- The actual packaged `Winbot.exe` also exits with `0x80000003` when launched in this environment. Native desktop startup and actual screen capture remain unverified. The synthetic-image OCR/search/LLM pipeline passed independently. Screen access was not granted through the app.
- macOS/Linux behavior and signed installer distribution have not been exercised here. Standard electron-builder packaging failed on a sandbox cache rename permission; the portable assembly path succeeded using the already installed runtime.

To complete desktop acceptance on a normal desktop session, run `npm run test:ui`, then follow the manual checklist in README.md with your API keys. The UI test uses synthetic state and does not capture the desktop. Do not disable Electron's sandbox to work around startup failures.

For the installed portable build, open `release/portable-win-x64/Winbot.exe` outside this managed command environment. Its adjacent `.env` now has the tested Gemini and Tavily configuration. Keep the whole folder together. No system-wide installer or Start Menu registration was performed.

## Dependency audit
Updated Electron from major 40 to 44 and Vitest from major 3 to 5 to remove the reported high/critical advisories. The final audit reports eight moderate advisories in the electron-builder packaging dependency chain, rooted in sprintf-js (`GHSA-hp3w-g68c-fv3c`). `npm audit fix` did not resolve that chain. No forced overrides were introduced. Revisit the packaging dependencies before distributing installers.

## Implementation limits
Primary-display capture, snippet-based web evidence, session-only recommendation counters, and standalone typed follow-ups. Settings use plaintext local JSON; keys stay in the local .env file. See README.md and ROADMAP.md for platform caveats and follow-on work.

## Current-question regression fix (2026-10-17)

The captured OCR included the new Red Planet MCQ plus an older instruction about New Delhi. Previously all OCR text went directly to search, where truncation favored the old instruction. Screen captures now pass through a swappable QuestionProvider before search and answering. Typed questions bypass selection. Selected questions retain bilingual text and MCQ options, and are displayed expanded in the UI. A new request clears the previous displayed answer.

Validation: 33 automated tests passed; TypeScript check and Vite UI build passed. A live synthetic reproduction containing both the stale Delhi instruction and the bilingual planet MCQ selected only the MCQ, fetched five sources, and answered B. Mars. No desktop capture was needed for this regression. Selection adds one model call per screen capture and can still be ambiguous on crowded screens; display only the intended question or type it when needed.

Environment note: this session's native esbuild resolver could not enumerate an ancestor directory even after read permission was granted. Desktop bundles were produced using the installed Rollup and TypeScript libraries with local module resolution. The live Node probe used --use-system-ca to trust the installed system CA, without disabling TLS verification. Portable resources/app was updated in place; credentials were preserved.

## MCQ label safeguard (2026-10-18)
The ocean test stored only `A Atlantic B Pacific` as its detected question, so answering used an incorrect label. The original screenshot/raw OCR was not retained; OCR and selection cannot be distinguished retrospectively. Screen-derived answers now request answer text without option letters, and strip common leading letter-label formats. Typed questions retain supplied labels. Selection explicitly preserves labels without renumbering. This is a safeguard, not a claim that OCR labels are now reliable. Exact screen-label identification remains a follow-up improvement.

## Readable explanations (2026-10-18)
Answers now render Markdown headings/lists/bold and KaTeX fractions instead of showing raw formatting code. Math CSS and fonts are bundled locally; model HTML, images and links are not executed or fetched. Prompts request the final answer followed by simple steps, units and concrete examples. Existing text history uses the new renderer.
Validation: 43 regression tests passed, plus one visual-preview fixture. TypeScript and production UI build passed. A 440px-wide browser preview confirmed readable lists, Hindi and properly typeset fractions. Portable UI and desktop bundles were updated; restart Winbot to load them. The visual-preview test generates only synthetic test content.


## Trace integration — 2026-10-20

- TypeScript check passed; 66 automated tests passed across 8 files.
- Tests include MCQ label preservation, cut-off options, parallel numbering, streamed SSE chunks, cancellation, image-buffer clearing, overlay selection validation and editing, no capture on opening/cancelling, overlay closure before capture, persisted hotkeys and rollback.
- Windows Koffi native addon loads successfully. Production renderer build includes both side panel and transparent overlay.
- These tests mock OS capture and model services. Live desktop overlay appearance, native screenshot correctness, API latency and cross-platform capture remain manual acceptance checks; the tests do not establish a two-second latency guarantee.


### Final integration check — 2026-10-21

68 automated tests passed across 9 files; TypeScript and desktop compilation passed. Added Windows/X11 BGRA bitmap conversion coverage, including memory clearing. Updated renderer smoke script covers numbered cards and cancellation, but execution exited before JavaScript with Windows status 0x80000003; this is not a passing UI smoke test. Computer Use found the installed Winbot window but returned an unrelated browser screenshot, so visual acceptance remains unverified. Portable files were updated without replacing API credentials.


### Trace capture investigation — 2026-10-21

User reports capture failure after drawing a Trace region, including after restart. Root cause remains unconfirmed. Installed Koffi loads, and the installed worker passed synthetic memory-bitmap copy/read/transfer in the packaged Electron 44.7.2 runtime (scripts/test-native-capture.cjs). This test never copies desktop pixels and does not prove real screen capture works.

Replaced the generic permission advice with distinct capture-stage error codes. Trace failures save only timestamp, code, platform, and Electron version to userData/capture-diagnostic.json; no questions, images, or API credentials are included. Existing 68 tests passed, followed by 5 region tests including 3 new native-stage propagation cases. Type checking, renderer build and desktop build passed. Installed main and worker SHA256 hashes match. Awaiting user's live diagnostic code before claiming a root-cause fix.


### OCR option-label recovery — 2026-10-22

The user's successful capture stored the complete organelle question, but OCR misread C) as (0. The conservative MCQ validator therefore returned Unclear. Updated region preprocessing to enlarge small text up to 2×, added sparse-layout OCR retry (English-only when no Devanagari was detected), and restored bilingual OCR for subsequent work. A real synthetic image reproduced CQ) for C); a narrow cleanup retains the observed C only when all four A/B/C/D labels form a complete sequence. Missing labels remain rejected.

TypeScript and desktop build passed. 77 tests passed in 10 files, including retry, no invented missing labels, complete-MCQ fast path, Hindi retry, cancellation, and CQ) cleanup. Actual local Tesseract OCR recovered all four correct labels on a synthetic dark-background organelle-question image in 1225 ms. This is an OCR measurement, not an end-to-end latency guarantee or verification of the user's original image. No screenshots were stored or sent for this test. Portable main bundle copied and hash-verified; requires a full app restart to load it.

### Live synthetic Trace regression — 2026-10-24

An opt-in regression now reads a synthetic organelle MCQ fixture and exercises the Trace capture interface, local OCR, streaming Gemini response, and answer formatter. The configured provider returned `Q1: C) Mitochondrion`; the run completed in 2.7 seconds, including about 1.1 seconds for OCR and 1.6 seconds for the model. Search was disabled for this test. It does not capture the desktop or prove performance of live selection.

The first provider attempt failed with Node's `UNABLE_TO_VERIFY_LEAF_SIGNATURE`. Including Windows-trusted roots alongside Node's default roots resolved the connection without disabling TLS verification. The same trust setup now runs at desktop startup. A full application restart is required after updating the portable main bundle. The user's live Trace selection still needs an on-screen acceptance test.
