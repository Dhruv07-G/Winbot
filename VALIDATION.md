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
- A real pipeline run used the synthetic bilingual image, local OCR, and live Tavily search. OCR and search completed; the configured OpenAI endpoint returned HTTP 429. Sanitized inspection of the response identified quota/billing-related text. No successful live AI answer has been verified; usable AI quota or another configured answer provider is still required.
- Existing credentials were preserved and were not printed, committed, or copied into diagnostics.
- No actual screen content was captured or uploaded. Existing application settings were not changed by this check.

## Not verified
- Electron's native process exits before the UI smoke test reports any assertions in this managed Windows environment. The earlier runtime returned Windows exit code `0x80000003`; the updated runtime also exits without test output. The cause is not confirmed. No desktop UI pass or preview image is claimed.
- The actual packaged `Winbot.exe` also exits with `0x80000003` when launched in this environment. Native desktop startup, actual screen capture, and a successful live search/LLM round-trip remain unverified. Screen access was not granted through the app.
- macOS/Linux behavior and signed installer distribution have not been exercised here. Standard electron-builder packaging failed on a sandbox cache rename permission; the portable assembly path succeeded using the already installed runtime.

To complete desktop acceptance on a normal desktop session, run `npm run test:ui`, then follow the manual checklist in README.md with your API keys. The UI test uses synthetic state and does not capture the desktop. Do not disable Electron's sandbox to work around startup failures.

For the installed portable build, open `release/portable-win-x64/Winbot.exe` outside this managed command environment. Edit its adjacent `.env` to add keys. Keep the whole folder together. No system-wide installer or Start Menu registration was performed.

## Dependency audit
Updated Electron from major 40 to 44 and Vitest from major 3 to 5 to remove the reported high/critical advisories. The final audit reports eight moderate advisories in the electron-builder packaging dependency chain, rooted in sprintf-js (`GHSA-hp3w-g68c-fv3c`). `npm audit fix` did not resolve that chain. No forced overrides were introduced. Revisit the packaging dependencies before distributing installers.

## Implementation limits
Primary-display capture, snippet-based web evidence, session-only recommendation counters, and standalone typed follow-ups. Settings use plaintext local JSON; keys stay in the local .env file. See README.md and ROADMAP.md for platform caveats and follow-on work.
