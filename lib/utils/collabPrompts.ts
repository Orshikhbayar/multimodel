/**
 * Pure prompt-building functions for collaboration modes.
 * Kept separate so they can be unit-tested without importing Edge-runtime deps.
 */

/**
 * Debate — builds Model B's critique prompt from Model A's response.
 */
export function buildDebateCritiquePrompt(
  originalPrompt: string,
  modelAResponse: string,
): string {
  return (
    `The following answer was given to the question '${originalPrompt}':\n\n` +
    `${modelAResponse}\n\n` +
    `Critique this answer. Identify any errors, missing nuance, or improvements. ` +
    `Then provide your own improved answer.`
  );
}

/**
 * Chain — builds the reviewer's prompt from the drafter's output.
 */
export function buildChainReviewPrompt(draft: string): string {
  return (
    `${draft}\n\n` +
    `Review the above draft for accuracy, clarity, and completeness. ` +
    `Provide an improved version.`
  );
}

/**
 * Chain — builds the verifier's prompt from the reviewer's refined output.
 */
export function buildChainVerifyPrompt(refined: string): string {
  return (
    `${refined}\n\n` +
    `Verify factual claims in the above. Flag any unsupported statements. ` +
    `Output the final verified version.`
  );
}

/**
 * Research — builds the system context string from web search results.
 */
export function buildResearchSystemContext(searchResults: string): string {
  return `Use these search results as context:\n\n${searchResults}`;
}
