import { NextResponse } from "next/server";
import {
  commitSolverReservation,
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
import { attachGuestCookie } from "@/lib/guest-identity";

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
    let solution = "";

    try {
      solution = await solveTextQuestion(question, level);

      if (!solution.trim()) {
        await releaseSolverReservation(gate);

        return attachGuestCookie(
          NextResponse.json(
            { error: "Unable to solve the question right now." },
            { status: 500 }
          ),
          gate.guestCookieToSet
        );
      }
    } catch (error) {
      await releaseSolverReservation(gate);

      console.error("EasyMath AI API error:", error);

      return attachGuestCookie(
        NextResponse.json(
          { error: "Unable to solve the question right now." },
          { status: 500 }
        ),
        gate.guestCookieToSet
      );
    }

    // Valid solution: credit stays consumed. Never release after this point.
    await commitSolverReservation(gate);

    let practiceQuestion = "";
    let practiceToken: string | null = null;
    let practiceGuestSid: string | null = null;

    try {
      practiceQuestion = extractPracticeQuestion(solution);
      const issued = await signPracticeQuestions(
        request,
        practiceQuestion ? [practiceQuestion] : []
      );

      if (issued.ok) {
        practiceToken = issued.tokens[0] || null;
        practiceGuestSid = issued.guestSidToSet;
      }
    } catch (error) {
      console.error("EasyMath AI practice token error:", error);
    }

    return attachGuestCookie(
      jsonWithPracticeCookie(
        {
          solution,
          usage: gate.usage ?? null,
          practiceQuestion: practiceQuestion || null,
          practiceToken,
        },
        practiceGuestSid
      ),
      gate.guestCookieToSet
    );
  } catch (error) {
    console.error("EasyMath AI API error:", error);

    return NextResponse.json(
      { error: "Unable to solve the question right now." },
      { status: 500 }
    );
  }
}
