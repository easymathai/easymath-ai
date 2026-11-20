/**
 * Shared math-text helpers for EasyMath Ai (web + mobile keep identical copies).
 *
 * Solutions requested with mathFormat "latex" wrap math in $...$ (inline) or
 * $$...$$ (display). Older solutions are plain text. These helpers:
 * - split text into plain/inline/display segments for KaTeX rendering
 * - convert LaTeX to readable plain text (copy, previews, offline fallback)
 */

export type MathSegment =
  | { type: "text"; value: string }
  | { type: "inline"; value: string }
  | { type: "display"; value: string };

function pushText(segments: MathSegment[], value: string) {
  if (!value) return;
  const last = segments[segments.length - 1];
  if (last && last.type === "text") {
    last.value += value;
  } else {
    segments.push({ type: "text", value });
  }
}

function findClosingInlineDollar(text: string, from: number): number {
  for (let j = from; j < text.length; j += 1) {
    const ch = text[j];
    if (ch === "\n") return -1;
    if (ch === "\\") {
      j += 1;
      continue;
    }
    if (ch === "$") {
      const content = text.slice(from, j);
      if (!content.trim()) return -1;
      if (/^\s/.test(content) || /\s$/.test(content)) return -1;
      // "$5 and $10": a closing $ followed by a digit is probably money.
      if (/\d/.test(text[j + 1] ?? "")) return -1;
      return j;
    }
  }
  return -1;
}

