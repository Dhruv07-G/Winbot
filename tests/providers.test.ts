import { afterEach, expect, it, vi } from "vitest";
import { BraveSearch, OpenAI, TavilySearch, createSearchProvider } from "../src/providers";
import { defaults } from "../src/core/model";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("selects Tavily explicitly and keeps Brave as the backward-compatible default", () => {
  vi.stubEnv("SEARCH_PROVIDER", "tavily");
  expect(createSearchProvider()).toBeInstanceOf(TavilySearch);
  vi.stubEnv("SEARCH_PROVIDER", "");
  expect(createSearchProvider()).toBeInstanceOf(BraveSearch);
});
it("Tavily uses basic search, preserves Hindi and filters unsafe source links", async () => {
  vi.stubEnv("TAVILY_API_KEY", "test-key");
  const fetcher = vi.fn(async (_url: string, options: RequestInit) => {
    expect(JSON.parse(String(options.body))).toMatchObject({query:"भारत की राजधानी?",language:"hi",search_depth:"basic",auto_parameters:false,include_answer:false});
    expect(options.headers).toMatchObject({Authorization:"Bearer test-key"});
    return new Response(JSON.stringify({results:[{title:"Reference",url:"https://example.org",content:"New Delhi"},{url:"file:///private"}]}));
  });
  vi.stubGlobal("fetch", fetcher);
  expect(await new TavilySearch().search("भारत की राजधानी?","hi",new AbortController().signal)).toEqual([{title:"Reference",url:"https://example.org",description:"New Delhi"}]);
});
it("Tavily rejects missing keys without sending a request", async () => {
  vi.stubEnv("TAVILY_API_KEY", "");
  const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);
  await expect(new TavilySearch().search("question","en",new AbortController().signal)).rejects.toThrow("apiKey");
  expect(fetcher).not.toHaveBeenCalled();
});
it("search keeps only actual HTTP source links", async () => {
  vi.stubEnv("BRAVE_API_KEY", "test-key");
  const fetcher = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          web: {
            results: [
              {
                title: "Good",
                url: "https://example.org",
                description: "Evidence",
              },
              { title: "Bad", url: "javascript:alert(1)" },
            ],
          },
        }),
        { status: 200 },
      ),
  );
  vi.stubGlobal("fetch", fetcher);
  const sources = await new BraveSearch().search(
    "प्रश्न",
    "hi",
    new AbortController().signal,
  );
  expect(sources).toHaveLength(1);
  expect(fetcher.mock.calls[0]?.length).toBeGreaterThan(0);
});
it("missing keys fail before any network request", async () => {
  vi.stubEnv("OPENAI_API_KEY", "");
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  await expect(
    new OpenAI().answer("q", [], defaults, "en", new AbortController().signal),
  ).rejects.toThrow("apiKey");
  expect(fetcher).not.toHaveBeenCalled();
});
it("provider authentication errors have friendly error codes", async () => {
  vi.stubEnv("OPENAI_API_KEY", "test");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("", { status: 401 })),
  );
  await expect(
    new OpenAI().answer("q", [], defaults, "en", new AbortController().signal),
  ).rejects.toThrow("apiKey");
});
it("network failures have a localized-message code", async () => {
  vi.stubEnv("BRAVE_API_KEY", "test");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new TypeError("network");
    }),
  );
  await expect(
    new BraveSearch().search("q", "en", new AbortController().signal),
  ).rejects.toThrow("offline");
});
it("sends Hindi instructions and returns plain answer text", async () => {
  vi.stubEnv("OPENAI_API_KEY", "test");
  let body: any;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, options) => {
      body = JSON.parse(options.body);
      return new Response(
        JSON.stringify({ choices: [{ message: { content: "उत्तर" } }] }),
      );
    }),
  );
  expect(
    await new OpenAI().answer(
      "प्रश्न",
      [],
      defaults,
      "hi",
      new AbortController().signal,
    ),
  ).toBe("उत्तर");
  expect(body.messages[0].content).toContain("Hindi");
});
