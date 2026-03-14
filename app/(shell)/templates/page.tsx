"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Heart,
  History,
  Loader2,
  Pencil,
  Plus,
  Save,
  Search,
  Send,
  Star,
  Trash2,
} from "lucide-react";

import { ContentColumn, PageHeader } from "@/components/layout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { analytics } from "@/lib/analytics";
import { useChatActions } from "@/lib/hooks/useChatActions";
import { useSettingsStore, useWorkspaceStore } from "@/lib/stores";
import { WORKFLOW_PACKS } from "@/lib/workflows/packs";

interface TemplateRecord {
  id: string;
  workspace_id: string;
  workflow_pack_id: string;
  title: string;
  description: string | null;
  body_md: string;
  workspace_use_count: number;
  last_used_at: string | null;
  updated_at: string;
  is_favorite: boolean;
}

interface TemplateVersionRecord {
  id: string;
  version_number: number;
  title: string;
  body_md: string;
  change_note: string | null;
  created_at: string;
}

interface TemplateEditorState {
  id?: string;
  workflowPackId: string;
  title: string;
  description: string;
  bodyMd: string;
}

const EMPTY_EDITOR: TemplateEditorState = {
  workflowPackId: "importer-solo-seller",
  title: "",
  description: "",
  bodyMd: "",
};

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? `Request failed with ${response.status}`);
  }
  return payload;
}

