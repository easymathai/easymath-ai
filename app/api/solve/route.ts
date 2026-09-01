import OpenAI from "openai";
import { NextResponse } from "next/server";
import {
  enforceLoggedInSolverLimit,
  releaseSolverReservation,
  type SolverGateSuccess,
} from "@/lib/solver-gate";

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

type StudentLevel = (typeof STUDENT_LEVELS)[number];

function parseStudentLevel(value: unknown): StudentLevel {
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
You are EasyMath AI, an expert and friendly mathematics teacher.

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
- If the input is not actually a math problem, do not invent a calculation. In FINAL ANSWER, say clearly that it is not a math question. In the other sections, briefly explain that EasyMath AI solves school math questions and invite the student to type one.

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
You are an independent math checker for EasyMath AI.

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
  level: StudentLevel
): Promise<string> {
  try {
    const checkerResponse = await openai.responses.create(
      {
        model: "gpt-5-mini",
        instructions: `${checkerInstructions}
${getLevelStyleInstructions(level)}
If you must output a corrected solution after ERROR, write that correction at this student level. Do not rewrite a mathematically correct solution.
The PRACTICE QUESTION in a correction must test the same concept with different numbers, must not repeat the original question, and must not include the answer.
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
    console.error("EasyMath AI checker error:", error);
    return originalSolution;
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const question = body.question;
    const level = parseStudentLevel(body.level);
    // Practice "Show Solution" must not consume Free plan solver credits.
    const countsTowardDailyLimit = body.usageMode !== "practice";

    if (!question || typeof question !== "string") {
      return NextResponse.json(
        { error: "Please enter a math question." },
        { status: 400 }
      );
    }

    let gate: SolverGateSuccess | null = null;

    if (countsTowardDailyLimit) {
      const enforced = await enforceLoggedInSolverLimit(request);

      if (!enforced.ok) {
        return enforced.response;
      }

      gate = enforced;
    }

    try {
      const response = await openai.responses.create({
        model: "gpt-5-mini",
        instructions: `${teacherInstructions}
${getLevelStyleInstructions(level)}
`,
        input: question,
      });

      const originalSolution =
        getOutputText(response) || response.output_text || "";

      const solution = originalSolution
        ? await checkSolution(question, originalSolution, level)
        : originalSolution;

      if (!solution || !String(solution).trim()) {
        if (gate) {
          await releaseSolverReservation(gate);
        }

        return NextResponse.json(
          { error: "Unable to solve the question right now." },
          { status: 500 }
        );
      }

      return NextResponse.json({
        solution,
        usage: gate?.usage ?? null,
      });
    } catch (error) {
      if (gate) {
        await releaseSolverReservation(gate);
      }

      console.error("EasyMath AI API error:", error);

      return NextResponse.json(
        { error: "Unable to solve the question right now." },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("EasyMath AI API error:", error);

    return NextResponse.json(
      { error: "Unable to solve the question right now." },
      { status: 500 }
    );
  }
}
