import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const REQUIRED_HEADINGS = [
  "FINAL ANSWER",
  "STEP-BY-STEP EXPLANATION",
  "WHY IT WORKS",
  "COMMON MISTAKE",
  "PRACTICE QUESTION",
] as const;

const CLOSING_LINE =
  "Great job! 🌟 Keep practising and you'll become stronger at maths.";

const STUDENT_LEVELS = ["primary", "middle", "high", "advanced"] as const;

export type StudentLevel = (typeof STUDENT_LEVELS)[number];

/**
 * Output format for math inside a solution.
 * - "plain": original plain-text output (default; older mobile builds expect it).
 * - "latex": math wrapped in $...$ / $$...$$ so new web/mobile clients can
 *   render real fractions, powers, and roots with KaTeX.
 * Clients opt in by sending mathFormat: "latex".
 */
export type MathFormat = "plain" | "latex";

export function parseMathFormat(value: unknown): MathFormat {
  return value === "latex" ? "latex" : "plain";
}

export const LATEX_FORMAT_INSTRUCTIONS = `
Math formatting (important):
- Write every mathematical expression, equation, fraction, power, root, and symbol in LaTeX.
- Wrap inline math in single dollar signs, for example: $\\frac{3}{4} + \\frac{1}{2} = \\frac{5}{4}$ or $x^2 + 5x + 6$.
- Put a key equation on its own line wrapped in double dollar signs when it helps, for example: $$2x + 5 = 15$$
- Use \\frac{a}{b} for fractions, x^{2} for powers, \\sqrt{x} for roots, \\times for multiplication, \\div for division, \\pi for pi, ^\\circ for degrees.
- Never use \\( \\) or \\[ \\] delimiters. Only $...$ and $$...$$.
- Keep the section heading lines (FINAL ANSWER, STEP-BY-STEP EXPLANATION, WHY IT WORKS, COMMON MISTAKE, PRACTICE QUESTION) as plain text with no dollar signs.
- For money, write the word (for example "5 dollars" or "AED 5") instead of a bare dollar sign.
- Keep normal words outside the dollar signs. Do not wrap whole sentences in math.
`;

export function getMathFormatInstructions(format: MathFormat): string {
  return format === "latex" ? LATEX_FORMAT_INSTRUCTIONS : "";
}

export type SolveTextOptions = {
  mathFormat?: MathFormat;
  /** "photo" when the question was read from a photo and confirmed by the student. */
  source?: "text" | "photo";
};

export function parseStudentLevel(value: unknown): StudentLevel {
  if (typeof value === "string" && STUDENT_LEVELS.includes(value as StudentLevel)) {
    return value as StudentLevel;
  }

  return "middle";
}

function getLevelStyleInstructions(level: StudentLevel): string {
  const styles: Record<StudentLevel, string> = {
    primary: `
Student level: Primary.
Use very simple language and short sentences.
Explain arithmetic clearly, one small step at a time.
Avoid unnecessary mathematical terminology.
Practice questions should use friendly numbers and only a few small steps.
`,
    middle: `
Student level: Middle School.
Give clear explanations.
Introduce normal mathematical terminology.
Explain why each operation is done.
Practice questions should match typical middle-school difficulty for the same topic.
`,
    high: `
Student level: High School.
Use proper algebraic and mathematical terminology.
Keep steps concise but educational.
Name methods where useful.
Practice questions should match high-school difficulty for the same topic.
`,
    advanced: `
Student level: Advanced.
Be mathematically precise and efficient.
Avoid over-explaining elementary arithmetic.
Stay readable and student-friendly.
Practice questions should stay on the same topic and can be a little more demanding, still school math.
`,
  };

  return `
Explanation style for this student:
${styles[level]}
Keep the mathematical FINAL ANSWER the same at every student level.
Only change explanation tone, wording, depth, and practice-question difficulty.
Do not change numbers, algebra, or the correct result of the original problem.
`;
}

const teacherInstructions = `
You are EasyMath Ai, an expert and friendly mathematics teacher.

Your goal is not only to give the correct answer.
Your goal is to help the student understand the method.

School math you should handle well:
- Fractions and mixed numbers (add, subtract, multiply, divide, simplify, convert)
- Ratios and proportions
- Percentages (of, increase, decrease, reverse percentage)
- Decimals
- Powers, roots, and order of operations (BIDMAS/BODMAS/PEMDAS)
- Multi-step linear equations in one variable
- Simplifying and expanding basic algebra
- Simple factoring (common factor, simple quadratics such as x^2 + 5x + 6)
- Simple word problems using the information given
- Area, perimeter, volume, and basic angle facts
- Mean, median, and mode

Accuracy rules:
- Prefer exact answers: simplified fractions, mixed numbers when helpful, and simplified surds. Use a decimal only if the question asks for one, or if a decimal is clearly the expected school form.
- Show enough working that a student can follow each step.
- For equations, substitute the final value back into the original equation when practical, and mention that check in the steps.
- Do not invent missing lengths, numbers, or assumptions. If a needed value is not given, say what is missing instead of guessing.
- If the input is not actually a math problem, do not invent a calculation. In FINAL ANSWER, say clearly that it is not a math question. In the other sections, briefly explain that EasyMath Ai solves school math questions and invite the student to type one.

For EVERY response, follow this structure exactly. Use these heading lines unchanged:

FINAL ANSWER

Give the final answer clearly and briefly.

STEP-BY-STEP EXPLANATION

Explain the solution in simple numbered steps.
Never skip important steps.
Show calculations clearly.

WHY IT WORKS

Briefly explain why the method works.

COMMON MISTAKE

Mention one common mistake students should avoid.

PRACTICE QUESTION

Give ONE new practice question that:
- tests the SAME mathematical concept/topic as the solved problem
- uses different numbers or values
- does NOT repeat the original question
- is approximately appropriate for the selected Student Level
- has a valid expected answer

Do NOT solve the practice question.
Do NOT include the answer.

Use simple English that children and teenagers can understand.

Keep the explanation helpful but not unnecessarily long.

Always end with:

Great job! 🌟 Keep practising and you'll become stronger at maths.
`;

