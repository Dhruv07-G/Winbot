import { z } from "zod";
export const settingsSchema = z
  .object({
    language: z.enum(["auto", "en", "hi"]).default("auto"),
    theme: z.enum(["dark", "light"]).default("dark"),
    accent: z
      .string()
      .regex(/^#[0-9a-f]{6}$/i)
      .default("#70e0c4"),
    font: z.enum(["system-ui", "Arial", "Nirmala UI"]).default("system-ui"),
    fontSize: z.number().int().min(12).max(24).default(15),
    opacity: z.number().min(0.5).max(1).default(1),
    position: z.enum(["left", "right", "floating"]).default("right"),
    style: z.enum(["short", "detailed", "steps", "bullets"]).default("short"),
    ocr: z.boolean().default(true),
    search: z.boolean().default(true),
    sources: z.boolean().default(true),
    history: z.boolean().default(true),
    traceHotkey: z.string().min(3).max(80).default("CommandOrControl+Shift+T"),
    traceColor: z.string().regex(/^#[0-9a-f]{6}$/i).default("#2388ff"),
    traceThickness: z.number().int().min(2).max(12).default(3),
    traceMCQStyle: z.enum(["answer", "reason", "full"]).default("answer"),
    traceTextStyle: z.enum(["short", "detailed"]).default("short"),
    traceSpeed: z.enum(["fastest", "balanced", "accurate"]).default("fastest"),
    traceSearch: z.boolean().default(false),
    hotkey: z.string().min(3).max(80).default("CommandOrControl+Shift+Space"),
  })
  .strict();
export type Settings = z.infer<typeof settingsSchema>;
export const defaults = settingsSchema.parse({});
export type Source = { title: string; url: string; description: string };
export type Answer = {
  id: string;
  question: string;
  text: string;
  sources: Source[];
  at: string;
  language: "en" | "hi";
  web: boolean;
};
export interface CaptureProvider {
  capture(signal: AbortSignal): Promise<Uint8Array>;
}
export interface OCRProvider {
  extract(image: Uint8Array, signal: AbortSignal): Promise<string>;
}
export interface QuestionProvider {
  selectQuestion(screenText: string, signal: AbortSignal): Promise<string>;
}
export interface SearchProvider {
  search(
    query: string,
    language: string,
    signal: AbortSignal,
  ): Promise<Source[]>;
}
export interface LLMProvider {
  answer(
    question: string,
    sources: Source[],
    settings: Settings,
    language: string,
    signal: AbortSignal,
    screenCapture?: boolean,
  ): Promise<string>;
}
export class WinbotError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
export const languageOf = (
  s: Settings,
  text = "",
  locale = "en",
): "en" | "hi" =>
  s.language === "auto"
    ? /[\u0900-\u097f]/.test(text) || (!text && locale.startsWith("hi"))
      ? "hi"
      : "en"
    : s.language;
export function recommendations(s: Settings, followups: number): string[] {
  return [
    ...(followups >= 3 && s.style === "short" ? ["detail"] : []),
    ...(!s.search ? ["search"] : []),
    ...(s.fontSize < 14 ? ["font"] : []),
  ];
}
