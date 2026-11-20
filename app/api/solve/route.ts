import { NextResponse } from "next/server";
import {
  commitSolverReservation,
  enforceLoggedInSolverLimit,
  releaseSolverReservation,
  type SolverGateSuccess,
} from "@/lib/solver-gate";
import {
  parseMathFormat,
  parseStudentLevel,
  solveTextQuestion,
} from "@/lib/text-solver";
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
    // New clients opt in to LaTeX math; older clients keep plain text.
    const mathFormat = parseMathFormat(body.mathFormat);
    // "photo" = text the student confirmed/edited after the free photo read step.
    const source = body.source === "photo" ? "photo" : "text";

    if (!question || typeof question !== "string" || !question.trim()) {
      return NextResponse.json(
        { error: "Please enter a math question." },
        { status: 400 }
      );
    }

    if (question.length > 2000) {
      return NextResponse.json(
        { error: "That question is too long. Please shorten it and try again." },
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
      solution = await solveTextQuestion(question, level, { mathFormat, source });

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

      console.error("EasyMath Ai API error:", error);

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
      console.error("EasyMath Ai practice token error:", error);
    }

    return attachGuestCookie(
      jsonWithPracticeCookie(
        {
          solution,
          mathFormat,
          usage: gate.usage ?? null,
          practiceQuestion: practiceQuestion || null,
          practiceToken,
        },
        practiceGuestSid
      ),
      gate.guestCookieToSet
    );
  } catch (error) {
    console.error("EasyMath Ai API error:", error);

    return NextResponse.json(
      { error: "Unable to solve the question right now." },
      { status: 500 }
    );
  }
}
