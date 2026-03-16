import { vi } from "vitest";

export type SupabaseTableMock = {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  neq: ReturnType<typeof vi.fn>;
  gt: ReturnType<typeof vi.fn>;
  gte: ReturnType<typeof vi.fn>;
  lt: ReturnType<typeof vi.fn>;
  lte: ReturnType<typeof vi.fn>;
  like: ReturnType<typeof vi.fn>;
  ilike: ReturnType<typeof vi.fn>;
  is: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  not: ReturnType<typeof vi.fn>;
  or: ReturnType<typeof vi.fn>;
  filter: ReturnType<typeof vi.fn>;
  match: ReturnType<typeof vi.fn>;
  contains: ReturnType<typeof vi.fn>;
  containedBy: ReturnType<typeof vi.fn>;
  overlaps: ReturnType<typeof vi.fn>;
  textSearch: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  range: ReturnType<typeof vi.fn>;
  csv: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  then: ReturnType<typeof vi.fn>;
};

export function createSupabaseTableMock(): SupabaseTableMock {
  const chain: Partial<SupabaseTableMock> = {};

  // Chainable methods (return chain for further chaining)
  chain.select = vi.fn(() => chain);
  chain.insert = vi.fn(() => chain);
  chain.update = vi.fn(() => chain);
  chain.upsert = vi.fn(() => chain);
  chain.delete = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.neq = vi.fn(() => chain);
  chain.gt = vi.fn(() => chain);
  chain.gte = vi.fn(() => chain);
  chain.lt = vi.fn(() => chain);
  chain.lte = vi.fn(() => chain);
  chain.like = vi.fn(() => chain);
  chain.ilike = vi.fn(() => chain);
  chain.is = vi.fn(() => chain);
  chain.in = vi.fn(() => chain);
  chain.not = vi.fn(() => chain);
  chain.or = vi.fn(() => chain);
  chain.filter = vi.fn(() => chain);
  chain.match = vi.fn(() => chain);
  chain.contains = vi.fn(() => chain);
  chain.containedBy = vi.fn(() => chain);
  chain.overlaps = vi.fn(() => chain);
  chain.textSearch = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.range = vi.fn(() => chain);
  chain.csv = vi.fn(() => chain);

  // Terminal methods (return promise)
  chain.single = vi.fn(async () => ({ data: null, error: null }));
  chain.maybeSingle = vi.fn(async () => ({ data: null, error: null }));

  // Promise support for await
  chain.then = vi.fn((resolve) =>
    Promise.resolve({ data: null, error: null }).then(resolve),
  );

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

  const rpc = vi.fn(async () => ({ data: null, error: null }));

  return {
    from,
    auth,
    rpc,
    tables: tableMap,
  };
}
