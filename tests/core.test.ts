import { describe, it, expect, vi } from "vitest";
import {
  defaults,
  settingsSchema,
  languageOf,
  recommendations,
} from "../src/core/model";
import { Pipeline } from "../src/core/pipeline";
function setup(text = "What is gravity?") {
  const image = new Uint8Array([1, 2]);
  const p = {
    capture: { capture: vi.fn(async () => image) },
    ocr: { extract: vi.fn(async () => text) },
    question: { selectQuestion: vi.fn(async (text: string) => text) },
    search: {
      search: vi.fn(async (_query: string) => [
        {
          title: "Science",
          url: "https://example.org",
          description: "Gravity",
        },
      ]),
    },
    llm: { answer: vi.fn(async (_question: string) => "Answer [1]") },
  };
  return { p, image, run: new Pipeline(p) };
}
describe("pipeline", () => {
  it("captures once, erases image, searches and answers", async () => {
    const { p, image, run } = setup();
    const result = await run.run(defaults, new AbortController().signal);
    expect(p.capture.capture).toHaveBeenCalledTimes(1);
    expect([...image]).toEqual([0, 0]);
    expect(result.web).toBe(true);
    expect(result.text).toContain("[1]");
  });
  it("does not capture when OCR disabled", async () => {
    const { p, run } = setup();
    await expect(
      run.run({ ...defaults, ocr: false }, new AbortController().signal),
    ).rejects.toThrow("ocrDisabled");
    expect(p.capture.capture).not.toHaveBeenCalled();
  });
  it("rejects empty text before network", async () => {
    const { p, run } = setup(" ");
    await expect(
      run.run(defaults, new AbortController().signal),
    ).rejects.toThrow("noText");
    expect(p.search.search).not.toHaveBeenCalled();
  });
  it("supports typed offline-search-disabled input", async () => {
    const { p, run } = setup();
    const r = await run.run(
      { ...defaults, search: false },
      new AbortController().signal,
      "नमस्ते",
    );
    expect(r.language).toBe("hi");
    expect(r.web).toBe(false);
    expect(p.capture.capture).not.toHaveBeenCalled();
    expect(p.search.search).not.toHaveBeenCalled();
  });
  it("stops after cancellation during OCR", async () => {
    const { p, run } = setup();
    const c = new AbortController();
    p.ocr.extract.mockImplementation(async () => {
      c.abort();
      return "Question";
    });
    await expect(run.run(defaults, c.signal)).rejects.toThrow();
    expect(p.search.search).not.toHaveBeenCalled();
  });
  it("zeroes images on OCR failure", async () => {
    const { p, image, run } = setup();
    p.ocr.extract.mockRejectedValue(new Error("failed"));
    await expect(
      run.run(defaults, new AbortController().signal),
    ).rejects.toThrow();
    expect([...image]).toEqual([0, 0]);
  });
});
describe("settings and recommendations", () => {
  it("rejects invalid imports and injected consent", () => {
    expect(settingsSchema.safeParse({ ...defaults, opacity: 0 }).success).toBe(
      false,
    );
    expect(
      settingsSchema.safeParse({ ...defaults, consent: true }).success,
    ).toBe(false);
  });
  it("detects Hindi and respects explicit English", () => {
    expect(languageOf(defaults, "भारत")).toBe("hi");
    expect(languageOf({ ...defaults, language: "en" }, "भारत")).toBe("en");
  });
  it("recommends details after repeated followups", () => {
    expect(recommendations(defaults, 3)).toContain("detail");
    expect(
      recommendations({ ...defaults, style: "detailed" }, 3),
    ).not.toContain("detail");
  });
});

it("selects the new MCQ before searching and never reuses the previous question", async () => {
  const { p, run } = setup();
  p.ocr.extract.mockResolvedValueOnce("Old screen question").mockResolvedValueOnce("Old answer: New Delhi. Which planet is known as the Red Planet? A. Venus B. Mars");
  p.question.selectQuestion.mockResolvedValueOnce("What is the capital of India?").mockResolvedValueOnce("Which planet is known as the Red Planet? A. Venus B. Mars");
  await run.run(defaults, new AbortController().signal);
  const next = await run.run(defaults, new AbortController().signal);
  expect(p.capture.capture).toHaveBeenCalledTimes(2);
  expect(p.question.selectQuestion).toHaveBeenCalledTimes(2);
  expect(p.search.search.mock.calls[1]?.[0]).toBe(next.question);
  expect(next.question).not.toContain("Delhi");
  expect(p.llm.answer.mock.calls[1]?.[0]).toBe(next.question);
});
it("skips selection for typed questions and stops ambiguous captures before search", async () => {
  const { p, run } = setup();
  await run.run(defaults, new AbortController().signal, "My exact question");
  expect(p.question.selectQuestion).not.toHaveBeenCalled();
  p.search.search.mockClear();
  p.question.selectQuestion.mockResolvedValue(" ");
  await expect(run.run(defaults, new AbortController().signal)).rejects.toThrow("noText");
  expect(p.search.search).not.toHaveBeenCalled();
});
it("cancellation during question selection prevents search", async () => {
  const { p, run } = setup();
  const controller = new AbortController();
  p.question.selectQuestion.mockImplementation(async () => { controller.abort(); return "New question"; });
  await expect(run.run(defaults, controller.signal)).rejects.toThrow();
  expect(p.search.search).not.toHaveBeenCalled();
});
