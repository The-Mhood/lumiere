import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  return Response.json({ user });
}

export async function PATCH(req: Request) {
  const { db } = await import("@/db");
  const { users } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const preferences = { ...user.preferences, ...(body?.preferences ?? {}) };
  await db.update(users).set({ preferences }).where(eq(users.id, user.id));
  return Response.json({ preferences });
}
