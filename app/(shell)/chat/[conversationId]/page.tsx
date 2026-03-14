"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { ChatWorkspace } from "@/components/ChatWorkspace";
import { ChatErrorBoundary } from "@/components/ErrorBoundary";
import { useChatStore } from "@/lib/store";

function getParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default function GeneralConversationPage() {
  const params = useParams<{ conversationId: string }>();
  const conversationId = getParam(params?.conversationId);
  const { conversations } = useChatStore();
  const conversation = conversations.find((entry) => entry.id === conversationId);

  if (!conversation) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <div className="space-y-3 rounded-xl border bg-card px-5 py-4 text-sm text-muted-foreground">
          <p>Conversation not found.</p>
          <Link
            href="/chat"
            className="inline-flex items-center rounded-md border px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
          >
            Back to general chat
          </Link>
        </div>
      </div>
    );
  }

  if (conversation.projectId) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <div className="space-y-3 rounded-xl border bg-card px-5 py-4 text-sm text-muted-foreground">
          <p>This conversation belongs to a project.</p>
          <Link
            href={`/projects/${conversation.projectId}/chat/${conversation.id}`}
            className="inline-flex items-center rounded-md border px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
          >
            Open in project chat
          </Link>
        </div>
      </div>
    );
  }

  return (
    <ChatErrorBoundary>
      <ChatWorkspace conversationId={conversationId} />
    </ChatErrorBoundary>
  );
}
