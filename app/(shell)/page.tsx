"use client";

import { ChatWorkspace } from "@/components/ChatWorkspace";
import { ChatErrorBoundary } from "@/components/ErrorBoundary";

export default function HomePage() {
  return (
    <ChatErrorBoundary>
      <ChatWorkspace />
    </ChatErrorBoundary>
  );
}
