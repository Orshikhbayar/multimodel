"use client";

import { useEffect, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";

import { ContentColumn, PageHeader } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { updateLocale } from "@/lib/state/actions";
import { LANGUAGE_OPTIONS, PLAN_DETAILS, PLAN_LABELS } from "@/lib/state/constants";
import { useSession, useSettings } from "@/lib/state/hooks";
import { useUserStore } from "@/lib/state/userStore";
import { useBillingStore } from "@/lib/billing/store";

export default function AccountPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { resolvedTheme, setTheme } = useTheme();
  const { isAuthenticated } = useSession();
  const settings = useSettings();
  const user = useUserStore((state) => state.user);
  const updateProfile = useUserStore((state) => state.updateProfile);
  const setPlan = useUserStore((state) => state.setPlan);
  const choosePlan = useBillingStore((state) => state.choosePlan);

  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const currentThemeLabel = resolvedTheme ?? settings.theme;
  const activeTab = searchParams.get("tab") === "billing" ? "billing" : "settings";

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, router]);

  const usage = useMemo(() => {
    const totalCredits = 120;
    const usedCredits = 42;
    const percent = Math.min(100, Math.round((usedCredits / totalCredits) * 100));
    return { totalCredits, usedCredits, percent };
  }, []);

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
        Redirecting to login...
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-background py-6">
      <ContentColumn className="space-y-6">
        <PageHeader label="Account" title="Plan & Settings" />

        <Tabs
          value={activeTab}
          onValueChange={(value) =>
            router.replace(value === "billing" ? "/account?tab=billing" : "/account")
          }
        >
          <TabsList>
            <TabsTrigger value="settings">Settings</TabsTrigger>
            <TabsTrigger value="billing">Billing</TabsTrigger>
          </TabsList>

          <TabsContent value="settings" className="space-y-4">
            <Card key={user.id}>
              <CardHeader>
                <CardTitle>Profile</CardTitle>
                <CardDescription>Update your local account details.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">Display name</Label>
                    <Input
                      id="name"
                      defaultValue={user.name}
                      ref={nameRef}
                      placeholder="Demo User"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
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
                    Save changes
                  </Button>
                  <Badge variant="outline">{PLAN_LABELS[user.plan]} plan</Badge>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Preferences</CardTitle>
                <CardDescription>Control how the app feels for you.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-3">
                  <div className="text-sm font-medium">Language</div>
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
                        <RadioGroupItem value={option.id} aria-label={option.label} />
                      </label>
                    ))}
                  </RadioGroup>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Theme</div>
                    <div className="flex flex-wrap gap-2">
                      {(["light", "dark", "system"] as const).map((value) => (
                        <Button
                          key={value}
                          type="button"
                          size="sm"
                          variant={settings.theme === value ? "default" : "outline"}
                          onClick={() => {
                            settings.setTheme(value);
                            setTheme(value);
                          }}
                        >
                          {value.charAt(0).toUpperCase() + value.slice(1)}
                        </Button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">Current: {currentThemeLabel}</p>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="text-sm font-medium">Reduce motion</p>
                      <p className="text-xs text-muted-foreground">Minimize UI animations.</p>
                    </div>
                    <Switch
                      checked={settings.reduceMotion}
                      onCheckedChange={(checked) => settings.setReduceMotion(checked)}
                      aria-label="Reduce motion"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="billing" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Current plan</CardTitle>
                <CardDescription>Mocked billing state for the prototype.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{PLAN_LABELS[user.plan]} plan</p>
                    <p className="text-xs text-muted-foreground">Renews monthly</p>
                  </div>
                  <Badge variant="outline">Active</Badge>
                </div>
                <div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Credits used</span>
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
                    Usage refreshes monthly. This is mocked data for now.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Upgrade options</CardTitle>
                <CardDescription>Choose the plan that fits your workflow.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 lg:grid-cols-3">
                {PLAN_DETAILS.map((plan) => {
                  const isCurrent = plan.id === user.plan;
                  return (
                    <div
                      key={plan.id}
                      className="flex h-full flex-col justify-between rounded-xl border p-4"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-base font-semibold">{plan.name}</p>
                          {isCurrent ? <Badge variant="outline">Current</Badge> : null}
                        </div>
                        <p className="text-sm text-muted-foreground">{plan.description}</p>
                        <p className="text-2xl font-semibold">{plan.price}</p>
                        <ul className="space-y-1 text-xs text-muted-foreground">
                          {plan.highlights.map((item) => (
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
                        {isCurrent ? "Current plan" : "Choose plan"}
                      </Button>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Billing backend</CardTitle>
                <CardDescription>Coming soon.</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                We will connect this to a real billing system in a future release. For now, the
                UI is fully interactive and stored locally.
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </ContentColumn>
    </div>
  );
}
