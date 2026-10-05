import type { NextConfig } from 'next';

/**
 * Usado só no deploy da Vercel (`next build`). Localmente o app roda no vinext.
 *
 * O código lê a URL e a chave publicável do Supabase pelos nomes VITE_*; aqui
 * elas são repassadas para que o Next as embuta também no bundle do navegador.
 */
const nextConfig: NextConfig = {
  env: {
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  },
};

export default nextConfig;