/** Split text into plain text and LaTeX math segments. */
export function splitMath(text: string): MathSegment[] {
  const segments: MathSegment[] = [];
  let i = 0;
  let buffer = "";

  while (i < text.length) {
    const rest = text.slice(i);

    if (rest.startsWith("\\$")) {
      buffer += "$";
      i += 2;
      continue;
    }

    if (rest.startsWith("$$")) {
      const end = text.indexOf("$$", i + 2);
      if (end !== -1 && text.slice(i + 2, end).trim()) {
        pushText(segments, buffer);
        buffer = "";
        segments.push({ type: "display", value: text.slice(i + 2, end).trim() });
        i = end + 2;
        continue;
      }
    }

    if (rest.startsWith("\\[")) {
      const end = text.indexOf("\\]", i + 2);
      if (end !== -1) {
        pushText(segments, buffer);
        buffer = "";
        segments.push({ type: "display", value: text.slice(i + 2, end).trim() });
        i = end + 2;
        continue;
      }
    }

    if (rest.startsWith("\\(")) {
      const end = text.indexOf("\\)", i + 2);
      if (end !== -1) {
        pushText(segments, buffer);
        buffer = "";
        segments.push({ type: "inline", value: text.slice(i + 2, end).trim() });
        i = end + 2;
        continue;
      }
    }

    if (text[i] === "$") {
      const end = findClosingInlineDollar(text, i + 1);
      if (end !== -1) {
        pushText(segments, buffer);
        buffer = "";
        segments.push({ type: "inline", value: text.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    buffer += text[i];
    i += 1;
  }

  pushText(segments, buffer);
  return segments;
}

/** True when the text contains at least one LaTeX math segment. */
export function hasMath(text: string): boolean {
  if (!text || (!text.includes("$") && !text.includes("\\(") && !text.includes("\\["))) {
    return false;
  }
  return splitMath(text).some((segment) => segment.type !== "text");
}

const SUPERSCRIPTS: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶",
  "7": "⁷", "8": "⁸", "9": "⁹", "+": "⁺", "-": "⁻", "=": "⁼", "(": "⁽",
  ")": "⁾", n: "ⁿ", i: "ⁱ", x: "ˣ", y: "ʸ",
};

const SUBSCRIPTS: Record<string, string> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆",
  "7": "₇", "8": "₈", "9": "₉", "+": "₊", "-": "₋", "=": "₌", "(": "₍", ")": "₎",
};

const SYMBOLS: Array<[RegExp, string]> = [
  [/\\times/g, "×"],
  [/\\div/g, "÷"],
  [/\\cdot/g, "·"],
  [/\\pm/g, "±"],
  [/\\mp/g, "∓"],
  [/\\leq?/g, "≤"],
  [/\\geq?/g, "≥"],
  [/\\neq?/g, "≠"],
  [/\\approx/g, "≈"],
  [/\\infty/g, "∞"],
  [/\\pi/g, "π"],
  [/\\theta/g, "θ"],
  [/\\alpha/g, "α"],
  [/\\beta/g, "β"],
  [/\\Delta/g, "Δ"],
  [/\\angle/g, "∠"],
  [/\\triangle/g, "△"],
  [/\\circ/g, "°"],
  [/\\degree/g, "°"],
  [/\\%/g, "%"],
  [/\\rightarrow|\\to/g, "→"],
  [/\\Rightarrow|\\implies/g, "⇒"],
  [/\\quad|\\qquad/g, "  "],
  [/\\[,;:! ]/g, " "],
];

function convertScript(value: string, map: Record<string, string>, marker: string): string {
  const chars = [...value];
  if (chars.every((ch) => map[ch])) {
    return chars.map((ch) => map[ch]).join("");
  }
  return `${marker}(${value})`;
}

/** Read the balanced {...} group starting at index (which must be "{"). */
function readGroup(text: string, index: number): { value: string; end: number } | null {
  if (text[index] !== "{") return null;
  let depth = 0;
  for (let j = index; j < text.length; j += 1) {
    if (text[j] === "{") depth += 1;
    else if (text[j] === "}") {
      depth -= 1;
      if (depth === 0) {
        return { value: text.slice(index + 1, j), end: j + 1 };
      }
    }
  }
  return null;
}

function needsParens(value: string): boolean {
  return !/^[A-Za-z0-9.]+$/.test(value) && !/^\(.*\)$/.test(value);
}

/** Convert one LaTeX expression into readable plain text. */
export function latexToPlain(latex: string): string {
  let text = latex;

  // \frac{a}{b}, \dfrac, \tfrac
  for (let guard = 0; guard < 50; guard += 1) {
    const match = /\\[dt]?frac\s*/.exec(text);
    if (!match) break;
    const numStart = match.index + match[0].length;
    const num = readGroup(text, numStart);
    const den = num ? readGroup(text, num.end) : null;
    if (!num || !den) break;
    const n = latexToPlain(num.value);
    const d = latexToPlain(den.value);
    const frac = `${needsParens(n) ? `(${n})` : n}/${needsParens(d) ? `(${d})` : d}`;
    // Mixed numbers: 1\frac{1}{4} -> "1 1/4", not "11/4".
    const out = /[0-9]$/.test(text.slice(0, match.index)) ? ` ${frac}` : frac;
    text = text.slice(0, match.index) + out + text.slice(den.end);
  }

  // \sqrt[n]{x} and \sqrt{x}
  for (let guard = 0; guard < 50; guard += 1) {
    const match = /\\sqrt\s*(\[[^\]]*\])?/.exec(text);
    if (!match) break;
    const group = readGroup(text, match.index + match[0].length);
    if (!group) break;
    const inner = latexToPlain(group.value);
    const index = match[1] ? match[1].slice(1, -1) : "";
    const root = index === "3" ? "∛" : index === "4" ? "∜" : index ? `${convertScript(index, SUPERSCRIPTS, "^")}√` : "√";
    const out = `${root}${needsParens(inner) ? `(${inner})` : inner}`;
    text = text.slice(0, match.index) + out + text.slice(group.end);
  }

  text = text.replace(/\^\s*\{?\s*\\circ\s*\}?/g, "°");
  text = text.replace(/\\(?:text|mathrm|textbf|mathbf|operatorname)\s*\{([^{}]*)\}/g, "$1");
  text = text.replace(/\\(?:left|right|big|Big|bigg|Bigg)\s*/g, "");
  for (const [pattern, replacement] of SYMBOLS) {
    text = text.replace(pattern, replacement);
  }

  text = text.replace(/\^\{([^{}]*)\}/g, (_m, value: string) => convertScript(value, SUPERSCRIPTS, "^"));
  text = text.replace(/\^([A-Za-z0-9+\-])/g, (_m, value: string) => convertScript(value, SUPERSCRIPTS, "^"));
  text = text.replace(/_\{([^{}]*)\}/g, (_m, value: string) => convertScript(value, SUBSCRIPTS, "_"));
  text = text.replace(/_([0-9])/g, (_m, value: string) => convertScript(value, SUBSCRIPTS, "_"));

  text = text.replace(/\\[A-Za-z]+/g, "");
  text = text.replace(/[{}]/g, "");
  return text.replace(/[ \t]{2,}/g, " ").trim();
}

/** Convert a whole solution (text + $math$) into readable plain text. */
export function mathToPlainText(text: string): string {
  if (!hasMath(text)) return text;
  return splitMath(text)
    .map((segment) => {
      if (segment.type === "text") return segment.value;
      const plain = latexToPlain(segment.value);
      return segment.type === "display" ? `\n${plain}\n` : plain;
    })
    .join("")
    .replace(/\n{3,}/g, "\n\n");
}
