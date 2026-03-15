import { vi } from "vitest";

export type SupabaseTableMock = {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
};

export function createSupabaseTableMock(): SupabaseTableMock {
  const chain: Partial<SupabaseTableMock> = {};

  chain.select = vi.fn(() => chain);
  chain.insert = vi.fn(() => chain);
  chain.update = vi.fn(() => chain);
  chain.upsert = vi.fn(() => chain);
  chain.delete = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.in = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.single = vi.fn(async () => ({ data: null, error: null }));
  chain.maybeSingle = vi.fn(async () => ({ data: null, error: null }));

  return chain as SupabaseTableMock;
}

export function createSupabaseClientMock() {
  const tableMap = new Map<string, SupabaseTableMock>();

  const from = vi.fn((table: string) => {
    const existing = tableMap.get(table);
    if (existing) return existing;
    const mock = createSupabaseTableMock();
    tableMap.set(table, mock);
    return mock;
  });

  const auth = {
    getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
    getClaims: vi.fn(async () => ({ data: { claims: null }, error: null })),
    signOut: vi.fn(async () => ({ error: null })),
    exchangeCodeForSession: vi.fn(async () => ({ error: null })),
    onAuthStateChange: vi.fn(() => ({
      data: {
        subscription: {
          unsubscribe: vi.fn(),
        },
      },
    })),
  };

  return {
    from,
    auth,
    tables: tableMap,
  };
}
