/**
 * Mantém um trabalho vivo depois que a resposta HTTP já saiu.
 *
 * A UazApi espera pouco pela resposta do webhook. Gerar a resposta da IA
 * (contexto no banco, OpenAI, envio) leva segundos, e o que não é registrado
 * em `waitUntil` é cortado quando quem chamou desiste de esperar — a IA
 * morria no meio, sem erro em lugar nenhum.
 *
 * O projeto roda em dois lugares: Cloudflare Workers (vinext, local) e Vercel
 * (Next.js). Cada um tem o seu `waitUntil`. Fora dos dois (build, testes) o
 * trabalho é simplesmente aguardado.
 */

type EsperaAte = (trabalho: Promise<unknown>) => void;

/**
 * O módulo do Workers, se estivermos nele.
 *
 * Os comentários impedem o Next de tentar empacotar `cloudflare:workers`, que
 * só existe no runtime da Cloudflare; na Vercel o import falha e vira nulo.
 */
export async function moduloCloudflare(): Promise<Record<string, unknown> | null> {
  try {
    return (await import(
      /* webpackIgnore: true */ /* turbopackIgnore: true */ /* @vite-ignore */ 'cloudflare:workers'
    )) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function esperaAte(): Promise<{ onde: string; fn: EsperaAte } | null> {
  const cloudflare = await moduloCloudflare();
  if (typeof cloudflare?.waitUntil === 'function') {
    return { onde: 'waitUntil (Cloudflare)', fn: cloudflare.waitUntil as EsperaAte };
  }
  if (process.env.VERCEL) {
    const { waitUntil } = await import('@vercel/functions');
    return { onde: 'waitUntil (Vercel)', fn: waitUntil };
  }
  return null;
}

/** Para o diagnóstico: qual mecanismo está segurando o trabalho em segundo plano. */
export async function modoSegundoPlano(): Promise<string> {
  return (await esperaAte())?.onde ?? 'indisponível';
}

export async function emSegundoPlano(trabalho: Promise<unknown>): Promise<void> {
  const espera = await esperaAte();
  if (espera) {
    espera.fn(trabalho);
    return;
  }
  await trabalho;
}
