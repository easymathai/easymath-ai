import { NextResponse } from "next/server";
import { FREE_DAILY_SOLVER_LIMIT } from "@/lib/constants";
import {
  attachGuestCookie,
  getGuestUsageSecret,
  resolveGuestIdentity,
} from "@/lib/guest-identity";
import {
  getDailySolverLimitForPlan,
  getPlanDisplayName,
} from "@/lib/plans";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  getGuestSolverUsage,
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

  if (auth) {
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

  const identity = resolveGuestIdentity(request);
  const secret = getGuestUsageSecret();

  if (!identity || !secret) {
    return attachGuestCookie(
      NextResponse.json(
        { error: "Unable to load your daily usage right now." },
        { status: 503 }
      ),
      identity?.cookieToSet ?? null
    );
  }

  const usage = await getGuestSolverUsage(identity.guestId, secret);

  if (!usage) {
    return attachGuestCookie(
      NextResponse.json(
        { error: "Unable to load your daily usage right now." },
        { status: 500 }
      ),
      identity.cookieToSet
    );
  }

  const limit = usage.limit || FREE_DAILY_SOLVER_LIMIT;

  return attachGuestCookie(
    NextResponse.json({
      plan: "free",
      planLabel: getPlanDisplayName("free"),
      unlimited: false,
      used: usage.used,
      limit,
      remaining: Math.max(0, limit - usage.used),
    }),
    identity.cookieToSet
  );
}
