/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_AI_SERVICE_URL?: string;
  /** Set to "true" to expose the demo PKI card sign-in outside dev builds. */
  readonly VITE_ENABLE_DEMO_LOGIN?: string;
  /** Shared password for the seeded demo accounts. Demo environments only. */
  readonly VITE_DEMO_PASSWORD?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