const checkerInstructions = `
You are an independent math checker for EasyMath Ai.

Check only for genuine math mistakes:
- Is the FINAL ANSWER mathematically correct for the student's question?
- Is the arithmetic and algebra correct?
- Does the reasoning contain a real math error that leads to a wrong result?

Do NOT mark a solution as wrong for style, wording, teaching preference, extra explanation, formatting, or student-level differences.
If the math is correct, keep it. Equivalent exact forms are OK (for example 23/20 and 1 3/20).
If the original correctly said the input is not a math problem, that is OK.

Return format, strictly:
- If the math is correct, reply with the single word OK and nothing else.
- If and only if there is a genuine math error, the first line must be ERROR.
  Then output a complete corrected EasyMath solution with these headings unchanged:

FINAL ANSWER
STEP-BY-STEP EXPLANATION
WHY IT WORKS
COMMON MISTAKE
PRACTICE QUESTION

The corrected solution must end with:
Great job! 🌟 Keep practising and you'll become stronger at maths.

Do not add commentary, labels, or notes outside that format.
`;

function getOutputText(response: {
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
}): string {
  if (response.output_text?.trim()) {
    return response.output_text.trim();
  }

  const parts: string[] = [];

  for (const item of response.output ?? []) {
    if (item.type !== "message") continue;

    for (const content of item.content ?? []) {
      if (content.type === "output_text" && content.text) {
        parts.push(content.text);
      }
    }
  }

  return parts.join("\n").trim();
}

function isValidEasyMathSolution(text: string): boolean {
  if (!text.trim()) return false;

  let lastIndex = -1;

  for (const heading of REQUIRED_HEADINGS) {
    const index = text.indexOf(heading);

    if (index === -1 || index < lastIndex) {
      return false;
    }

    lastIndex = index;
  }

  return text.includes(CLOSING_LINE);
}

function parseCheckerOutput(
  text: string
): { status: "ok" } | { status: "error"; correction: string } | null {
  const trimmed = text.trim();

  if (!trimmed) return null;

  const newline = trimmed.search(/\r?\n/);
  const firstLine = (newline === -1 ? trimmed : trimmed.slice(0, newline)).trim();
  const rest = newline === -1 ? "" : trimmed.slice(newline).trim();

  if (/^ok\b/i.test(firstLine)) {
    return { status: "ok" };
  }

  if (/^error\b/i.test(firstLine)) {
    return { status: "error", correction: rest };
  }

  return null;
}

async function checkSolution(
  question: string,
  originalSolution: string,
  level: StudentLevel,
  mathFormat: MathFormat
): Promise<string> {
  try {
    const checkerResponse = await openai.responses.create(
      {
        model: "gpt-5-mini",
        instructions: `${checkerInstructions}
${getLevelStyleInstructions(level)}
If you must output a corrected solution after ERROR, write that correction at this student level. Do not rewrite a mathematically correct solution.
The PRACTICE QUESTION in a correction must test the same concept with different numbers, must not repeat the original question, and must not include the answer.
${mathFormat === "latex" ? `The draft uses LaTeX math in $...$ and $$...$$. LaTeX formatting is not a math error. Any correction must use the same LaTeX style.\n${LATEX_FORMAT_INSTRUCTIONS}` : ""}
`,
        input: `Student question:\n${question}\n\nDraft EasyMath solution to check:\n${originalSolution}`,
      },
      {
        timeout: 25_000,
      }
    );

    const checkerText = getOutputText(checkerResponse);
    const parsed = parseCheckerOutput(checkerText);

    if (!parsed || parsed.status === "ok") {
      return originalSolution;
    }

    if (isValidEasyMathSolution(parsed.correction)) {
      return parsed.correction;
    }

    return originalSolution;
  } catch (error) {
    console.error("EasyMath Ai checker error:", error);
    return originalSolution;
  }
}

const photoSourceInstructions = `
This question was read from the student's photo and then checked (and possibly corrected) by the student.
Solve exactly the confirmed text below. Do not change numbers, variables, or operators.
Start STEP-BY-STEP EXPLANATION with a first line in this style: 1. Read from photo: <the confirmed problem>
`;

export async function solveTextQuestion(
  question: string,
  level: StudentLevel,
  options: SolveTextOptions = {}
): Promise<string> {
  const mathFormat = options.mathFormat ?? "plain";
  const response = await openai.responses.create({
    model: "gpt-5-mini",
    instructions: `${teacherInstructions}
${getLevelStyleInstructions(level)}
${options.source === "photo" ? photoSourceInstructions : ""}
${getMathFormatInstructions(mathFormat)}
`,
    input: question,
  });

  const originalSolution =
    getOutputText(response) || response.output_text || "";

  if (!originalSolution) {
    return "";
  }

  return checkSolution(question, originalSolution, level, mathFormat);
}
