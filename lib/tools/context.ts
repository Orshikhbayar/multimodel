import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

export async function resolveWorkspaceId(
  supabase: SupabaseClient<Database>,
  userId: string,
  projectId?: string | null,
): Promise<string> {
  const db = supabase as unknown as {
    from: (table: string) => {
      select: (value: string) => {
        eq: (column: string, filter: string) => {
          maybeSingle: () => Promise<{
            data: Record<string, unknown> | null;
            error: { message: string } | null;
          }>;
          order: (
            column: string,
            options: { ascending: boolean },
          ) => {
            limit: (size: number) => {
              maybeSingle: () => Promise<{
                data: Record<string, unknown> | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      };
    };
  };

  if (projectId) {
    const { data: project, error: projectError } = await db
      .from("projects")
      .select("workspace_id")
      .eq("id", projectId)
      .maybeSingle();

    if (projectError) {
      throw new Error(`Failed to resolve workspace from project: ${projectError.message}`);
    }

    const projectWorkspaceId =
      typeof project?.workspace_id === "string" ? project.workspace_id : null;

    if (!projectWorkspaceId) {
      throw new Error("Project not found or inaccessible");
    }

    return projectWorkspaceId;
  }

  const { data: ownedWorkspace, error: ownerError } = await db
    .from("workspaces")
    .select("id")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (ownerError) {
    throw new Error(`Failed to resolve owned workspace: ${ownerError.message}`);
  }

  const ownedWorkspaceId =
    typeof ownedWorkspace?.id === "string" ? ownedWorkspace.id : null;

  if (ownedWorkspaceId) {
    return ownedWorkspaceId;
  }

  const { data: memberWorkspace, error: memberError } = await db
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (memberError) {
    throw new Error(
      `Failed to resolve member workspace: ${memberError.message}`,
    );
  }

  const memberWorkspaceId =
    typeof memberWorkspace?.workspace_id === "string"
      ? memberWorkspace.workspace_id
      : null;

  if (!memberWorkspaceId) {
    throw new Error("No workspace found for user");
  }

  return memberWorkspaceId;
}
