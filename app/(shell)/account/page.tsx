"use client";

import { Suspense, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";

import { ContentColumn, PageHeader } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { updateLocale } from "@/lib/state/actions";
import {
  LANGUAGE_OPTIONS,
  PLAN_DETAILS,
  PLAN_LABELS,
} from "@/lib/state/constants";
import { useSettings } from "@/lib/state/hooks";
import { useUserStore } from "@/lib/state/userStore";
import { useBillingStore } from "@/lib/billing/store";
import { useI18n } from "@/lib/i18n";

function AccountPageContent() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { resolvedTheme, setTheme } = useTheme();
  const settings = useSettings();
  const user = useUserStore((state) => state.user);
  const updateProfile = useUserStore((state) => state.updateProfile);
  const setPlan = useUserStore((state) => state.setPlan);
  const choosePlan = useBillingStore((state) => state.choosePlan);

  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const currentThemeLabel = resolvedTheme ?? settings.theme;
  const activeTab =
    searchParams.get("tab") === "billing" ? "billing" : "settings";

  const usage = useMemo(() => {
    const totalCredits = 120;
    const usedCredits = 42;
    const percent = Math.min(
      100,
      Math.round((usedCredits / totalCredits) * 100),
    );
    return { totalCredits, usedCredits, percent };
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-background py-6">
      <ContentColumn className="space-y-6">
        <PageHeader label={t("account.label")} title={t("account.title")} />

        <Tabs
          value={activeTab}
          onValueChange={(value) =>
            router.replace(
              value === "billing" ? "/account?tab=billing" : "/account",
            )
          }
        >
          <TabsList>
            <TabsTrigger value="settings">
              {t("account.settingsTab")}
            </TabsTrigger>
            <TabsTrigger value="billing">{t("account.billingTab")}</TabsTrigger>
          </TabsList>

          <TabsContent value="settings" className="space-y-4">
            <Card key={user.id}>
              <CardHeader>
                <CardTitle>{t("account.profile")}</CardTitle>
                <CardDescription>
                  {t("account.updateLocalDetails")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">{t("account.displayName")}</Label>
                    <Input
                      id="name"
                      defaultValue={user.name}
                      ref={nameRef}
                      placeholder={t("auth.name")}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">{t("account.email")}</Label>
                    <Input
                      id="email"
                      type="email"
                      defaultValue={user.email}
                      ref={emailRef}
                      placeholder="demo@example.com"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    onClick={() =>
                      updateProfile({
                        name: nameRef.current?.value ?? "",
                        email: emailRef.current?.value ?? "",
                      })
                    }
                  >
                    {t("account.saveChanges")}
                  </Button>
                  <Badge variant="outline">
                    {t("account.planSuffix", { plan: PLAN_LABELS[user.plan] })}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("account.preferences")}</CardTitle>
                <CardDescription>{t("account.controlAppFeel")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-3">
                  <div className="text-sm font-medium">
                    {t("account.language")}
                  </div>
                  <RadioGroup
                    value={user.locale}
                    onValueChange={(value) => updateLocale(value)}
                    className="grid gap-2 sm:grid-cols-2"
                  >
                    {LANGUAGE_OPTIONS.map((option) => (
                      <label
                        key={option.id}
                        className="flex items-center justify-between rounded-lg border p-3 text-sm hover:bg-muted/40"
                      >
                        <span>{option.label}</span>
                        <RadioGroupItem
                          value={option.id}
                          aria-label={option.label}
                        />
                      </label>
                    ))}
                  </RadioGroup>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <div className="text-sm font-medium">
                      {t("account.theme")}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(["light", "dark", "system"] as const).map((value) => (
                        <Button
                          key={value}
                          type="button"
                          size="sm"
                          variant={
                            settings.theme === value ? "default" : "outline"
                          }
                          onClick={() => {
                            settings.setTheme(value);
                            setTheme(value);
                          }}
                        >
                          {value === "light"
                            ? t("common.light")
                            : value === "dark"
                              ? t("common.dark")
                              : t("common.system")}
                        </Button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t("account.currentTheme", { theme: currentThemeLabel })}
                    </p>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="text-sm font-medium">
                        {t("account.reduceMotion")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("account.minimizeAnimations")}
                      </p>
                    </div>
                    <Switch
                      checked={settings.reduceMotion}
                      onCheckedChange={(checked) =>
                        settings.setReduceMotion(checked)
                      }
                      aria-label={t("account.reduceMotion")}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="billing" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{t("account.currentPlan")}</CardTitle>
                <CardDescription>
                  {t("account.mockedBillingState")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">
                      {t("account.planSuffix", {
                        plan: PLAN_LABELS[user.plan],
                      })}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("account.renewsMonthly")}
                    </p>
                  </div>
                  <Badge variant="outline">{t("common.active")}</Badge>
                </div>
                <div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {t("account.creditsUsed")}
                    </span>
                    <span className="font-medium">
                      {usage.usedCredits} / {usage.totalCredits}
                    </span>
                  </div>
                  <div className="mt-2 h-2 w-full rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-primary"
                      style={{ width: `${usage.percent}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t("account.usageRefreshesMonthly")}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("account.upgradeOptions")}</CardTitle>
                <CardDescription>
                  {t("account.choosePlanWorkflow")}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 lg:grid-cols-3">
                {PLAN_DETAILS.map((plan) => {
                  const isCurrent = plan.id === user.plan;
                  const localizedDescription =
                    plan.id === "free"
                      ? t("billing.planFreeDescription")
                      : plan.id === "plus"
                        ? t("billing.planPlusDescription")
                        : plan.id === "pro"
                          ? t("billing.planProDescription")
                          : t("billing.planTeamDescription");
                  const localizedHighlights =
                    plan.id === "free"
                      ? [
                          t("billing.highlight2ActiveModels"),
                          t("billing.highlightCommunitySupport"),
                          t("billing.highlightBasicChatHistory"),
                        ]
                      : plan.id === "plus"
                        ? [
                            t("billing.highlight2ActiveModels"),
                            t("billing.highlightHigherQuotas"),
                            t("billing.highlightProjectsSupport"),
                          ]
                        : plan.id === "pro"
                          ? [
                              t("billing.highlight3ActiveModels"),
                              t("billing.highlightImageGeneration"),
                              t("billing.highlightPrioritySupport"),
                            ]
                          : [
                              t("billing.highlight6ActiveModels"),
                              t("billing.highlightLargestQuotas"),
                              t("billing.highlightTeamWorkflows"),
                            ];
                  return (
                    <div
                      key={plan.id}
                      className="flex h-full flex-col justify-between rounded-xl border p-4"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-base font-semibold">{plan.name}</p>
                          {isCurrent ? (
                            <Badge variant="outline">
                              {t("common.current")}
                            </Badge>
                          ) : null}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {localizedDescription}
                        </p>
                        <p className="text-2xl font-semibold">{plan.price}</p>
                        <ul className="space-y-1 text-xs text-muted-foreground">
                          {localizedHighlights.map((item) => (
                            <li key={item}>• {item}</li>
                          ))}
                        </ul>
                      </div>
                      <Button
                        className="mt-4"
                        variant={isCurrent ? "outline" : "default"}
                        disabled={isCurrent}
                        onClick={() => {
                          setPlan(plan.id);
                          choosePlan(plan.id);
                        }}
                      >
                        {isCurrent
                          ? t("billing.currentPlan")
                          : t("account.choosePlan")}
                      </Button>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("account.billingBackend")}</CardTitle>
                <CardDescription>{t("account.comingSoon")}</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {t("account.billingBackendDescription")}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </ContentColumn>
    </div>
  );
}

export default function AccountPage() {
  const { t } = useI18n();

  return (
    <Suspense
      fallback={
        <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
          {t("account.loadingAccount")}
        </div>
      }
    >
      <AccountPageContent />
    </Suspense>
  );
}
