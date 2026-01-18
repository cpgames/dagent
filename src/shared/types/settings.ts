/**
 * Application settings types.
 * Settings are persisted to .dagent/settings.json.
 */

/**
 * Application-wide settings.
 */
export interface AppSettings {
  /**
   * Automatically trigger analysis on newly created features.
   * When true, PM agent will analyze needs_analysis tasks after feature creation.
   */
  autoAnalyzeNewFeatures: boolean
}

/**
 * Default settings for new installations or missing settings.
 */
export const DEFAULT_SETTINGS: AppSettings = {
  autoAnalyzeNewFeatures: true
}
