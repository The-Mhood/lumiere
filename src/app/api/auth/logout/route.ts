import { destroySession } from "@/lib/auth";

export async function POST(req: Request) {
  await destroySession();
  const accept = req.headers.get("accept") ?? "";
  if (accept.includes("text/html")) return Response.redirect(new URL("/", req.url), 303);
  return Response.json({ ok: true });
}
