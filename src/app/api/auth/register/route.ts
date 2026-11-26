import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession, hashPassword } from "@/lib/auth";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  const name = String(body?.name ?? "").trim();
  const password = String(body?.password ?? "");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  if (name.length < 2) return Response.json({ error: "Name must be at least 2 characters." }, { status: 400 });
  if (password.length < 8) return Response.json({ error: "Password must be at least 8 characters." }, { status: 400 });

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) return Response.json({ error: "An account with that email already exists." }, { status: 409 });

  const [user] = await db.insert(users).values({ email, name, passwordHash: await hashPassword(password) }).returning({ id: users.id, name: users.name, email: users.email });
  await createSession(user.id);
  return Response.json({ user });
}
