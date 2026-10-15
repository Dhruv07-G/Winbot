# Validation · 16 October 2026

## Passed
- Production TypeScript check, Vite renderer build, and Electron main/preload bundling with Electron 44.7.2 types.
- 21 tests across consent, pipeline, settings, recommendations, provider adapters, and the real desktop IPC command handler with simulated OS capabilities, running on Vitest 5.0.4.
- Tests cover capture gating, permission revocation, no capture when OCR is disabled, cancellation before network stages, image-buffer clearing on success/failure, empty OCR, Hindi detection, typed questions, invalid settings, safe source protocols, missing credentials, authentication failures, and network failures.
- npm dependency installation completed; package-lock.json pins the resolved dependencies.
- Portable Windows bundle assembled at `release/portable-win-x64/Winbot.exe` with 18 production dependency directories. Required main/preload/renderer and OCR files were checked.
- Real Tesseract OCR recognized both English and Hindi text in a synthetic bilingual PNG. Repeated successfully using the portable bundle's own dependencies and local gzip model files, with model caching disabled for that test.
- Local development and portable `.env` templates are configured for installed OCR models. Neither contains API credentials.

## Not verified
- Electron's native process exits before the UI smoke test reports any assertions in this managed Windows environment. The earlier runtime returned Windows exit code `0x80000003`; the updated runtime also exits without test output. The cause is not confirmed. No desktop UI pass or preview image is claimed.
- The actual packaged `Winbot.exe` also exits with `0x80000003` when launched in this environment. Native desktop startup, actual screen capture, and the live search/LLM round-trip remain unverified. API credentials were not supplied, and screen access was not granted through the app.
- macOS/Linux behavior and signed installer distribution have not been exercised here. Standard electron-builder packaging failed on a sandbox cache rename permission; the portable assembly path succeeded using the already installed runtime.

To complete desktop acceptance on a normal desktop session, run `npm run test:ui`, then follow the manual checklist in README.md with your API keys. The UI test uses synthetic state and does not capture the desktop. Do not disable Electron's sandbox to work around startup failures.

For the installed portable build, open `release/portable-win-x64/Winbot.exe` outside this managed command environment. Edit its adjacent `.env` to add keys. Keep the whole folder together. No system-wide installer or Start Menu registration was performed.

## Dependency audit
Updated Electron from major 40 to 44 and Vitest from major 3 to 5 to remove the reported high/critical advisories. The final audit reports eight moderate advisories in the electron-builder packaging dependency chain, rooted in sprintf-js (`GHSA-hp3w-g68c-fv3c`). `npm audit fix` did not resolve that chain. No forced overrides were introduced. Revisit the packaging dependencies before distributing installers.

## Implementation limits
Primary-display capture, snippet-based web evidence, session-only recommendation counters, and standalone typed follow-ups. Settings use plaintext local JSON; keys stay in the local .env file. See README.md and ROADMAP.md for platform caveats and follow-on work.
