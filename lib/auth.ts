import { getAuthenticatedUser } from "@/lib/supabase/server";

export type AppAuthSession = {
  user: {
    id: string;
    email: string | null;
    name: string | null;
  };
};

export async function auth(): Promise<AppAuthSession | null> {
  const user = await getAuthenticatedUser();
  if (!user) {
    return null;
  }

  return {
    user: {
      id: user.id,
      email: user.email,
      name: null,
    },
  };
}
