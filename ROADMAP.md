# Roadmap

## Before public distribution
- Test real capture and permissions on Windows, macOS, X11, and Wayland; signed installers and CI matrix.
- Region/display picker and extracted-question review before cloud submission.
- Automated desktop integration tests for consent, capture cancellation, tray behavior, and imports.
- Downloadable offline OCR packs with progress, checksums, and cancellation during initialization.
- Keychain/credential-vault integration and optional encrypted local history.
- Better question extraction on multi-column screens, conversational follow-up context, and grounded citation checks.
- Persist floating geometry and handle display topology changes; native dock reservation where supported.

## Next capabilities
- Mobile: reuse core contracts and rules in React Native; platform screen-sharing consent and foreground restrictions need separate native adapters.
- Voice input: explicit push-to-talk, visible microphone state, English/Hindi transcription.
- Offline model: local OpenAI-compatible server adapter and optional local search index.
- Plugin system: versioned provider contracts, declared permissions, signed packages, isolated execution.
- Opt-in AI recommendations built on the rule-based interface; no usage telemetry by default.


## Trace follow-up
- Manual Windows acceptance: multi-region rectangles/freehand, Redraw, Esc, batch cancellation, saved custom hotkey, actual OCR and provider latency.
- Verify macOS/X11 capture on hardware; replace deprecated macOS capture with ScreenCaptureKit and add a region-capable Wayland adapter.
- Improve validation for legitimate two/three-choice MCQs, clipboard/text extraction, and selection across multiple monitors.
- Measure cold/warm capture-to-first-answer timings; optimize based on stage logs.
