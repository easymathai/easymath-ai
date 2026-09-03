import { NextResponse } from "next/server";
import {
  enforceLoggedInSolverLimit,
  releaseSolverReservation,
  type SolverGateSuccess,
} from "@/lib/solver-gate";
import { parseStudentLevel, solveTextQuestion } from "@/lib/text-solver";
import {
  extractPracticeQuestion,
  jsonWithPracticeCookie,
  signPracticeQuestions,
} from "@/lib/practice-token";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const question = body.question;
    const level = parseStudentLevel(body.level);

    if (!question || typeof question !== "string") {
      return NextResponse.json(
        { error: "Please enter a math question." },
        { status: 400 }
      );
    }

    // Always enforce the Free daily solver limit. Client fields such as
    // usageMode, plan, or unlimited are ignored and cannot bypass billing.
    const enforced = await enforceLoggedInSolverLimit(request);

    if (!enforced.ok) {
      return enforced.response;
    }

    const gate: SolverGateSuccess = enforced;

    try {
      const solution = await solveTextQuestion(question, level);

      if (!solution.trim()) {
        await releaseSolverReservation(gate);

        return NextResponse.json(
          { error: "Unable to solve the question right now." },
          { status: 500 }
        );
      }

      const practiceQuestion = extractPracticeQuestion(solution);
      const issued = await signPracticeQuestions(
        request,
        practiceQuestion ? [practiceQuestion] : []
      );

      return jsonWithPracticeCookie(
        {
          solution,
          usage: gate.usage ?? null,
          practiceQuestion: practiceQuestion || null,
          practiceToken:
            issued.ok && issued.tokens[0] ? issued.tokens[0] : null,
        },
        issued.ok ? issued.guestSidToSet : null
      );
    } catch (error) {
      await releaseSolverReservation(gate);

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
