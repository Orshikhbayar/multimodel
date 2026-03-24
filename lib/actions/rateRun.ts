"use server";

import { createSupabaseServerClient, getAuthenticatedUser } from "@/lib/supabase/server";

/**
 * Persists a thumbs-up / thumbs-down rating for a model run.
 * Passing the same rating twice clears it (toggle behaviour).
 *
 * @param runId  - The UUID of the model_runs row to rate
 * @param rating - 1 for thumbs-up, -1 for thumbs-down
 * @returns The new rating value (or null if it was cleared)
 */
export async function rateRun(
  runId: string,
  rating: 1 | -1,
): Promise<{ rating: 1 | -1 | null }> {
  const user = await getAuthenticatedUser();
  if (!user) throw new Error("Unauthorized");

  const supabase = await createSupabaseServerClient();

  // Fetch the current rating to implement toggle behaviour.
  // Ownership is enforced by RLS (workspace membership check).
  const { data: existing, error: fetchError } = await supabase
    .from("model_runs")
    .select("rating")
    .eq("id", runId)
    .single();

  if (fetchError || !existing) {
    throw new Error("Run not found");
  }

  // Toggle: clicking the active button again clears the rating.
  const newRating: 1 | -1 | null =
    existing.rating === rating ? null : rating;

  const { error: updateError } = await supabase
    .from("model_runs")
    .update({ rating: newRating })
    .eq("id", runId);

  if (updateError) throw new Error(updateError.message);

  return { rating: newRating };
}
