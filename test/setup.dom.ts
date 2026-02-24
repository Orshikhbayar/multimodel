import "@testing-library/jest-dom";
import { vi, afterEach } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({
    theme: "light",
    setTheme: vi.fn(),
    resolvedTheme: "light",
  }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("nanoid", () => ({
  nanoid: () => "test-id-" + Math.random().toString(36).slice(2, 9),
}));

afterEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});
