import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { getOrCreateUser } from "./db";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (user.email) {
        const dbUser = await getOrCreateUser(user.email, user.name || undefined, user.image || undefined);
        (user as any).dbId = dbUser.id;
      }
      return true;
    },
    async session({ session, token }) {
      if (session.user?.email) {
        const result = await getOrCreateUser(session.user.email, session.user.name || undefined, session.user.image || undefined);
        (session.user as any).id = result.id;
      }
      return session;
    },
  },
  pages: { signIn: "/" },
};
