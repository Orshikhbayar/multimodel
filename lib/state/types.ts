export type UserPlanId = "free" | "plus" | "pro" | "team";

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  avatarInitial: string;
  avatarUrl?: string;
  plan: UserPlanId;
  creditsUSD?: number;
  locale: string;
}

export interface AppSettings {
  theme: "light" | "dark" | "system";
  locale: string;
  reduceMotion: boolean;
}

export interface SessionState {
  isAuthenticated: boolean;
  lastActiveAt: string | null;
  authToken?: string | null;
}

export interface LanguageOption {
  id: string;
  label: string;
  lang: string;
}
