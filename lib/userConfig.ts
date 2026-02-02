/**
 * User configuration
 * 
 * In a production app, this would come from:
 * - Authentication provider (e.g., NextAuth, Clerk)
 * - API endpoint (/api/user/me)
 * - Session storage
 * 
 * For now, this serves as a central config that's easy to swap out.
 */

export interface UserConfig {
    id: string;
    displayName: string;
    email: string;
    avatarInitial: string;
    avatarUrl?: string;
}

/**
 * Default user config for development/demo purposes.
 * Replace with actual auth integration in production.
 */
export const DEFAULT_USER: UserConfig = {
    id: "user-dev-001",
    displayName: "Demo User",
    email: "demo@example.com",
    avatarInitial: "D",
};

/**
 * Get current user config.
 * In production, this would fetch from auth context or API.
 */
export function getCurrentUser(): UserConfig {
    // TODO: Replace with actual auth integration
    // Example: return useSession()?.user || DEFAULT_USER
    return DEFAULT_USER;
}
