import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_SESSION_COOKIE } from "@/lib/auth-session-cookie";
import { getConsoleRoleFromToken } from "@/lib/owner";
import OwnerConsole from "./owner-console";

export const dynamic = "force-dynamic";

export default async function OwnerPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_SESSION_COOKIE)?.value;
  const role = await getConsoleRoleFromToken(token);

  if (!role) {
    redirect("/owner/login");
  }

  return <OwnerConsole />;
}
