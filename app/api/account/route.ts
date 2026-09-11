import { NextResponse } from "next/server";
import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { getRequestUser } from "@/lib/supabase/server";

/**
 * Permanently delete the authenticated user's EasyMath Auth account.
 * User id is taken only from the verified session JWT — never from the body.
 * profiles, daily_usage, and solver_reservations cascade from auth.users.
 */
export async function DELETE(request: Request) {
  const auth = await getRequestUser(request);

  if (!auth) {
    return NextResponse.json(
      { error: "Please sign in to delete your account." },
      { status: 401 }
    );
  }

  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      {
        error:
          "Account deletion is temporarily unavailable. Please try again later.",
      },
      { status: 503 }
    );
  }

  const admin = createSupabaseAdminClient();

  if (!admin) {
    return NextResponse.json(
      {
        error:
          "Account deletion is temporarily unavailable. Please try again later.",
      },
      { status: 503 }
    );
  }

  const userId = auth.user.id;

  const { error } = await admin.auth.admin.deleteUser(userId);

  if (error) {
    const message = (error.message || "").toLowerCase();
    const alreadyGone =
      message.includes("not found") ||
      message.includes("user not found") ||
      (error as { status?: number }).status === 404;

    if (!alreadyGone) {
      console.error("account deleteUser failed");
      return NextResponse.json(
        { error: "We couldn't delete your account. Please try again." },
        { status: 500 }
      );
    }
  }

  // Idempotent cleanup if cascade has not finished yet. Scoped to this user only.
  await admin.from("solver_reservations").delete().eq("user_id", userId);
  await admin.from("daily_usage").delete().eq("user_id", userId);
  await admin.from("profiles").delete().eq("id", userId);

  return NextResponse.json({ ok: true });
}
