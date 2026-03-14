"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Wrench } from "lucide-react";

import { ToolList } from "@/components/tools/ToolList";
import { ToolRunForm } from "@/components/tools/ToolRunForm";
import { ToolRunsList } from "@/components/tools/ToolRunsList";
import { ToolRunDetails } from "@/components/tools/ToolRunDetails";
import { ArtifactsList } from "@/components/tools/ArtifactsList";
import type {
  AppendToolResultResponse,
  ArtifactListItem,
  ToolRegistryEntry,
  ToolRunDetail,
  ToolRunSummary,
} from "@/components/tools/types";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useConversationStore } from "@/lib/stores";
import type { Message, ToolCall } from "@/lib/types";

interface ToolDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId?: string | null;
  conversationId?: string;
  currentMessageId?: string;
}

interface ToolsRegistryResponse {
  tools?: ToolRegistryEntry[];
}

interface ToolRunsResponse {
  runs?: ToolRunSummary[];
}

interface ToolRunDetailResponse {
  run?: ToolRunDetail;
}

interface ArtifactsResponse {
  artifacts?: ArtifactListItem[];
}

function projectScopeQueryValue(projectId?: string | null): string {
  return projectId ?? "null";
}

function normalizeApiMessage(value: unknown): Message | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const row = value as Record<string, unknown>;

  if (
    typeof row.id !== "string" ||
    (row.role !== "user" &&
      row.role !== "assistant" &&
      row.role !== "system") ||
    typeof row.content !== "string" ||
    typeof row.createdAt !== "number"
  ) {
    return null;
  }

  return {
    id: row.id,
    role: row.role,
    content: row.content,
    createdAt: row.createdAt,
    attachments: Array.isArray(row.attachments)
      ? (row.attachments as Message["attachments"])
      : undefined,
    toolCalls: Array.isArray(row.toolCalls)
      ? (row.toolCalls as ToolCall[])
      : undefined,
  };
}

