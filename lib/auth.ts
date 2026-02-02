import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

// Demo users for development - in production, use a real database
const DEMO_USERS = [
    {
        id: "1",
        email: "demo@example.com",
        name: "Demo User",
        // Password: "demo123" (pre-hashed)
        passwordHash: "$2a$10$N9qo8uLOickgx2ZMRZoMy.Wj5HvL.QWGK79JhQzOx9XLxn1J9ZQZS",
    },
];

export const { handlers, signIn, signOut, auth } = NextAuth({
    providers: [
        Credentials({
            name: "Credentials",
            credentials: {
                email: { label: "Email", type: "email" },
                password: { label: "Password", type: "password" },
            },
            async authorize(credentials) {
                if (!credentials?.email || !credentials?.password) {
                    return null;
                }

                const user = DEMO_USERS.find(
                    (u) => u.email === credentials.email
                );

                if (!user) {
                    return null;
                }

                // For demo, allow "demo123" or check hash
                const isValidPassword =
                    credentials.password === "demo123" ||
                    (await bcrypt.compare(
                        credentials.password as string,
                        user.passwordHash
                    ));

                if (!isValidPassword) {
                    return null;
                }

                return {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                };
            },
        }),
    ],
    pages: {
        signIn: "/auth/login",
    },
    callbacks: {
        async jwt({ token, user }) {
            if (user) {
                token.id = user.id;
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
    session: {
        strategy: "jwt",
    },
});
