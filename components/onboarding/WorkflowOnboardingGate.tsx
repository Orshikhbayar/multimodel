"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  ClipboardList,
  Package,
  ShoppingBag,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { analytics } from "@/lib/analytics";
import { useChatActions } from "@/lib/hooks/useChatActions";
import { useSettingsStore, useWorkspaceStore } from "@/lib/stores";
import {
  WORKFLOW_PACKS,
  buildWorkflowPrompt,
  getWorkflowPackById,
  type WorkflowPack,
  type WorkflowPackId,
} from "@/lib/workflows/packs";

interface WorkflowOnboardingGateProps {
  children: React.ReactNode;
}

const PACK_ICON_BY_ID: Record<
  WorkflowPackId,
  ComponentType<{ className?: string }>
> = {
  "importer-solo-seller": Package,
  "online-seller": ShoppingBag,
  "procurement-tender": ClipboardList,
};

function buildDefaultInputValues(pack: WorkflowPack) {
  return Object.fromEntries(pack.inputFields.map((field) => [field.key, ""]));
}

export function WorkflowOnboardingGate({
  children,
}: WorkflowOnboardingGateProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { sendMessage } = useChatActions();
  const workspaceId = useWorkspaceStore((state) => state.workspaceId);
  const {
    onboardingCompleted,
    selectedWorkflowPackId,
    selectWorkflowPack,
    clearWorkflowPackSelection,
    completeOnboarding,
    dismissOnboarding,
  } = useSettingsStore((state) => ({
    onboardingCompleted: state.onboardingCompleted,
    selectedWorkflowPackId: state.selectedWorkflowPackId,
    selectWorkflowPack: state.selectWorkflowPack,
    clearWorkflowPackSelection: state.clearWorkflowPackSelection,
    completeOnboarding: state.completeOnboarding,
    dismissOnboarding: state.dismissOnboarding,
  }));

  const selectedPack = useMemo(
    () =>
      selectedWorkflowPackId
        ? (getWorkflowPackById(selectedWorkflowPackId) ?? null)
        : null,
    [selectedWorkflowPackId],
  );
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [touchedSubmit, setTouchedSubmit] = useState(false);
  const [packStartedAt, setPackStartedAt] = useState<number | null>(null);
  const onboardingStartTrackedRef = useRef(false);

  useEffect(() => {
    if (onboardingCompleted || onboardingStartTrackedRef.current) {
      return;
    }
    analytics.track("onboarding_started", {
      workspace_id: workspaceId ?? undefined,
      entry_point: pathname,
      is_new_user: true,
    });
    onboardingStartTrackedRef.current = true;
  }, [onboardingCompleted, pathname, workspaceId]);

  if (onboardingCompleted) {
    return <>{children}</>;
  }

  if (!selectedPack) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-6 md:px-8">
        <div className="w-full max-w-5xl rounded-2xl border border-border/70 bg-[hsl(var(--app-panel)/0.78)] p-6 shadow-[0_22px_52px_-34px_hsl(var(--foreground)/0.55)] backdrop-blur-sm md:p-8">
          <div className="mb-6 space-y-2">
            <Badge variant="secondary">MVP Workflow Packs</Badge>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Pick your primary workflow
            </h1>
            <p className="text-sm text-muted-foreground">
              Start with one focused pack. You can change this any time later.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {WORKFLOW_PACKS.map((pack) => {
              const Icon = PACK_ICON_BY_ID[pack.id];
              return (
                <button
                  key={pack.id}
                  type="button"
                  onClick={() => {
                    selectWorkflowPack(pack.id);
                    setInputValues(buildDefaultInputValues(pack));
                    setTouchedSubmit(false);
                    setPackStartedAt(Date.now());
                    analytics.track("workflow_pack_selected", {
                      workspace_id: workspaceId ?? undefined,
                      pack_id: pack.id,
                      pack_name: pack.title,
                    });
                  }}
                  className="group rounded-xl border border-border/70 bg-background/60 p-4 text-left transition hover:border-primary/70 hover:bg-background"
                >
                  <div className="mb-3 flex items-center gap-2">
                    <Icon className="h-4 w-4 text-primary" />
                    <h2 className="text-sm font-semibold text-foreground">
                      {pack.title}
                    </h2>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {pack.summary}
                  </p>
                  <p className="mt-3 text-[11px] font-medium text-foreground/90">
                    Weekly loop: {pack.weeklyLoop}
                  </p>
                </button>
              );
            })}
          </div>

          <div className="mt-6 flex items-center justify-end">
            <Button
              variant="ghost"
              onClick={() => {
                dismissOnboarding();
              }}
            >
              Skip for now
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const hasMissingRequiredField = selectedPack.inputFields.some(
    (field) => field.required && !inputValues[field.key]?.trim(),
  );

  const handleGenerate = () => {
    setTouchedSubmit(true);
    if (hasMissingRequiredField) {
      return;
    }

    const completionTimeSec = packStartedAt
      ? Math.max(1, Math.round((Date.now() - packStartedAt) / 1000))
      : undefined;

    analytics.track("guided_input_completed", {
      workspace_id: workspaceId ?? undefined,
      pack_id: selectedPack.id,
      field_count: selectedPack.inputFields.length,
      completion_time_sec: completionTimeSec,
    });

    const prompt = buildWorkflowPrompt(selectedPack, inputValues);
    completeOnboarding(selectedPack.id);

    if (!pathname.startsWith("/chat")) {
      router.push("/chat");
    }

    void sendMessage(prompt).then(() => {
      analytics.track("first_output_generated", {
        workspace_id: workspaceId ?? undefined,
        pack_id: selectedPack.id,
        template_id: selectedPack.safeTemplateId,
        model_id: "multi-model",
        latency_ms: 0,
      });
    });
  };

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-6 md:px-8">
      <div className="w-full max-w-4xl rounded-2xl border border-border/70 bg-[hsl(var(--app-panel)/0.78)] p-6 shadow-[0_22px_52px_-34px_hsl(var(--foreground)/0.55)] backdrop-blur-sm md:p-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <Badge variant="secondary">{selectedPack.title}</Badge>
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Add your starting inputs
            </h2>
            <p className="text-sm text-muted-foreground">
              We will generate your first output and set your default workflow.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setInputValues({});
              setTouchedSubmit(false);
              setPackStartedAt(null);
              clearWorkflowPackSelection();
            }}
            className="gap-1.5"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Change pack
          </Button>
        </div>

        <div className="grid gap-3">
          {selectedPack.inputFields.map((field) => {
            const value = inputValues[field.key] ?? "";
            const hasError = touchedSubmit && field.required && !value.trim();

            return (
              <label key={field.key} className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-foreground">
                    {field.label}
                  </span>
                  {field.required ? (
                    <span className="text-[10px] uppercase text-muted-foreground">
                      Required
                    </span>
                  ) : null}
                </div>
                {field.type === "textarea" ? (
                  <Textarea
                    value={value}
                    placeholder={field.placeholder}
                    rows={3}
                    className={hasError ? "border-destructive" : undefined}
                    onChange={(event) =>
                      setInputValues((prev) => ({
                        ...prev,
                        [field.key]: event.target.value,
                      }))
                    }
                  />
                ) : (
                  <Input
                    type={field.type === "number" ? "number" : "text"}
                    value={value}
                    placeholder={field.placeholder}
                    className={hasError ? "border-destructive" : undefined}
                    onChange={(event) =>
                      setInputValues((prev) => ({
                        ...prev,
                        [field.key]: event.target.value,
                      }))
                    }
                  />
                )}
              </label>
            );
          })}
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Weekly loop: {selectedPack.weeklyLoop}
          </p>
          <Button onClick={handleGenerate} className="gap-1.5">
            Generate First Output
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
