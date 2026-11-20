"use client";

import { useMemo, type CSSProperties } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { hasMath, splitMath } from "@/lib/math-format";

/**
 * Renders solver/practice text with real math (fractions, powers, roots)
 * using KaTeX. Plain-text solutions (older history, older API responses)
 * render exactly as before.
 */
export default function MathText({
  text,
  style,
  className,
  block = true,
}: {
  text: string;
  style?: CSSProperties;
  className?: string;
  /** Render as a <div> (default) or an inline <span>. */
  block?: boolean;
}) {
  const parts = useMemo(() => {
    if (!hasMath(text)) {
      return null;
    }

    return splitMath(text).map((segment) => {
      if (segment.type === "text") {
        return { kind: "text" as const, value: segment.value };
      }

      const html = katex.renderToString(segment.value, {
        displayMode: segment.type === "display",
        throwOnError: false,
        strict: "ignore",
        output: "htmlAndMathml",
        trust: false,
      });

      return { kind: segment.type, html };
    });
  }, [text]);

  const Tag = block ? "div" : "span";

  if (!parts) {
    return (
      <Tag className={className} style={style}>
        {text}
      </Tag>
    );
  }

  return (
    <Tag className={className ? `${className} easymath-math` : "easymath-math"} style={style}>
      {parts.map((part, index) =>
        part.kind === "text" ? (
          <span key={index}>{part.value}</span>
        ) : part.kind === "display" ? (
          <span
            key={index}
            className="easymath-math-display"
            dangerouslySetInnerHTML={{ __html: part.html }}
          />
        ) : (
          <span
            key={index}
            className="easymath-math-inline"
            dangerouslySetInnerHTML={{ __html: part.html }}
          />
        )
      )}
    </Tag>
  );
}
