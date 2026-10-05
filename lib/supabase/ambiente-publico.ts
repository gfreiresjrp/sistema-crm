/**
 * URL e chave publicável do Supabase, nos dois empacotadores do projeto.
 *
 * Localmente o app roda no vinext (Vite), que embute `import.meta.env.VITE_*`.
 * Na Vercel quem constrói é o Next.js, que não conhece `import.meta.env`: lá
 * as mesmas variáveis chegam por `process.env`, repassadas em next.config.ts
 * para serem embutidas também no bundle do navegador.
 */

// `env` só existe no Vite; no Next ele vem indefinido.
const doVite = (import.meta as Partial<ImportMeta>).env;

export const SUPABASE_URL: string =
  doVite?.VITE_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '';

export const SUPABASE_CHAVE_PUBLICA: string =
  doVite?.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';
