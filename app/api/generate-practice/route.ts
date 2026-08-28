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
      "Primary: friendly numbers and only a few small steps. Very simple wording if any extra words are needed.",
    middle:
      "Middle School: similar difficulty to a typical class question on this topic.",
    high: "High School: school-appropriate difficulty for this topic.",
    advanced:
      "Advanced: same topic, a little more demanding, still school math. Not a university problem.",
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

function parsePracticeQuestion(text: string): string {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");

  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");

  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(stripped.slice(start, end + 1)) as {
        practiceQuestion?: unknown;
      };

      if (typeof parsed.practiceQuestion === "string") {
        return parsed.practiceQuestion.trim();
      }
    } catch {
      // Fall through to plain-text parsing.
    }
  }

  return stripped
    .split("\n")
    .map((line) => line.replace(/^["'`]+|["'`]+$/g, "").trim())
    .find((line) => line.length > 0) ?? "";
}

function normalizeQuestion(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "");
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const originalQuestion = body.originalQuestion;
    const previousPracticeQuestion = body.previousPracticeQuestion;
    const level = parseStudentLevel(body.level);

    if (!originalQuestion || typeof originalQuestion !== "string") {
      return NextResponse.json(
        { error: "Please include the original question." },
        { status: 400 }
      );
    }

    if (!originalQuestion.trim()) {
      return NextResponse.json(
        { error: "Please include the original question." },
        { status: 400 }
      );
    }

    const previous =
      typeof previousPracticeQuestion === "string"
        ? previousPracticeQuestion.trim()
        : "";

    const response = await openai.responses.create(
      {
        model: "gpt-5-mini",
        instructions: `
You create ONE new EasyMath practice question.

Rules:
- Test the SAME mathematical concept/topic as the original problem.
- Use different numbers or values.
- Do NOT repeat the original question.
- Do NOT repeat the previous practice question if one is given.
- Difficulty: ${getLevelStyleInstructions(level)}
- The question must have a valid expected answer.
- Keep it as a short school math question, not a story unless the original was a word problem.

Return STRICT JSON only, with no markdown and no extra keys:
{
  "practiceQuestion": "the new question only"
}

Do NOT include the answer.
Do NOT include hints, labels, or explanation.
`,
        input: `Original question:\n${originalQuestion.trim()}\n\nPrevious practice question:\n${previous || "(none)"}`,
      },
      {
        timeout: 25_000,
      }
    );

    const practiceQuestion = parsePracticeQuestion(getOutputText(response));

    if (!practiceQuestion) {
      return NextResponse.json(
        { error: "Unable to create a new question right now." },
        { status: 500 }
      );
    }

    const sameAsOriginal =
      normalizeQuestion(practiceQuestion) ===
      normalizeQuestion(originalQuestion);
    const sameAsPrevious =
      previous &&
      normalizeQuestion(practiceQuestion) === normalizeQuestion(previous);

    if (sameAsOriginal || sameAsPrevious) {
      return NextResponse.json(
        { error: "Unable to create a new question right now." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      practiceQuestion,
    });
  } catch (error) {
    console.error("generate-practice error:", error);

    return NextResponse.json(
      { error: "Unable to create a new question right now." },
      { status: 500 }
    );
  }
}
