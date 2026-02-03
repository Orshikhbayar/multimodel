import { nanoid } from "nanoid";

import { useConversationStore } from "@/lib/stores/conversationStore";
import { useModelStore } from "@/lib/stores/modelStore";
import { useSettingsStore } from "@/lib/stores/settingsStore";
import { useBillingStore } from "@/lib/billing/store";

import { useAppSettingsStore } from "./settingsStore";
import { useSessionStore } from "./sessionStore";
import { useUserStore } from "./userStore";
import { getInitialFromName } from "./utils";
import type { UserPlanId } from "./types";

export function signInLocal(payload: {
  name: string;
  email: string;
  plan?: UserPlanId;
}) {
  const { name, email, plan } = payload;
  const resolvedName = name?.trim() || email?.split("@")[0] || "User";
  const avatarInitial = getInitialFromName(resolvedName || email, "U");
  const locale = useAppSettingsStore.getState().locale;

  useUserStore.getState().setUser({
    id: `user-${nanoid(8)}`,
    email: email.trim(),
    name: resolvedName,
    avatarInitial,
    plan: plan ?? "free",
    locale,
  });

  useSessionStore.getState().signIn(`demo-${nanoid(16)}`);
}

export function updateLocale(locale: string) {
  useAppSettingsStore.getState().setLocale(locale);
  useUserStore.getState().setLocale(locale);
}

export function logoutLocal() {
  useSessionStore.getState().signOut();
  useUserStore.getState().resetUser();
  useAppSettingsStore.getState().resetSettings({ keepTheme: true });

  useSettingsStore.getState().resetSettings();
  useModelStore.getState().resetSlots();
  useConversationStore.getState().resetConversations();
  useBillingStore.getState().resetBilling();
}
