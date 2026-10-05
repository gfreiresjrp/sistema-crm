import { moduloCloudflare } from './segundo-plano';

/**
 * Variáveis de servidor.
 *
 * Elas vêm de `.dev.vars` no desenvolvimento e de `wrangler secret` em
 * produção. Nada aqui pode ter prefixo VITE_: esse prefixo faz o Vite embutir
 * o valor no bundle do navegador, e o token da UazApi é um segredo.
 *
 * O Workers expõe as variáveis de dois jeitos conforme a versão do runtime;
 * lemos os dois para não depender de qual está ativo.
 */

type Ambiente = {
  UAZAPI_URL: string;
  UAZAPI_ADMIN_TOKEN: string;
  INTEGRACAO_SEGREDO: string;
  OPENAI_API_KEY: string;
};

let cache: Record<string, string> | null = null;

async function carregar(): Promise<Record<string, string>> {
  if (cache) return cache;

  const encontrado: Record<string, string> = {};

  // Fora do runtime do Workers (Vercel, build de node) — segue para process.env.
  const cloudflare = await moduloCloudflare();
  if (cloudflare?.env) Object.assign(encontrado, cloudflare.env as Record<string, string>);

  if (typeof process !== 'undefined' && process.env) {
    for (const [chave, valor] of Object.entries(process.env)) {
      if (typeof valor === 'string' && encontrado[chave] === undefined) {
        encontrado[chave] = valor;
      }
    }
  }

  cache = encontrado;
  return encontrado;
}

/** Lê uma variável obrigatória e falha alto se ela não estiver configurada. */
export async function variavel(nome: keyof Ambiente): Promise<string> {
  const todas = await carregar();
  const valor = todas[nome];
  if (!valor) {
    throw new Error(
      `Variável de servidor ${nome} não configurada. ` +
        'Defina em .dev.vars (local) ou com `npx wrangler secret put` (produção).',
    );
  }
  return valor;
}

/** Diz quais variáveis existem, sem revelar valor — para o diagnóstico. */
export async function variaveisPresentes(): Promise<Record<keyof Ambiente, boolean>> {
  const todas = await carregar();
  return {
    UAZAPI_URL: Boolean(todas.UAZAPI_URL),
    UAZAPI_ADMIN_TOKEN: Boolean(todas.UAZAPI_ADMIN_TOKEN),
    INTEGRACAO_SEGREDO: Boolean(todas.INTEGRACAO_SEGREDO),
    OPENAI_API_KEY: Boolean(todas.OPENAI_API_KEY),
  };
}
