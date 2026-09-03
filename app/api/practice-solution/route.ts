import { NextResponse } from "next/server";
import { parseStudentLevel, solveTextQuestion } from "@/lib/text-solver";
import { verifyPracticeToken } from "@/lib/practice-token";

/**
 * Practice Mode "Show Solution" — dedicated route, never counts toward the
 * Free daily solver limit. Exemption is by this endpoint, not a client flag.
 * A signed practice token from generate-practice (or a solver PRACTICE QUESTION)
 * is required so arbitrary questions cannot be solved for free here.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const question = body.question;
    const level = parseStudentLevel(body.level);
    const verified = await verifyPracticeToken(
      request,
      question,
      body.practiceToken
    );

    if (!verified.ok) {
      return NextResponse.json(
        { error: verified.error },
        { status: verified.status }
      );
    }

    try {
      const solution = await solveTextQuestion(question, level);

      if (!solution.trim()) {
        return NextResponse.json(
          { error: "Unable to solve the question right now." },
          { status: 500 }
        );
      }

      return NextResponse.json({ solution });
    } catch (error) {
      console.error("EasyMath AI practice solution error:", error);

      return NextResponse.json(
        { error: "Unable to solve the question right now." },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("EasyMath AI practice solution error:", error);

    return NextResponse.json(
      { error: "Unable to solve the question right now." },
      { status: 500 }
    );
  }
}
