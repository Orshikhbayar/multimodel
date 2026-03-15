/**
 * Normalized state types for improved performance
 *
 * Instead of nested arrays, we store entities in flat lookup tables.
 * This enables O(1) lookups and updates instead of O(n) array scans.
 *
 * Migration pattern:
 * - Old: conversations[].messages[].runs[]
 * - New: entities.conversations + entities.messages + entities.runs
 *        + conversationIds + messageIdsByConversation + runIdsByMessage
 */

import type { Role, RunStatus, Source, Disagreement } from "@/lib/types";

// ============ Normalized Entity Types ============

export interface NormalizedRun {
  id: string;
  model: string;
  slotId?: string;
  status: RunStatus;
  text: string;
  sources?: Source[];
  disagreements?: Disagreement[];
  // Parent reference
  messageId: string;
}

export interface NormalizedMessage {
  id: string;
  role: Role;
  content: string;
  createdAt: number;
  // Parent reference
  conversationId: string;
  // Child references (ordered)
  runIds: string[];
}

export interface NormalizedConversation {
  id: string;
  title: string;
  createdAt: number;
  projectId?: string;
  // Child references (ordered)
  messageIds: string[];
}

// ============ Entities State ============

export interface EntitiesState {
  conversations: Record<string, NormalizedConversation>;
  messages: Record<string, NormalizedMessage>;
  runs: Record<string, NormalizedRun>;
  // Ordered list of conversation IDs
  conversationIds: string[];
}

export const createEmptyEntities = (): EntitiesState => ({
  conversations: {},
  messages: {},
  runs: {},
  conversationIds: [],
});

// ============ Denormalization Helpers ============

import type { Conversation, Message, Run } from "@/lib/types";

/**
 * Denormalize a single run from entities
 */
export function denormalizeRun(
  entities: EntitiesState,
  runId: string,
): Run | undefined {
  const run = entities.runs[runId];
  if (!run) return undefined;

  return {
    id: run.id,
    model: run.model,
    slotId: run.slotId,
    status: run.status,
    text: run.text,
    sources: run.sources,
    disagreements: run.disagreements,
  };
}

/**
 * Denormalize a single message with its runs
 */
export function denormalizeMessage(
  entities: EntitiesState,
  messageId: string,
): Message | undefined {
  const message = entities.messages[messageId];
  if (!message) return undefined;

  const runs = message.runIds
    .map((runId) => denormalizeRun(entities, runId))
    .filter((r): r is Run => r !== undefined);

  return {
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
    runs: runs.length > 0 ? runs : undefined,
  };
}

/**
 * Denormalize a single conversation with all messages and runs
 */
export function denormalizeConversation(
  entities: EntitiesState,
  conversationId: string,
): Conversation | undefined {
  const conversation = entities.conversations[conversationId];
  if (!conversation) return undefined;

  const messages = conversation.messageIds
    .map((messageId) => denormalizeMessage(entities, messageId))
    .filter((m): m is Message => m !== undefined);

  return {
    id: conversation.id,
    title: conversation.title,
    createdAt: conversation.createdAt,
    projectId: conversation.projectId,
    messages,
  };
}

/**
 * Denormalize all conversations (for backward compatibility)
 */
export function denormalizeAllConversations(
  entities: EntitiesState,
): Conversation[] {
  return entities.conversationIds
    .map((id) => denormalizeConversation(entities, id))
    .filter((c): c is Conversation => c !== undefined);
}

// ============ Normalization Helpers ============

/**
 * Normalize a conversation into entities
 */
export function normalizeConversation(
  conversation: Conversation,
): Pick<EntitiesState, "conversations" | "messages" | "runs"> {
  const result: Pick<EntitiesState, "conversations" | "messages" | "runs"> = {
    conversations: {},
    messages: {},
    runs: {},
  };

  const messageIds: string[] = [];

  for (const message of conversation.messages) {
    const runIds: string[] = [];

    if (message.runs) {
      for (const run of message.runs) {
        result.runs[run.id] = {
          ...run,
          messageId: message.id,
        };
        runIds.push(run.id);
      }
    }

    result.messages[message.id] = {
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt,
      conversationId: conversation.id,
      runIds,
    };
    messageIds.push(message.id);
  }

  result.conversations[conversation.id] = {
    id: conversation.id,
    title: conversation.title,
    createdAt: conversation.createdAt,
    projectId: conversation.projectId,
    messageIds,
  };

  return result;
}

/**
 * Normalize an array of legacy conversations
 */
export function normalizeConversations(
  conversations: Conversation[],
): EntitiesState {
  const entities = createEmptyEntities();

  for (const conversation of conversations) {
    const normalized = normalizeConversation(conversation);
    Object.assign(entities.conversations, normalized.conversations);
    Object.assign(entities.messages, normalized.messages);
    Object.assign(entities.runs, normalized.runs);
    entities.conversationIds.push(conversation.id);
  }

  return entities;
}
