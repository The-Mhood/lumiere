import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

const COOKIE = "lumiere_session";
function signingKey() {
  const secret = process.env.AUTH_SECRET;
  if (process.env.NODE_ENV === "production" && (!secret || secret.length < 32 || secret.startsWith("dev-only"))) {
    throw new Error("Set AUTH_SECRET to at least 32 random characters before enabling production accounts.");
  }
  return new TextEncoder().encode(secret ?? "dev-only-secret-change-me-in-production-please");
}

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 10);
}

export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

export async function createSession(userId: number) {
  const token = await new SignJWT({ sub: String(userId) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(signingKey());
  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // Web production is secure by default. The desktop loopback server
    // explicitly sets COOKIE_SECURE=false (no external network exposure).
    secure: process.env.COOKIE_SECURE === "true" || (process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false"),
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(COOKIE);
}

export async function getSessionUserId(): Promise<number | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, signingKey());
    return payload.sub ? Number(payload.sub) : null;
  } catch {
    return null;
  }
}

export async function getCurrentUser() {
  const id = await getSessionUserId();
  if (!id) return null;
  const [user] = await db
    .select({ id: users.id, email: users.email, name: users.name, preferences: users.preferences })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  return user ?? null;
}
