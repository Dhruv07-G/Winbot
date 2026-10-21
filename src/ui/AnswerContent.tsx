import React from "react";
import Markdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

/** Render model output as text, Markdown and local math; never run its HTML. */
export function AnswerContent({ text }: { text: string }) {
  return (
    <div className="answer">
      <Markdown
        skipHtml
        remarkPlugins={[remarkMath]}
        rehypePlugins={[[rehypeKatex, { trust: false, maxExpand: 500, maxSize: 20 }]]}
        components={{
          // Sources already have dedicated, validated buttons below the answer.
          a: ({ children }) => <span>{children}</span>,
          img: () => null,
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}
