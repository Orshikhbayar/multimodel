"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { useChatStore } from "@/lib/store";

function getParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default function ProjectOverviewPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = getParam(params?.projectId);
  const { projects } = useChatStore();
  const project = projects.find((entry) => entry.id === projectId);

  if (!project) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-background px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-3xl space-y-3">
          <h1 className="text-xl font-semibold tracking-tight">
            Project not found
          </h1>
          <p className="text-sm text-muted-foreground">
            This project does not exist in the current workspace.
          </p>
          <Link
            href="/projects"
            className="inline-flex items-center rounded-md border px-3 py-2 text-sm font-medium transition hover:bg-muted"
          >
            Back to projects
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-background px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Project
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {project.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          {project.description ?? "No description yet."}
        </p>
        {project.archivedAt ? (
          <p className="rounded-lg border border-dashed bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
            This project is archived. Conversations are read-only.
          </p>
        ) : null}
        <div className="pt-2">
          <Link
            href={`/projects/${project.id}/chat`}
            className="inline-flex items-center rounded-md border px-3 py-2 text-sm font-medium transition hover:bg-muted"
          >
            Open chats
          </Link>
        </div>
      </div>
    </div>
  );
}
