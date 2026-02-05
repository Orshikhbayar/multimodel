"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import type { Conversation, Message, Run } from "@/lib/types";

// Helper to convert arrays to Prisma JSON format
function toJsonArray<T>(arr: T[] | undefined | null): Prisma.InputJsonValue | undefined {
  if (!arr || arr.length === 0) return undefined;
  return arr as unknown as Prisma.InputJsonValue;
}

// ============================================
// Type Conversions (DB -> App Types)
// ============================================

function dbMessageToAppMessage(dbMessage: {
  id: string;
  role: string;
  content: string;
  createdAt: Date;
  editedAt: Date | null;
  attachments: unknown;
  toolCalls: unknown;
  runs: Array<{
    id: string;
    model: string;
    slotId: string | null;
    status: string;
    text: string;
    interrupted: boolean;
    sources: unknown;
    disagreements: unknown;
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
    latencyMs: number | null;
    errorMessage: string | null;
    errorCode: string | null;
  }>;
}): Message {
  return {
    id: dbMessage.id,
    role: dbMessage.role as "user" | "assistant",
    content: dbMessage.content,
    createdAt: dbMessage.createdAt.getTime(),
    editedAt: dbMessage.editedAt?.getTime(),
    attachments: dbMessage.attachments as Message["attachments"],
    toolCalls: dbMessage.toolCalls as Message["toolCalls"],
    runs: dbMessage.runs.map((run) => ({
      id: run.id,
      model: run.model,
      slotId: run.slotId ?? undefined,
      status: run.status as Run["status"],
      text: run.text,
      interrupted: run.interrupted,
      sources: run.sources as Run["sources"],
      disagreements: run.disagreements as Run["disagreements"],
      tokens:
        run.promptTokens !== null
          ? {
              prompt: run.promptTokens,
              completion: run.completionTokens ?? 0,
              total: run.totalTokens ?? 0,
            }
          : undefined,
      latencyMs: run.latencyMs ?? undefined,
      error: run.errorMessage
        ? { message: run.errorMessage, code: run.errorCode ?? undefined }
        : undefined,
    })),
  };
}

function dbConversationToAppConversation(dbConv: {
  id: string;
  title: string;
  createdAt: Date;
  projectId: string | null;
  messages: Parameters<typeof dbMessageToAppMessage>[0][];
}): Conversation {
  return {
    id: dbConv.id,
    title: dbConv.title,
    createdAt: dbConv.createdAt.getTime(),
    projectId: dbConv.projectId ?? undefined,
    messages: dbConv.messages.map(dbMessageToAppMessage),
  };
}

// ============================================
// Conversation Actions
// ============================================

export async function getConversations(): Promise<Conversation[]> {
  const session = await auth();
  if (!session?.user?.id) {
    return [];
  }

  const conversations = await prisma.conversation.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        include: {
          runs: true,
        },
      },
    },
  });

  return conversations.map(dbConversationToAppConversation);
}

export async function getConversation(
  conversationId: string,
): Promise<Conversation | null> {
  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }

  const conversation = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      userId: session.user.id,
    },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        include: {
          runs: true,
        },
      },
    },
  });

  if (!conversation) {
    return null;
  }

  return dbConversationToAppConversation(conversation);
}

export async function createConversation(
  title: string = "New chat",
  projectId?: string,
): Promise<string | null> {
  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }

  const conversation = await prisma.conversation.create({
    data: {
      userId: session.user.id,
      title,
      projectId: projectId ?? null,
    },
  });

  revalidatePath("/");
  return conversation.id;
}

export async function updateConversationTitle(
  conversationId: string,
  title: string,
): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.id) {
    return false;
  }

  const result = await prisma.conversation.updateMany({
    where: {
      id: conversationId,
      userId: session.user.id,
    },
    data: { title },
  });

  revalidatePath("/");
  return result.count > 0;
}

export async function deleteConversation(
  conversationId: string,
): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.id) {
    return false;
  }

  const result = await prisma.conversation.deleteMany({
    where: {
      id: conversationId,
      userId: session.user.id,
    },
  });

  revalidatePath("/");
  return result.count > 0;
}

// ============================================
// Message Actions
// ============================================

export async function addMessage(
  conversationId: string,
  message: Omit<Message, "id" | "createdAt">,
): Promise<string | null> {
  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }

  // Verify conversation belongs to user
  const conversation = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      userId: session.user.id,
    },
  });

  if (!conversation) {
    return null;
  }

  const dbMessage = await prisma.message.create({
    data: {
      conversationId,
      role: message.role,
      content: message.content,
      attachments: toJsonArray(message.attachments),
      toolCalls: toJsonArray(message.toolCalls),
    },
  });

  // Update conversation's updatedAt
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });

  return dbMessage.id;
}

