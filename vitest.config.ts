import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./test/setup.ts'],
        include: ['**/__tests__/**/*.{test,spec}.{ts,tsx}', '**/*.{test,spec}.{ts,tsx}'],
        exclude: ['node_modules', '.next', 'dist', 'e2e/**', 'playwright.config.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            include: ['lib/**/*.ts', 'components/**/*.tsx'],
            exclude: ['**/__tests__/**', '**/*.test.{ts,tsx}', '**/ui/**'],
            thresholds: {
                statements: 60,
                branches: 60,
                functions: 60,
                lines: 60,
            },
        },
    },
    resolve: {
        alias: {
            '@': resolve(__dirname, './'),
        },
    },
});
