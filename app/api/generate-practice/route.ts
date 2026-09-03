import OpenAI from "openai";
import { NextResponse } from "next/server";
import {
  jsonWithPracticeCookie,
  PRACTICE_TOKEN_CONFIG_MESSAGE,
  signPracticeQuestions,
} from "@/lib/practice-token";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const STUDENT_LEVELS = ["primary", "middle", "high", "advanced"] as const;

type StudentLevel = (typeof STUDENT_LEVELS)[number];

const PRACTICE_TOPICS = [
  "arithmetic",
  "algebra",
  "fractions",
  "percentages",
  "geometry",
  "equations",
  "mixed",
] as const;

type PracticeTopic = (typeof PRACTICE_TOPICS)[number];

function parseStudentLevel(value: unknown): StudentLevel {
  if (typeof value === "string" && STUDENT_LEVELS.includes(value as StudentLevel)) {
    return value as StudentLevel;
  }

  return "middle";
}

function parsePracticeTopic(value: unknown): PracticeTopic {
  if (typeof value === "string" && PRACTICE_TOPICS.includes(value as PracticeTopic)) {
    return value as PracticeTopic;
  }

  return "mixed";
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

function getTopicInstructions(topic: PracticeTopic): string {
  const topics: Record<PracticeTopic, string> = {
    arithmetic: "Arithmetic: addition, subtraction, multiplication, division, and order of operations.",
    algebra: "Algebra: simplifying, expanding, or substituting with a variable.",
    fractions: "Fractions: add, subtract, multiply, divide, or simplify fractions and mixed numbers.",
    percentages: "Percentages: percentage of an amount, increase, decrease, or reverse percentage.",
    geometry: "Geometry: area, perimeter, volume, or simple angle facts. Include units if needed.",
    equations: "Equations: linear equations in one variable, such as 3x + 4 = 19.",
    mixed: "Mixed school math: stay close to the original topic if one is given, otherwise vary slightly across school topics.",
  };

  return topics[topic];
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

function parseGeneratedQuestions(text: string): string[] {
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
        practiceQuestions?: unknown;
      };

      if (Array.isArray(parsed.practiceQuestions)) {
        return parsed.practiceQuestions
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean);
      }

      if (typeof parsed.practiceQuestion === "string") {
        return [parsed.practiceQuestion.trim()].filter(Boolean);
      }
    } catch {
      // Fall through to plain-text parsing.
    }
  }

  const line = stripped
    .split("\n")
    .map((item) => item.replace(/^["'`]+|["'`]+$/g, "").trim())
    .find((item) => item.length > 0);

  return line ? [line] : [];
}

function normalizeQuestion(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "");
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const originalQuestion =
      typeof body.originalQuestion === "string" ? body.originalQuestion.trim() : "";
    const previousPracticeQuestion =
      typeof body.previousPracticeQuestion === "string"
        ? body.previousPracticeQuestion.trim()
        : "";
    const previousQuestions = Array.isArray(body.previousQuestions)
      ? body.previousQuestions.filter(
          (item: unknown): item is string =>
            typeof item === "string" && item.trim().length > 0
        )
      : [];
    const level = parseStudentLevel(body.level);
    const topic = parsePracticeTopic(body.topic);
    const count = Math.min(5, Math.max(1, Number(body.count) || 1));

    const avoid = [
      originalQuestion,
      previousPracticeQuestion,
      ...previousQuestions,
    ].filter(Boolean);

    const response = await openai.responses.create(
      {
        model: "gpt-5-mini",
        instructions: `
You create EasyMath practice question${count > 1 ? "s" : ""}.

Rules:
- Topic: ${getTopicInstructions(topic)}
- Difficulty: ${getLevelStyleInstructions(level)}
- If an original question is given, test the SAME mathematical concept unless the chosen topic clearly differs.
- Use different numbers or values from the original and from any previous questions.
- Do NOT repeat any question in the avoid list.
- Each question must have a valid expected answer.
- Keep each item as a short school math question, not a story unless the original was a word problem.
- Do NOT include answers, hints, labels, or explanation.

Return STRICT JSON only:
${
  count > 1
    ? `{ "practiceQuestions": ["question 1", "question 2"] }`
    : `{ "practiceQuestion": "the new question only" }`
}
${count > 1 ? `Return exactly ${count} questions.` : ""}
`,
        input: `Original question:\n${originalQuestion || "(none — create from the topic)"}\n\nAvoid repeating:\n${avoid.join("\n") || "(none)"}\n\nHow many questions:\n${count}`,
      },
      {
        timeout: 25_000,
      }
    );

    const generated = parseGeneratedQuestions(getOutputText(response));
    const avoidNorm = new Set(avoid.map(normalizeQuestion));
    const unique = generated.filter((item) => !avoidNorm.has(normalizeQuestion(item)));

    if (unique.length === 0) {
      return NextResponse.json(
        { error: "Unable to create a new question right now." },
        { status: 500 }
      );
    }

    const selected = unique.slice(0, count);
    const issued = await signPracticeQuestions(request, selected);

    if (!issued.ok) {
      return NextResponse.json(
        { error: PRACTICE_TOKEN_CONFIG_MESSAGE },
        { status: 503 }
      );
    }

    return jsonWithPracticeCookie(
      {
        practiceQuestion: selected[0],
        practiceToken: issued.tokens[0],
        practiceQuestions: selected,
        practiceTokens: issued.tokens,
      },
      issued.guestSidToSet
    );
  } catch (error) {
    console.error("generate-practice error:", error);

    return NextResponse.json(
      { error: "Unable to create a new question right now." },
      { status: 500 }
    );
  }
}