export async function updateMessageContent(
  conversationId: string,
  messageId: string,
  content: string,
): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.id) {
    return false;
  }

  // Verify ownership through conversation
  const conversation = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      userId: session.user.id,
    },
  });

  if (!conversation) {
    return false;
  }

  const result = await prisma.message.updateMany({
    where: {
      id: messageId,
      conversationId,
    },
    data: {
      content,
      editedAt: new Date(),
    },
  });

  return result.count > 0;
}

// ============================================
// Run Actions
// ============================================

export async function createRun(
  conversationId: string,
  messageId: string,
  run: Omit<Run, "id">,
): Promise<string | null> {
  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }

  // Verify ownership
  const conversation = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      userId: session.user.id,
    },
  });

  if (!conversation) {
    return null;
  }

  const dbRun = await prisma.run.create({
    data: {
      messageId,
      model: run.model,
      slotId: run.slotId ?? null,
      status: run.status,
      text: run.text,
      interrupted: run.interrupted ?? false,
      sources: toJsonArray(run.sources),
      disagreements: toJsonArray(run.disagreements),
      promptTokens: run.tokens?.prompt ?? null,
      completionTokens: run.tokens?.completion ?? null,
      totalTokens: run.tokens?.total ?? null,
      latencyMs: run.latencyMs ?? null,
      errorMessage: run.error?.message ?? null,
      errorCode: run.error?.code ?? null,
    },
  });

  return dbRun.id;
}

export async function updateRun(
  runId: string,
  data: Partial<{
    status: Run["status"];
    text: string;
    interrupted: boolean;
    sources: Run["sources"];
    disagreements: Run["disagreements"];
    tokens: Run["tokens"];
    latencyMs: number;
    error: Run["error"];
  }>,
): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.id) {
    return false;
  }

  // Verify ownership through the chain
  const run = await prisma.run.findFirst({
    where: { id: runId },
    include: {
      message: {
        include: {
          conversation: true,
        },
      },
    },
  });

  if (!run || run.message.conversation.userId !== session.user.id) {
    return false;
  }

  await prisma.run.update({
    where: { id: runId },
    data: {
      status: data.status,
      text: data.text,
      interrupted: data.interrupted,
      sources: toJsonArray(data.sources),
      disagreements: toJsonArray(data.disagreements),
      promptTokens: data.tokens?.prompt,
      completionTokens: data.tokens?.completion,
      totalTokens: data.tokens?.total,
      latencyMs: data.latencyMs,
      errorMessage: data.error?.message,
      errorCode: data.error?.code,
    },
  });

  return true;
}

export async function appendRunText(
  runId: string,
  chunk: string,
): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.id) {
    return false;
  }

  // Verify ownership
  const run = await prisma.run.findFirst({
    where: { id: runId },
    include: {
      message: {
        include: {
          conversation: true,
        },
      },
    },
  });

  if (!run || run.message.conversation.userId !== session.user.id) {
    return false;
  }

  await prisma.run.update({
    where: { id: runId },
    data: {
      text: run.text + chunk,
      status: "streaming",
    },
  });

  return true;
}

export async function completeRun(
  runId: string,
  finalData?: Partial<{
    text: string;
    sources: Run["sources"];
    disagreements: Run["disagreements"];
    tokens: Run["tokens"];
    latencyMs: number;
  }>,
): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.id) {
    return false;
  }

  // Verify ownership
  const run = await prisma.run.findFirst({
    where: { id: runId },
    include: {
      message: {
        include: {
          conversation: true,
        },
      },
    },
  });

  if (!run || run.message.conversation.userId !== session.user.id) {
    return false;
  }

  await prisma.run.update({
    where: { id: runId },
    data: {
      status: "done",
      text: finalData?.text ?? run.text,
      sources: toJsonArray(finalData?.sources),
      disagreements: toJsonArray(finalData?.disagreements),
      promptTokens: finalData?.tokens?.prompt,
      completionTokens: finalData?.tokens?.completion,
      totalTokens: finalData?.tokens?.total,
      latencyMs: finalData?.latencyMs,
    },
  });

  // Create usage record
  if (finalData?.tokens) {
    await prisma.usageRecord.create({
      data: {
        userId: session.user.id,
        runId,
        model: run.model,
        promptTokens: finalData.tokens.prompt,
        completionTokens: finalData.tokens.completion,
        totalTokens: finalData.tokens.total,
        // Estimate cost (can be refined per model later)
        estimatedCostUsd:
          finalData.tokens.prompt * 0.00003 +
          finalData.tokens.completion * 0.00006,
      },
    });
  }

  return true;
}

export async function markRunError(
  runId: string,
  error: { message: string; code?: string },
): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.id) {
    return false;
  }

  // Verify ownership
  const run = await prisma.run.findFirst({
    where: { id: runId },
    include: {
      message: {
        include: {
          conversation: true,
        },
      },
    },
  });

  if (!run || run.message.conversation.userId !== session.user.id) {
    return false;
  }

  await prisma.run.update({
    where: { id: runId },
    data: {
      status: "error",
      errorMessage: error.message,
      errorCode: error.code ?? null,
    },
  });

  return true;
}
