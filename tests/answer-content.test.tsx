import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { AnswerContent } from "../src/ui/AnswerContent";

it("renders the reported fraction and Markdown instead of literal formatting codes", () => {
  const html = renderToStaticMarkup(<AnswerContent text={String.raw`1. **Rates per minute:**

   Faster pipe: $\frac{1}{12}$ of the tank.

2. **Total time:** 3 + 24 = **27 minutes**.`} />);
  expect(html).toContain("<ol>");
  expect(html).toContain("<strong>Rates per minute:</strong>");
  expect(html).toContain('class="katex"');
  expect(html).toContain("<mfrac>");
  expect(html).toContain("<strong>27 minutes</strong>");
  expect(html).not.toContain("**Rates");
});
it("supports Hindi and block equations", () => {
  const html = renderToStaticMarkup(<AnswerContent text={String.raw`**उत्तर: 27 मिनट**

$$
\frac{60}{136}=\frac{15}{34}
$$`} />);
  expect(html).toContain("उत्तर: 27 मिनट");
  expect(html).toContain('class="katex-display"');
});
it("does not create model-supplied HTML, links or external images", () => {
  const html = renderToStaticMarkup(<AnswerContent text={'<script>alert(1)</script>\n\n<img src="https://example.com/pixel">\n\n![track](https://example.com/pixel)\n\n[bad](javascript:alert) [site](https://example.com)\n\n$\\href{https://example.com}{click}$'} />);
  expect(html).not.toMatch(/<script|<img|<a\s|href=/);
});
it("does not crash on invalid math", () => {
  expect(() => renderToStaticMarkup(<AnswerContent text={String.raw`$\notARealCommand{1}$`} />)).not.toThrow();
});
