import {
  Answer,
  CaptureProvider,
  OCRProvider,
  QuestionProvider,
  SearchProvider,
  LLMProvider,
  Settings,
  WinbotError,
  languageOf,
} from "./model";
export class Pipeline {
  constructor(
    private providers: {
      capture: CaptureProvider;
      ocr: OCRProvider;
      question: QuestionProvider;
      search: SearchProvider;
      llm: LLMProvider;
    },
  ) {}
  async run(
    settings: Settings,
    signal: AbortSignal,
    question?: string,
  ): Promise<Answer> {
    signal.throwIfAborted();
    let text = question?.trim();
    if (!text) {
      if (!settings.ocr) throw new WinbotError("ocrDisabled");
      let image: Uint8Array | undefined;
      try {
        image = await this.providers.capture.capture(signal);
        signal.throwIfAborted();
        text = await this.providers.ocr.extract(image, signal);
      } finally {
        image?.fill(0);
        image = undefined;
      }
      signal.throwIfAborted();
      if (!text?.trim()) throw new WinbotError("noText");
      text = await this.providers.question.selectQuestion(text.slice(0, 16000), signal);
    }
    signal.throwIfAborted();
    text = text?.trim().slice(0, 16000);
    if (!text) throw new WinbotError("noText");
    const language = languageOf(settings, text);
    const sources = settings.search
      ? await this.providers.search.search(text, language, signal)
      : [];
    signal.throwIfAborted();
    const answer = await this.providers.llm.answer(
      text,
      sources,
      settings,
      language,
      signal,
      !question?.trim(),
    );
    signal.throwIfAborted();
    return {
      id: crypto.randomUUID(),
      question: text,
      text: answer,
      sources,
      at: new Date().toISOString(),
      language,
      web: settings.search && sources.length > 0,
    };
  }
}
