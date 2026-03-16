/**
 * Canonical re-export for app-level settings (theme, language, etc.).
 *
 * The implementation lives in lib/state/settingsStore.ts while the migration
 * to a unified lib/stores/ directory is in progress.
 *
 * New code should import from here:
 *   import { useAppSettingsStore } from "@/lib/stores/appSettingsStore"
 *
 * Do NOT add new imports from lib/state/settingsStore directly.
 */
export {
  useAppSettingsStore,
  DEFAULT_SETTINGS,
  type AppSettingsStore,
} from "@/lib/state/settingsStore";
