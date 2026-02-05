"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import type { Project } from "@/lib/types";

// ============================================
// Type Conversions
// ============================================

function dbProjectToAppProject(dbProject: {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
}): Project {
  return {
    id: dbProject.id,
    name: dbProject.name,
    description: dbProject.description ?? undefined,
    createdAt: dbProject.createdAt.getTime(),
  };
}

// ============================================
// Project Actions
// ============================================

export async function getProjects(): Promise<Project[]> {
  const session = await auth();
  if (!session?.user?.id) {
    return [];
  }

  const projects = await prisma.project.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  return projects.map(dbProjectToAppProject);
}

export async function getProject(projectId: string): Promise<Project | null> {
  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }

  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      userId: session.user.id,
    },
  });

  if (!project) {
    return null;
  }

  return dbProjectToAppProject(project);
}

export async function createProject(
  name: string,
  description?: string,
): Promise<string | null> {
  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }

  const project = await prisma.project.create({
    data: {
      userId: session.user.id,
      name,
      description: description ?? null,
    },
  });

  revalidatePath("/projects");
  return project.id;
}

export async function updateProject(
  projectId: string,
  data: { name?: string; description?: string },
): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.id) {
    return false;
  }

  const result = await prisma.project.updateMany({
    where: {
      id: projectId,
      userId: session.user.id,
    },
    data: {
      name: data.name,
      description: data.description,
    },
  });

  revalidatePath("/projects");
  return result.count > 0;
}

export async function deleteProject(projectId: string): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.id) {
    return false;
  }

  const result = await prisma.project.deleteMany({
    where: {
      id: projectId,
      userId: session.user.id,
    },
  });

  revalidatePath("/projects");
  return result.count > 0;
}
