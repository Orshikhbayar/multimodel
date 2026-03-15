"use client";

import { ChatWorkspace } from "@/components/ChatWorkspace";
import { ChatErrorBoundary } from "@/components/ErrorBoundary";

export default function GeneralChatPage() {
  return (
    <ChatErrorBoundary>
      <ChatWorkspace />
    </ChatErrorBoundary>
  );
}
