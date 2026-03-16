/**
 * Provider router — dispatches streaming completions to the correct
 * provider adapter based on the model ID prefix (e.g. "anthropic/...").
 *
 * This is the single entry-point the chat route should use.
 * Adding a new provider means adding a case here and an adapter file.
 */

import {
  type StreamOptions,
  type StreamEvent,
  streamOpenAICompletion,
} from "./openai";
import { streamAnthropicCompletion } from "./anthropic";
import { streamGoogleCompletion } from "./google";
import { streamOpenAICompatibleCompletion } from "./openaiCompatible";

export type { StreamOptions, StreamEvent };

/**
 * Stream a chat completion from whichever provider owns this model ID.
 * Throws immediately if the provider prefix is unrecognised — no silent fallbacks.
 */
export async function* streamCompletion(
  options: StreamOptions,
): AsyncGenerator<StreamEvent, void, unknown> {
  const provider = options.model.split("/")[0];

  switch (provider) {
    case "openai":
      yield* streamOpenAICompletion(options);
      break;

    case "anthropic":
      yield* streamAnthropicCompletion(options);
      break;

    case "google":
      yield* streamGoogleCompletion(options);
      break;

    case "xai":
    case "deepseek":
      yield* streamOpenAICompatibleCompletion(options);
      break;

    default:
      throw new Error(
        `providerRouter: unknown provider prefix "${provider}" in model ID "${options.model}". ` +
          `Supported prefixes: openai, anthropic, google, xai, deepseek.`,
      );
  }
}
