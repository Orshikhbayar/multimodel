import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import bcrypt from "bcryptjs";
import prisma from "@/lib/db";

// Demo users for development only - NEVER use in production
const DEMO_USERS = [
  {
    id: "demo-user-1",
    email: "demo@example.com",
    name: "Demo User",
    // Password: "demo123" (bcrypt hash)
    passwordHash:
      "$2b$10$7elmFmTOhxV5GDoHDF/c6ew39BHreoO9Psx1Cl.TDMqKS3ZAJx/JO",
  },
];

const isDevelopment = process.env.NODE_ENV !== "production";

// Build providers list dynamically based on environment
const providers = [];

// OAuth providers (production-ready)
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  );
}

if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  providers.push(
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    }),
  );
}

// Demo credentials provider - ONLY in development
if (isDevelopment) {
  providers.push(
    Credentials({
      name: "Demo Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const user = DEMO_USERS.find((u) => u.email === credentials.email);

        if (!user) {
          return null;
        }

        // Verify password with bcrypt only (no plaintext bypass)
        const isValidPassword = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash,
        );

        if (!isValidPassword) {
          return null;
        }

        // Return user with the demo ID
        // Note: In dev mode with credentials, user won't be in DB
        return {
          id: user.id,
          email: user.email,
          name: user.name,
        };
      },
    }),
  );
}

// Check if database is available (for adapter)
// In development without DB, we fall back to JWT-only
const hasDatabase = !!process.env.DATABASE_URL;

export const { handlers, signIn, signOut, auth } = NextAuth({
  // Use Prisma adapter when database is available (for OAuth)
  // This creates users in DB when they sign in via OAuth
  ...(hasDatabase && { adapter: PrismaAdapter(prisma) }),
  providers,
  pages: {
    signIn: "/auth/login",
  },
  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id;
      }
      // Include provider info for future use (e.g., linking accounts)
      if (account) {
        token.provider = account.provider;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
  // Use JWT strategy for session
  // This allows credentials auth to work without DB in development
  // OAuth users are still stored in DB via the adapter
  session: {
    strategy: "jwt",
  },
  // Ensure we're using secure cookies in production
  cookies: {
    sessionToken: {
      name:
        process.env.NODE_ENV === "production"
          ? "__Secure-authjs.session-token"
          : "authjs.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
});
