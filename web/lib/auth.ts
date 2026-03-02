import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { getOrCreateUser } from "./db";

const localUsers: Record<string, { name: string; password: string }> = {
  gustavo: { name: "Gustavo", password: "1234" },
  raquel: { name: "Raquel", password: "1234" },
  racz: { name: "Racz", password: "1234" },
  leandro: { name: "Leandro", password: "1234" },
};

const providers: any[] = [
  CredentialsProvider({
    name: "Login simples",
    credentials: {
      username: { label: "Usuário", type: "text" },
      password: { label: "Senha", type: "password" },
    },
    async authorize(credentials) {
      const username = credentials?.username?.toLowerCase().trim();
      const password = credentials?.password;
      if (!username || !password) return null;

      const found = localUsers[username];
      if (!found || found.password !== password) return null;

      return {
        id: username,
        name: found.name,
        email: `${username}@local.echo`,
      };
    },
  }),
];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  );
}

export const authOptions: NextAuthOptions = {
  providers,
  callbacks: {
    async signIn({ user }) {
      if (user.email) {
        try {
          const dbUser = await getOrCreateUser(user.email, user.name || undefined, user.image || undefined);
          (user as any).dbId = dbUser.id;
        } catch (error) {
          console.error("signIn db fallback:", error);
          (user as any).dbId = user.email;
        }
      }
      return true;
    },
    async session({ session }) {
      if (session.user?.email) {
        try {
          const result = await getOrCreateUser(session.user.email, session.user.name || undefined, session.user.image || undefined);
          (session.user as any).id = result.id;
        } catch (error) {
          console.error("session db fallback:", error);
          (session.user as any).id = session.user.email;
        }
      }
      return session;
    },
  },
};
