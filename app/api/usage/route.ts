import { NextResponse } from "next/server";
import { FREE_DAILY_SOLVER_LIMIT } from "@/lib/constants";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getRequestUser, getSolverUsage } from "@/lib/supabase/server";

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

  const usage = await getSolverUsage(auth.supabase);

  if (!usage) {
    return NextResponse.json(
      { error: "Unable to load your daily usage right now." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    used: usage.used,
    limit: usage.limit || FREE_DAILY_SOLVER_LIMIT,
    remaining: Math.max(0, (usage.limit || FREE_DAILY_SOLVER_LIMIT) - usage.used),
    plan: "Free",
  });
}
