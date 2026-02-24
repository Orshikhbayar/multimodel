"use client";

import { useParams } from "next/navigation";

import { ChatWorkspace } from "@/components/ChatWorkspace";
import { ChatErrorBoundary } from "@/components/ErrorBoundary";
import { useChatStore } from "@/lib/store";

function getParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default function ProjectChatPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = getParam(params?.projectId);
  const { projects } = useChatStore();
  const project = projects.find((entry) => entry.id === projectId);

  if (!project) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <div className="rounded-xl border bg-card px-5 py-4 text-sm text-muted-foreground">
          Project not found.
        </div>
      </div>
    );
  }

  return (
    <ChatErrorBoundary>
      <ChatWorkspace
        projectId={project.id}
        projectName={project.name}
        projectArchived={Boolean(project.archivedAt)}
      />
    </ChatErrorBoundary>
  );
}
