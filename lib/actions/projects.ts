"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Project } from "@/lib/types";

function mapProject(row: {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    createdAt: new Date(row.created_at).getTime(),
  };
}

async function getPrimaryWorkspaceId(userId: string): Promise<string | null> {
  const supabase = await createSupabaseServerClient();

  const { data: ownerWorkspace, error: ownerError } = await supabase
    .from("workspaces")
    .select("id")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (ownerError) {
    throw ownerError;
  }

  if (ownerWorkspace?.id) {
    return ownerWorkspace.id;
  }

  const { data: memberWorkspace, error: memberError } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (memberError) {
    throw memberError;
  }

  return memberWorkspace?.workspace_id ?? null;
}

export async function getProjects(): Promise<Project[]> {
  const session = await auth();
  if (!session?.user?.id) {
    return [];
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("projects")
    .select("id,name,description,created_at")
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapProject);
}

export async function getProject(projectId: string): Promise<Project | null> {
  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("projects")
    .select("id,name,description,created_at")
    .eq("id", projectId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return mapProject(data);
}

export async function createProject(
  name: string,
  description?: string,
): Promise<string | null> {
  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }

  const workspaceId = await getPrimaryWorkspaceId(session.user.id);
  if (!workspaceId) {
    return null;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("projects")
    .insert({
      workspace_id: workspaceId,
      name,
      description: description ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw error ?? new Error("Failed to create project");
  }

  revalidatePath("/projects");
  return data.id;
}

export async function updateProject(
  projectId: string,
  data: { name?: string; description?: string },
): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.id) {
    return false;
  }

  const supabase = await createSupabaseServerClient();
  const { data: updated, error } = await supabase
    .from("projects")
    .update({
      name: data.name,
      description: data.description,
    })
    .eq("id", projectId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!updated?.id) {
    return false;
  }

  revalidatePath("/projects");
  return true;
}

export async function deleteProject(projectId: string): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.id) {
    return false;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("projects")
    .delete()
    .eq("id", projectId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw error;
  }

  revalidatePath("/projects");
  return Boolean(data?.id);
}
