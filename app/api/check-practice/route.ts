import OpenAI from "openai";
import { NextResponse } from "next/server";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
    primary:
      "Primary: very simple language, short sentences, explain arithmetic clearly, avoid unnecessary mathematical terminology.",
    middle:
      "Middle School: clear explanations, introduce normal mathematical terminology, explain why each operation is done.",
    high: "High School: proper algebraic/mathematical terminology, concise but educational.",
    advanced:
      "Advanced: mathematically precise and efficient. Avoid over-explaining elementary arithmetic.",
  };

  return styles[level];
}

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

function parseCheckResult(text: string): {
  correct: boolean;
  feedback: string;
  hint: string;
} | null {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");

  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  try {
    const parsed = JSON.parse(stripped.slice(start, end + 1)) as {
      correct?: unknown;
      feedback?: unknown;
      hint?: unknown;
    };

    if (typeof parsed.correct !== "boolean") {
      return null;
    }

    const feedback = String(parsed.feedback ?? "").trim();
    const hint = String(parsed.hint ?? "").trim();

    return {
      correct: parsed.correct,
      feedback:
        feedback ||
        (parsed.correct ? "Yes — that's right." : "Not quite."),
      hint: parsed.correct ? "" : hint,
    };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const practiceQuestion = body.practiceQuestion;
    const studentAnswer = body.studentAnswer;
    const level = parseStudentLevel(body.level);

    if (!practiceQuestion || typeof practiceQuestion !== "string") {
      return NextResponse.json(
        { error: "Please include the practice question." },
        { status: 400 }
      );
    }

    if (!studentAnswer || typeof studentAnswer !== "string") {
      return NextResponse.json(
        { error: "Please enter an answer to check." },
        { status: 400 }
      );
    }

    if (!practiceQuestion.trim() || !studentAnswer.trim()) {
      return NextResponse.json(
        { error: "Please enter an answer to check." },
        { status: 400 }
      );
    }

    const response = await openai.responses.create(
      {
        model: "gpt-5-mini",
        instructions: `
You check a student's short answer to one EasyMath practice question.

Decide only whether the student's answer is mathematically equivalent to the correct answer.
Accept equivalent forms, such as:
- 4
- x = 4
- x=4
- equivalent fractions
- equivalent decimal and fraction forms when they are mathematically equal

Wording style: ${getLevelStyleInstructions(level)}
Student level affects wording only, not whether the answer is correct.

Return STRICT JSON only, with no markdown and no extra keys:
{
  "correct": true or false,
  "feedback": "short message",
  "hint": "short hint or empty string"
}

If the student is correct:
- "correct" must be true
- "feedback" must be a short positive message
- "hint" must be an empty string
- do not add extra explanation

If the student is incorrect:
- "correct" must be false
- "feedback" must be a short "not quite" message
- "hint" must be ONE useful nudge, such as the first step or the method
- do NOT reveal the final answer
- do NOT give a full solution
`,
        input: `Practice question:\n${practiceQuestion.trim()}\n\nStudent answer:\n${studentAnswer.trim()}`,
      },
      {
        timeout: 25_000,
      }
    );

    const parsed = parseCheckResult(getOutputText(response));

    if (!parsed) {
      return NextResponse.json(
        { error: "Unable to check that answer right now." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      correct: parsed.correct,
      feedback: parsed.feedback,
      hint: parsed.hint,
    });
  } catch (error) {
    console.error("check-practice error:", error);

    return NextResponse.json(
      { error: "Unable to check that answer right now." },
      { status: 500 }
    );
  }
}
