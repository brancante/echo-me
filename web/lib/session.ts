import { getServerSession } from "next-auth";
import { authOptions } from "./auth";

export async function requireAuth() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    throw new Error("Unauthorized");
  }
  return session.user as { id: string; email: string; name?: string; image?: string };
}
