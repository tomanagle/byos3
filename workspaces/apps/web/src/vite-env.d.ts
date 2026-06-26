/// <reference types="vite/client" />

// Build-time env exposed to the client by Vite (inlined into the bundle). Only VITE_-prefixed vars
// are exposed - server-only secrets live in the Worker env (cloudflare:workers), never here.
interface ImportMetaEnv {
  /** PUBLIC Cloudflare Turnstile site key. Set by CI from the Pulumi widget; test key in dev. */
  readonly VITE_TURNSTILE_SITE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
