/**
 * Environment variable validation for PokerApp.
 *
 * Call `validateEnv()` at startup (middleware, server actions) to get a clear
 * error instead of a cryptic Supabase SDK failure when env vars are missing.
 */

const REQUIRED_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

const SERVICE_VARS = ["SUPABASE_SERVICE_ROLE_KEY"] as const;

/**
 * Vars needed for specific features but not for the app to boot.
 * Absence produces a warning rather than a hard error.
 */
const AUTH_REDIRECT_VARS = ["NEXT_PUBLIC_APP_URL"] as const;

export type EnvError = {
  missing: string[];
  isValid: false;
};

export type EnvOk = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string | undefined;
  /** `NEXT_PUBLIC_APP_URL` — required for email verification redirect. */
  appUrl: string | undefined;
  /** Set when optional-but-recommended vars are absent. */
  warnings: string[];
  isValid: true;
};

export type EnvResult = EnvOk | EnvError;

/** Returns parsed env vars or a list of missing required vars. */
export function validateEnv(): EnvResult {
  const missing: string[] = [];

  for (const key of REQUIRED_VARS) {
    const val = process.env[key];
    if (!val || val.trim() === "") {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    return { isValid: false, missing };
  }

  // Check optional-but-recommended vars and collect warnings
  const warnings: string[] = [];
  for (const key of AUTH_REDIRECT_VARS) {
    const val = process.env[key];
    if (!val || val.trim() === "") {
      warnings.push(key);
    }
  }

  return {
    isValid: true,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    appUrl: process.env.NEXT_PUBLIC_APP_URL,
    warnings,
  };
}

/**
 * Returns true if the Supabase env vars are configured.
 * Safe to call in middleware (no throws).
 */
export function hasSupabaseEnv(): boolean {
  return REQUIRED_VARS.every(
    (key) => !!process.env[key] && process.env[key]!.trim() !== ""
  );
}

/** For server-side use: throws with a clear message if env vars are missing. */
export function requireEnv(): EnvOk {
  const result = validateEnv();
  if (!result.isValid) {
    throw new Error(
      `PokerApp: Missing required environment variables: ${result.missing.join(", ")}.\n` +
        `See SETUP.md for configuration instructions.`
    );
  }
  return result;
}
