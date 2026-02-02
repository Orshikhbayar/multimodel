import '@testing-library/jest-dom';
import { vi, afterEach } from 'vitest';

// Mock next/navigation
vi.mock('next/navigation', () => ({
    useRouter: () => ({
        push: vi.fn(),
        replace: vi.fn(),
        prefetch: vi.fn(),
        back: vi.fn(),
        forward: vi.fn(),
    }),
    usePathname: () => '/',
    useSearchParams: () => new URLSearchParams(),
    useParams: () => ({}),
}));

// Mock next-themes
vi.mock('next-themes', () => ({
    useTheme: () => ({
        theme: 'light',
        setTheme: vi.fn(),
        resolvedTheme: 'light',
    }),
    ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock nanoid for deterministic IDs in tests
vi.mock('nanoid', () => ({
    nanoid: () => 'test-id-' + Math.random().toString(36).substr(2, 9),
}));

// Clean up after each test
afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
});
