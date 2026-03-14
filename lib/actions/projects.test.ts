import { beforeEach, describe, expect, it, vi } from "vitest";

function createThenableTableMock() {
  let result: { data: unknown; error: unknown } = { data: null, error: null };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query builder mock requires flexible typing
  const table: Record<string, (...args: any[]) => any> = {
    select: vi.fn(() => table),
    insert: vi.fn(() => table),
    update: vi.fn(() => table),
    delete: vi.fn(() => table),
    eq: vi.fn(() => table),
    order: vi.fn(() => table),
    limit: vi.fn(() => table),
    maybeSingle: vi.fn(async () => result),
    single: vi.fn(async () => result),
    then: (
      onFulfilled: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(onFulfilled, onRejected),
    setResult: (next: { data: unknown; error: unknown }) => {
      result = next;
    },
  };

  return table;
}

const { mockAuth, mockCreateSupabaseServerClient, mockRevalidatePath } =
  vi.hoisted(() => ({
    mockAuth: vi.fn(),
    mockCreateSupabaseServerClient: vi.fn(),
    mockRevalidatePath: vi.fn(),
  }));

vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));
vi.mock("@/lib/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockCreateSupabaseServerClient,
}));

import {
  createProject,
  deleteProject,
  getProject,
  getProjects,
  updateProject,
} from "@/lib/actions/projects";

describe("project actions", () => {
  const projects = createThenableTableMock();
  const workspaces = createThenableTableMock();
  const workspaceMembers = createThenableTableMock();

  beforeEach(() => {
    vi.clearAllMocks();

    mockAuth.mockResolvedValue({
      user: { id: "user-1", email: "u@example.com", name: "U" },
    });

    mockCreateSupabaseServerClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "projects") return projects;
        if (table === "workspaces") return workspaces;
        if (table === "workspace_members") return workspaceMembers;
        throw new Error(`Unexpected table ${table}`);
      }),
    });

    projects.setResult({ data: null, error: null });
    workspaces.setResult({ data: null, error: null });
    workspaceMembers.setResult({ data: null, error: null });
  });

  it("returns empty projects for unauthenticated user", async () => {
    mockAuth.mockResolvedValue(null);
    expect(await getProjects()).toEqual([]);
  });

  it("returns specific project for current user", async () => {
    projects.setResult({
      data: {
        id: "p1",
        name: "Project",
        description: null,
        created_at: "2025-01-01T00:00:00.000Z",
      },
      error: null,
    });

    const project = await getProject("p1");
    expect(project?.id).toBe("p1");
    expect(project?.createdAt).toBe(
      new Date("2025-01-01T00:00:00.000Z").getTime(),
    );
  });

  it("creates and updates project", async () => {
    workspaces.setResult({ data: { id: "w1" }, error: null });
    projects.setResult({ data: { id: "p2" }, error: null });

    const id = await createProject("New Project", "desc");
    expect(id).toBe("p2");

    projects.setResult({ data: { id: "p2" }, error: null });
    const updated = await updateProject("p2", { name: "Renamed" });
    expect(updated).toBe(true);
    expect(mockRevalidatePath).toHaveBeenCalledWith("/projects");
  });

  it("deletes project", async () => {
    projects.setResult({ data: { id: "p2" }, error: null });

    const deleted = await deleteProject("p2");
    expect(deleted).toBe(true);
  });
});
