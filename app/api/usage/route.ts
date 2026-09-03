import { NextResponse } from "next/server";
import { FREE_DAILY_SOLVER_LIMIT } from "@/lib/constants";
import {
  getDailySolverLimitForPlan,
  getPlanDisplayName,
} from "@/lib/plans";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  getRequestUser,
  getSolverUsage,
  getUserPlanFromProfile,
} from "@/lib/supabase/server";

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

  const plan = await getUserPlanFromProfile(auth.supabase, auth.user.id);
  const planLimit = getDailySolverLimitForPlan(plan);
  const unlimited = planLimit === null;

  if (unlimited) {
    return NextResponse.json({
      plan,
      planLabel: getPlanDisplayName(plan),
      unlimited: true,
      used: 0,
      limit: null,
      remaining: null,
    });
  }

  const usage = await getSolverUsage(auth.supabase);

  if (!usage) {
    return NextResponse.json(
      { error: "Unable to load your daily usage right now." },
      { status: 500 }
    );
  }

  const limit = usage.limit || planLimit || FREE_DAILY_SOLVER_LIMIT;

  return NextResponse.json({
    plan,
    planLabel: getPlanDisplayName(plan),
    unlimited: false,
    used: usage.used,
    limit,
    remaining: Math.max(0, limit - usage.used),
  });
}
