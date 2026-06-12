/**
 * Shared user-intent triggers for client-side content transforms.
 *
 * Single source of truth — these were previously duplicated in
 * interactiveBlocks.ts and useChatActions.ts, where the copies could
 * silently drift apart.
 *
 * Gotcha (see CLAUDE.md): `\b(visualiz)\b` does NOT match "visualization" —
 * keep the `\w*` expansion when editing.
 *
 * Safe to share as module-level instances: neither regex uses the /g flag,
 * so .test() carries no lastIndex state between callers.
 */
export const VIZ_TRIGGERS =
  /\b(visualiz\w*|interactive|diagram|chart|dashboard|infographic|flowchart|graph|timeline)\b/i;

export const PPTX_TRIGGERS =
  /\b(presentation|slides?|pptx|powerpoint|deck|pitch\s*deck)\b/i;
