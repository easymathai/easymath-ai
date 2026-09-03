import { NextResponse } from "next/server";
import { getPlanDisplayName, resolveUserPlan } from "@/lib/plans";
import { normalizeCloudProgress } from "@/lib/progress";
import { getRequestUser } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

const LEVELS = new Set(["primary", "middle", "high", "advanced"]);
const TOPICS = new Set([
  "arithmetic",
  "algebra",
  "fractions",
  "percentages",
  "geometry",
  "equations",
  "mixed",
]);

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Cloud accounts are not configured yet." },
      { status: 503 }
    );
  }

  const auth = await getRequestUser(request);

  if (!auth) {
    return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  }

  const { data, error } = await auth.supabase
    .from("profiles")
    .select(
      "email, plan, student_level, practice_topic, questions_solved, practice_attempted, practice_correct, activity, practice_progress, updated_at"
    )
    .eq("id", auth.user.id)
    .maybeSingle();

  if (error) {
    console.error("progress GET error:", error);
    return NextResponse.json(
      { error: "Unable to load your progress right now." },
      { status: 500 }
    );
  }

  if (!data) {
    const { error: insertError } = await auth.supabase.from("profiles").insert({
      id: auth.user.id,
      email: auth.user.email,
      plan: "free",
    });

    if (insertError) {
      console.error("progress bootstrap error:", insertError);
      return NextResponse.json(
        { error: "Unable to create your profile right now." },
        { status: 500 }
      );
    }

    const plan = "free" as const;

    return NextResponse.json({
      email: auth.user.email ?? "",
      plan,
      planLabel: getPlanDisplayName(plan),
      progress: normalizeCloudProgress({
        student_level: "middle",
        practice_topic: "mixed",
        questions_solved: 0,
        practice_attempted: 0,
        practice_correct: 0,
        activity: [],
        practice_progress: {},
      }),
    });
  }

  const plan = resolveUserPlan(data.plan);

  return NextResponse.json({
    email: data.email || auth.user.email || "",
    plan,
    planLabel: getPlanDisplayName(plan),
    progress: normalizeCloudProgress(data),
  });
}

export async function PUT(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Cloud accounts are not configured yet." },
      { status: 503 }
    );
  }

  const auth = await getRequestUser(request);

  if (!auth) {
    return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  }

  let body: Record<string, unknown>;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid progress payload." }, { status: 400 });
  }

  const studentLevel =
    typeof body.studentLevel === "string" && LEVELS.has(body.studentLevel)
      ? body.studentLevel
      : "middle";
  const practiceTopic =
    typeof body.practiceTopic === "string" && TOPICS.has(body.practiceTopic)
      ? body.practiceTopic
      : "mixed";

  const activity = Array.isArray(body.activity)
    ? body.activity
        .filter(
          (item) =>
            item &&
            typeof item === "object" &&
            typeof (item as { label?: unknown }).label === "string" &&
            typeof (item as { at?: unknown }).at === "string"
        )
        .slice(0, 8)
    : [];

  const practiceProgress =
    body.practiceProgress && typeof body.practiceProgress === "object"
      ? body.practiceProgress
      : {};

  // Intentionally omit `plan` — clients must never set Free/Pro themselves.
  const payload = {
    id: auth.user.id,
    email: auth.user.email,
    student_level: studentLevel,
    practice_topic: practiceTopic,
    questions_solved: Math.max(0, Number(body.questionsSolved) || 0),
    practice_attempted: Math.max(0, Number(body.practiceAttempted) || 0),
    practice_correct: Math.max(0, Number(body.practiceCorrect) || 0),
    activity,
    practice_progress: practiceProgress,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await auth.supabase
    .from("profiles")
    .upsert(payload, { onConflict: "id" })
    .select(
      "email, plan, student_level, practice_topic, questions_solved, practice_attempted, practice_correct, activity, practice_progress"
    )
    .single();

  if (error) {
    console.error("progress PUT error:", error);
    return NextResponse.json(
      { error: "Unable to save your progress right now." },
      { status: 500 }
    );
  }

  const plan = resolveUserPlan(data.plan);

  return NextResponse.json({
    email: data.email || auth.user.email || "",
    plan,
    planLabel: getPlanDisplayName(plan),
    progress: normalizeCloudProgress(data),
  });
}