export default function TemplatesPage() {
  const router = useRouter();
  const { sendMessage } = useChatActions();
  const workspaceId = useWorkspaceStore((state) => state.workspaceId);
  const selectedWorkflowPackId = useSettingsStore(
    (state) => state.selectedWorkflowPackId,
  );
  const [query, setQuery] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [workflowPackFilter, setWorkflowPackFilter] = useState<string>("all");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorState, setEditorState] = useState<TemplateEditorState>({
    ...EMPTY_EDITOR,
    workflowPackId: selectedWorkflowPackId ?? EMPTY_EDITOR.workflowPackId,
  });
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versionLoading, setVersionLoading] = useState(false);
  const [versionTemplate, setVersionTemplate] = useState<TemplateRecord | null>(
    null,
  );
  const [versions, setVersions] = useState<TemplateVersionRecord[]>([]);

  const searchParams = useMemo(() => {
    if (!workspaceId) return "";
    const params = new URLSearchParams({ workspace_id: workspaceId });
    if (query.trim().length > 0) params.set("q", query.trim());
    if (favoritesOnly) params.set("favorites_only", "true");
    if (workflowPackFilter !== "all")
      params.set("workflow_pack_id", workflowPackFilter);
    return params.toString();
  }, [favoritesOnly, query, workflowPackFilter, workspaceId]);

  const loadTemplates = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchJson<{ templates: TemplateRecord[] }>(
        `/api/templates?${searchParams}`,
      );
      setTemplates(result.templates ?? []);
      if (query.trim().length > 0) {
        analytics.track("template_search_performed", {
          workspace_id: workspaceId,
          query_length: query.trim().length,
          result_count: result.templates?.length ?? 0,
          latency_ms: 0,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load templates");
    } finally {
      setLoading(false);
    }
  }, [query, searchParams, workspaceId]);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  const resetEditor = () => {
    setEditorState({
      ...EMPTY_EDITOR,
      workflowPackId: selectedWorkflowPackId ?? EMPTY_EDITOR.workflowPackId,
    });
  };

  const openCreateDialog = () => {
    resetEditor();
    setEditorOpen(true);
  };

  const openEditDialog = (template: TemplateRecord) => {
    setEditorState({
      id: template.id,
      workflowPackId: template.workflow_pack_id,
      title: template.title,
      description: template.description ?? "",
      bodyMd: template.body_md,
    });
    setEditorOpen(true);
  };

  const saveTemplate = async () => {
    if (!workspaceId) return;
    const title = editorState.title.trim();
    const bodyMd = editorState.bodyMd.trim();
    if (!title || !bodyMd) {
      setError("Title and template body are required.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (editorState.id) {
        await fetchJson(`/api/templates/${editorState.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workflowPackId: editorState.workflowPackId,
            title,
            description: editorState.description.trim() || null,
            bodyMd,
            changeNote: "Updated via Template Library",
          }),
        });
        analytics.track("template_updated", {
          workspace_id: workspaceId,
          template_id: editorState.id,
          version_number: -1,
        });
      } else {
        const payload = await fetchJson<{ template: TemplateRecord }>(
          `/api/templates`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              workspaceId,
              workflowPackId: editorState.workflowPackId,
              title,
              description: editorState.description.trim() || null,
              bodyMd,
              inputSchema: [],
              isSystem: false,
              changeNote: "Created via Template Library",
            }),
          },
        );
        analytics.track("template_created", {
          workspace_id: workspaceId,
          template_id: payload.template.id,
          pack_id: payload.template.workflow_pack_id,
          is_system: false,
        });
        analytics.track("asset_saved", {
          workspace_id: workspaceId,
          asset_type: "template",
          template_id: payload.template.id,
          is_first_asset: false,
        });
      }

      setEditorOpen(false);
      resetEditor();
      await loadTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save template");
    } finally {
      setSaving(false);
    }
  };

  const removeTemplate = async (template: TemplateRecord) => {
    if (!window.confirm(`Delete template "${template.title}"?`)) return;
    try {
      await fetchJson(`/api/templates/${template.id}`, { method: "DELETE" });
      await loadTemplates();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete template",
      );
    }
  };

  const toggleFavorite = async (template: TemplateRecord) => {
    if (!workspaceId) return;
    try {
      if (template.is_favorite) {
        await fetchJson(`/api/templates/${template.id}/favorite`, {
          method: "DELETE",
        });
        analytics.track("template_unfavorited", {
          workspace_id: workspaceId,
          template_id: template.id,
        });
      } else {
        await fetchJson(`/api/templates/${template.id}/favorite`, {
          method: "PUT",
        });
        analytics.track("template_favorited", {
          workspace_id: workspaceId,
          template_id: template.id,
        });
      }
      await loadTemplates();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update favorite",
      );
    }
  };

  const applyTemplate = async (template: TemplateRecord) => {
    if (!workspaceId) return;
    try {
      await fetchJson(`/api/templates/${template.id}/use`, { method: "POST" });
      analytics.track("template_applied", {
        workspace_id: workspaceId,
        template_id: template.id,
        pack_id: template.workflow_pack_id,
      });
      router.push("/chat");
      await sendMessage(template.body_md);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply template");
    }
  };

  const viewVersions = async (template: TemplateRecord) => {
    setVersionTemplate(template);
    setVersionsOpen(true);
    setVersionLoading(true);
    setVersions([]);
    try {
      const payload = await fetchJson<{ versions: TemplateVersionRecord[] }>(
        `/api/templates/${template.id}/versions`,
      );
      setVersions(payload.versions ?? []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load version history",
      );
    } finally {
      setVersionLoading(false);
    }
  };

  const restoreVersion = async (version: TemplateVersionRecord) => {
    if (!versionTemplate || !workspaceId) return;
    if (!window.confirm(`Restore version ${version.version_number}?`)) return;
    try {
      await fetchJson(`/api/templates/${versionTemplate.id}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: version.id }),
      });
      analytics.track("template_version_restored", {
        workspace_id: workspaceId,
        template_id: versionTemplate.id,
        restored_from_version: version.version_number,
        new_version: -1,
      });
      setVersionsOpen(false);
      await loadTemplates();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to restore template version",
      );
    }
  };

  const seedSystemTemplates = async () => {
    if (!workspaceId) return;
    try {
      await fetchJson(`/api/templates/seed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      await loadTemplates();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to seed system templates",
      );
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-background py-6">
      <ContentColumn className="space-y-6">
        <PageHeader
          label="Templates"
          title="Template Library"
          actions={
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={seedSystemTemplates}>
                Seed System Templates
              </Button>
              <Button onClick={openCreateDialog} className="gap-2">
                <Plus className="h-4 w-4" />
                New Template
              </Button>
            </div>
          }
        />

        <Card>
          <CardContent className="pt-6">
            <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search title, description, or content..."
                  className="pl-9"
                />
              </div>
              <select
                value={workflowPackFilter}
                onChange={(event) => setWorkflowPackFilter(event.target.value)}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="all">All workflow packs</option>
                {WORKFLOW_PACKS.map((pack) => (
                  <option key={pack.id} value={pack.id}>
                    {pack.title}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant={favoritesOnly ? "default" : "outline"}
                onClick={() => setFavoritesOnly((current) => !current)}
                className="gap-2"
              >
                <Heart className="h-4 w-4" />
                Favorites
              </Button>
            </div>
          </CardContent>
        </Card>

        {error ? (
          <Card className="border-destructive/50">
            <CardContent className="pt-6 text-sm text-destructive">
              {error}
            </CardContent>
          </Card>
        ) : null}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading templates...
          </div>
        ) : null}

        {!loading && templates.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              No templates yet. Create one or seed system templates to get
              started.
            </CardContent>
          </Card>
        ) : null}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {templates.map((template) => (
            <Card key={template.id} className="h-full">
              <CardHeader className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{template.title}</CardTitle>
                  <button
                    type="button"
                    onClick={() => toggleFavorite(template)}
                    className="rounded-md p-1 text-muted-foreground transition hover:text-foreground"
                    title={
                      template.is_favorite ? "Remove favorite" : "Add favorite"
                    }
                  >
                    {template.is_favorite ? (
                      <Star className="h-4 w-4 fill-current text-amber-500" />
                    ) : (
                      <Star className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <CardDescription>
                  {template.description || "No description provided."}
                </CardDescription>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge variant="secondary">{template.workflow_pack_id}</Badge>
                  <Badge variant="outline">
                    Uses: {template.workspace_use_count ?? 0}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="line-clamp-4 text-sm text-muted-foreground">
                  {template.body_md}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => applyTemplate(template)}
                    className="gap-1.5"
                  >
                    <Send className="h-3.5 w-3.5" />
                    Apply
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openEditDialog(template)}
                    className="gap-1.5"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => viewVersions(template)}
                    className="gap-1.5"
                  >
                    <History className="h-3.5 w-3.5" />
                    Versions
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => removeTemplate(template)}
                    className="gap-1.5 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </ContentColumn>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editorState.id ? "Edit template" : "Create template"}
            </DialogTitle>
            <DialogDescription>
              Templates are reusable assets for your selected workflow packs.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <select
              value={editorState.workflowPackId}
              onChange={(event) =>
                setEditorState((current) => ({
                  ...current,
                  workflowPackId: event.target.value,
                }))
              }
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {WORKFLOW_PACKS.map((pack) => (
                <option key={pack.id} value={pack.id}>
                  {pack.title}
                </option>
              ))}
            </select>
            <Input
              value={editorState.title}
              onChange={(event) =>
                setEditorState((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
              placeholder="Template title"
            />
            <Input
              value={editorState.description}
              onChange={(event) =>
                setEditorState((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              placeholder="Description (optional)"
            />
            <Textarea
              value={editorState.bodyMd}
              onChange={(event) =>
                setEditorState((current) => ({
                  ...current,
                  bodyMd: event.target.value,
                }))
              }
              rows={12}
              placeholder="Template prompt body..."
            />
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setEditorOpen(false);
                  resetEditor();
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={saveTemplate}
                disabled={saving}
                className="gap-2"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={versionsOpen} onOpenChange={setVersionsOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              Version history
              {versionTemplate ? `: ${versionTemplate.title}` : ""}
            </DialogTitle>
            <DialogDescription>
              Restore a previous version to create a new head revision.
            </DialogDescription>
          </DialogHeader>
          {versionLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading version history...
            </div>
          ) : null}
          {!versionLoading && versions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No versions found.</p>
          ) : null}
          <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
            {versions.map((version) => (
              <Card key={version.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-sm">
                      Version {version.version_number}
                    </CardTitle>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => restoreVersion(version)}
                    >
                      Restore
                    </Button>
                  </div>
                  <CardDescription>
                    {version.change_note || "No change note"} ·{" "}
                    {new Date(version.created_at).toLocaleString()}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="line-clamp-4 whitespace-pre-wrap text-sm text-muted-foreground">
                    {version.body_md}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