export function ToolDrawer({
  open,
  onOpenChange,
  projectId,
  conversationId,
  currentMessageId,
}: ToolDrawerProps) {
  const addMessages = useConversationStore((state) => state.addMessages);

  const [activeTab, setActiveTab] = useState<"tools" | "runs" | "artifacts">(
    "tools",
  );

  const [registryLoading, setRegistryLoading] = useState(false);
  const [registryError, setRegistryError] = useState<string | null>(null);
  const [tools, setTools] = useState<ToolRegistryEntry[]>([]);
  const [search, setSearch] = useState("");
  const [selectedToolName, setSelectedToolName] = useState<string | undefined>(
    undefined,
  );

  const [runsLoading, setRunsLoading] = useState(false);
  const [runsError, setRunsError] = useState<string | null>(null);
  const [runs, setRuns] = useState<ToolRunSummary[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | undefined>(
    undefined,
  );

  const [runDetailLoading, setRunDetailLoading] = useState(false);
  const [runDetailError, setRunDetailError] = useState<string | null>(null);
  const [runDetail, setRunDetail] = useState<ToolRunDetail | null>(null);

  const [artifactsLoading, setArtifactsLoading] = useState(false);
  const [artifactsError, setArtifactsError] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<ArtifactListItem[]>([]);

  const [attachError, setAttachError] = useState<string | null>(null);
  const [attachingRunId, setAttachingRunId] = useState<string | null>(null);
  const [attachingArtifactId, setAttachingArtifactId] = useState<string | null>(
    null,
  );

  const [seed, setSeed] = useState<{
    toolName: string;
    input: unknown;
    toolVersion?: string;
    nonce: number;
  } | null>(null);

  const scopeValue = projectScopeQueryValue(projectId);

  const filteredTools = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return tools;

    return tools.filter((tool) => {
      return (
        tool.tool_name.toLowerCase().includes(query) ||
        tool.description.toLowerCase().includes(query)
      );
    });
  }, [search, tools]);

  const selectedTool = useMemo(() => {
    if (selectedToolName) {
      return tools.find((tool) => tool.tool_name === selectedToolName);
    }
    return tools[0];
  }, [selectedToolName, tools]);

  useEffect(() => {
    if (!selectedTool && tools.length > 0) {
      setSelectedToolName(tools[0]?.tool_name);
    }
  }, [selectedTool, tools]);

  const loadRegistry = useCallback(async () => {
    setRegistryLoading(true);
    setRegistryError(null);

    try {
      const response = await fetch("/api/tools/registry", {
        method: "GET",
      });
      const data = (await response.json()) as ToolsRegistryResponse & {
        error?: string;
      };

      if (!response.ok) {
        setRegistryError(data.error ?? "Failed to load tools registry");
        return;
      }

      const nextTools = Array.isArray(data.tools) ? data.tools : [];
      setTools(nextTools);

      setSelectedToolName((current) => {
        if (current || nextTools.length === 0) return current;
        return nextTools[0]?.tool_name;
      });
    } catch (error) {
      setRegistryError(error instanceof Error ? error.message : String(error));
    } finally {
      setRegistryLoading(false);
    }
  }, []);

  const loadRuns = useCallback(async () => {
    setRunsLoading(true);
    setRunsError(null);

    try {
      const params = new URLSearchParams({
        project_id: scopeValue,
        limit: "50",
      });
      const response = await fetch(`/api/tools/runs?${params.toString()}`);
      const data = (await response.json()) as ToolRunsResponse & {
        error?: string;
      };

      if (!response.ok) {
        setRunsError(data.error ?? "Failed to load tool runs");
        return;
      }

      setRuns(Array.isArray(data.runs) ? data.runs : []);
    } catch (error) {
      setRunsError(error instanceof Error ? error.message : String(error));
    } finally {
      setRunsLoading(false);
    }
  }, [scopeValue]);

  const loadRunDetail = useCallback(
    async (runId: string) => {
      setRunDetailLoading(true);
      setRunDetailError(null);

      try {
        const params = new URLSearchParams({
          project_id: scopeValue,
          run_id: runId,
          include_payloads: "true",
        });
        const response = await fetch(`/api/tools/runs?${params.toString()}`);
        const data = (await response.json()) as ToolRunDetailResponse & {
          error?: string;
        };

        if (!response.ok) {
          setRunDetailError(data.error ?? "Failed to load run details");
          setRunDetail(null);
          return;
        }

        setRunDetail(data.run ?? null);
      } catch (error) {
        setRunDetailError(
          error instanceof Error ? error.message : String(error),
        );
        setRunDetail(null);
      } finally {
        setRunDetailLoading(false);
      }
    },
    [scopeValue],
  );

  const loadArtifacts = useCallback(async () => {
    setArtifactsLoading(true);
    setArtifactsError(null);

    try {
      const params = new URLSearchParams({
        project_id: scopeValue,
        limit: "50",
      });

      const response = await fetch(`/api/artifacts?${params.toString()}`);
      const data = (await response.json()) as ArtifactsResponse & {
        error?: string;
      };

      if (!response.ok) {
        setArtifactsError(data.error ?? "Failed to load artifacts");
        return;
      }

      setArtifacts(Array.isArray(data.artifacts) ? data.artifacts : []);
    } catch (error) {
      setArtifactsError(error instanceof Error ? error.message : String(error));
    } finally {
      setArtifactsLoading(false);
    }
  }, [scopeValue]);

  useEffect(() => {
    if (!open) return;

    void (async () => {
      await Promise.all([
        tools.length === 0 ? loadRegistry() : Promise.resolve(),
        loadRuns(),
        loadArtifacts(),
      ]);
    })();
  }, [loadArtifacts, loadRegistry, loadRuns, open, tools.length]);

  useEffect(() => {
    if (!open) return;

    const interval = window.setInterval(() => {
      void loadRuns();
    }, 10_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [loadRuns, open]);

  useEffect(() => {
    if (!open || !selectedRunId) return;
    void loadRunDetail(selectedRunId);
  }, [loadRunDetail, open, selectedRunId]);

  const attachToChat = useCallback(
    async (
      payload: { run_id?: string; artifact_id?: string },
      setLoading: (value: boolean) => void,
    ) => {
      if (!conversationId) {
        setAttachError("Open a conversation before attaching tool outputs.");
        return;
      }

      setAttachError(null);
      setLoading(true);

      try {
        const response = await fetch("/api/chat/append-tool-result", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversation_id: conversationId,
            message_id: currentMessageId ?? null,
            ...payload,
          }),
        });

        const data = (await response.json()) as AppendToolResultResponse & {
          error?: string;
        };

        if (!response.ok) {
          setAttachError(data.error ?? "Failed to attach to chat");
          return;
        }

        const normalized = normalizeApiMessage(data.message);
        if (!normalized) {
          setAttachError(
            "Attach succeeded but returned message payload was invalid.",
          );
          return;
        }

        addMessages(conversationId, [normalized]);

        await Promise.all([loadRuns(), loadArtifacts()]);
      } catch (error) {
        setAttachError(error instanceof Error ? error.message : String(error));
      } finally {
        setLoading(false);
      }
    },
    [addMessages, conversationId, currentMessageId, loadArtifacts, loadRuns],
  );

  const formSeed =
    seed && selectedTool && seed.toolName === selectedTool.tool_name
      ? seed
      : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="h-full p-0 sm:max-w-xl">
        <div className="flex h-full flex-col">
          <div className="border-b px-4 pb-3 pt-4">
            <SheetHeader className="items-start gap-1">
              <SheetTitle className="flex items-center gap-2 text-base">
                <Wrench className="h-4 w-4" />
                Tools
              </SheetTitle>
              <p className="text-xs text-muted-foreground">
                Scope:{" "}
                {projectId ? `project ${projectId}` : "workspace general"}
              </p>
            </SheetHeader>
          </div>

          <div className="flex-1 overflow-hidden px-4 py-3">
            <Tabs
              value={activeTab}
              onValueChange={(value) => setActiveTab(value as typeof activeTab)}
            >
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="tools">Tools</TabsTrigger>
                <TabsTrigger value="runs">Recent Runs</TabsTrigger>
                <TabsTrigger value="artifacts">Artifacts</TabsTrigger>
              </TabsList>

              <TabsContent value="tools" className="mt-3 h-[calc(100vh-185px)]">
                <ScrollArea className="h-full pr-2">
                  {registryError ? (
                    <div className="mb-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                      {registryError}
                    </div>
                  ) : null}

                  <ToolList
                    tools={filteredTools}
                    search={search}
                    onSearchChange={setSearch}
                    selectedToolName={selectedTool?.tool_name}
                    onSelectTool={(tool) => {
                      setSelectedToolName(tool.tool_name);
                      setSeed(null);
                    }}
                  />

                  {selectedTool ? (
                    <div className="mt-4 space-y-2 rounded-xl border border-border/70 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold">
                            Run {selectedTool.tool_name}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            v{selectedTool.tool_version}
                          </p>
                        </div>
                        {registryLoading ? (
                          <Badge variant="outline">Loading…</Badge>
                        ) : null}
                      </div>

                      <ToolRunForm
                        key={`${selectedTool.tool_name}:${selectedTool.tool_version}:${formSeed?.nonce ?? 0}`}
                        tool={selectedTool}
                        projectId={projectId ?? null}
                        conversationId={conversationId}
                        messageId={currentMessageId}
                        seedInput={formSeed?.input}
                        seedToolVersion={formSeed?.toolVersion}
                        attachDisabled={!conversationId}
                        attaching={attachingRunId !== null}
                        onRunCompleted={(result) => {
                          setActiveTab("runs");
                          setSelectedRunId(result.run_id);
                          void Promise.all([loadRuns(), loadArtifacts()]);
                        }}
                        onAttachRun={(runId) => {
                          setAttachingRunId(runId);
                          void attachToChat({ run_id: runId }, (value) => {
                            setAttachingRunId(value ? runId : null);
                          });
                        }}
                        onRefreshRuns={() => {
                          void Promise.all([loadRuns(), loadArtifacts()]);
                        }}
                      />
                    </div>
                  ) : null}
                </ScrollArea>
              </TabsContent>

              <TabsContent value="runs" className="mt-3 h-[calc(100vh-185px)]">
                <ScrollArea className="h-full pr-2">
                  {runsError ? (
                    <div className="mb-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                      {runsError}
                    </div>
                  ) : null}

                  <ToolRunsList
                    runs={runs}
                    loading={runsLoading}
                    selectedRunId={selectedRunId}
                    onSelectRun={setSelectedRunId}
                    onRefresh={() => {
                      void loadRuns();
                    }}
                  />

                  <div className="mt-3">
                    {runDetailError ? (
                      <div className="mb-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                        {runDetailError}
                      </div>
                    ) : null}

                    {runDetailLoading && selectedRunId ? (
                      <div className="rounded-lg border border-border/70 px-3 py-2 text-xs text-muted-foreground">
                        Loading run details...
                      </div>
                    ) : null}

                    <ToolRunDetails
                      run={runDetail}
                      artifacts={artifacts}
                      attaching={attachingRunId !== null}
                      attachDisabled={!conversationId}
                      onAttach={(runId) => {
                        setAttachingRunId(runId);
                        void attachToChat({ run_id: runId }, (value) => {
                          setAttachingRunId(value ? runId : null);
                        });
                      }}
                      onRerun={(run) => {
                        const matchingTool = tools.find(
                          (tool) =>
                            tool.tool_name === run.tool_name &&
                            tool.tool_version === run.tool_version,
                        );

                        if (!matchingTool) {
                          const sameName = tools.find(
                            (tool) => tool.tool_name === run.tool_name,
                          );
                          if (sameName) {
                            setSelectedToolName(sameName.tool_name);
                            setSeed({
                              toolName: sameName.tool_name,
                              input: run.input_payload_redacted,
                              toolVersion: run.tool_version,
                              nonce: Date.now(),
                            });
                            setActiveTab("tools");
                          }
                          return;
                        }

                        setSelectedToolName(matchingTool.tool_name);
                        setSeed({
                          toolName: matchingTool.tool_name,
                          input: run.input_payload_redacted,
                          toolVersion: run.tool_version,
                          nonce: Date.now(),
                        });
                        setActiveTab("tools");
                      }}
                    />
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent
                value="artifacts"
                className="mt-3 h-[calc(100vh-185px)]"
              >
                <ScrollArea className="h-full pr-2">
                  {artifactsError ? (
                    <div className="mb-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                      {artifactsError}
                    </div>
                  ) : null}

                  <ArtifactsList
                    artifacts={artifacts}
                    loading={artifactsLoading}
                    attachingArtifactId={attachingArtifactId}
                    onRefresh={() => {
                      void loadArtifacts();
                    }}
                    onAttach={(artifactId) => {
                      setAttachingArtifactId(artifactId);
                      void attachToChat(
                        { artifact_id: artifactId },
                        (value) => {
                          setAttachingArtifactId(value ? artifactId : null);
                        },
                      );
                    }}
                  />
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </div>

          {attachError ? (
            <div className="border-t border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive">
              {attachError}
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
