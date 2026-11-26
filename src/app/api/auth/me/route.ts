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
  const input = body?.preferences ?? {};
  const patch: { audioLang?: string; subtitleLang?: string; autoplay?: boolean } = {};
  for (const key of ["audioLang", "subtitleLang"] as const) {
    if (typeof input[key] === "string" && /^(?:[a-z]{2,3}(?:-[A-Za-z]{2,4})?)?$/.test(input[key])) patch[key] = input[key];
  }
  if (typeof input.autoplay === "boolean") patch.autoplay = input.autoplay;
  const preferences = { ...user.preferences, ...patch };
  await db.update(users).set({ preferences }).where(eq(users.id, user.id));
  return Response.json({ preferences });
}
