/**
 * Mantém um trabalho vivo depois que a resposta HTTP já saiu.
 *
 * A UazApi espera pouco pela resposta do webhook. Gerar a resposta da IA
 * (contexto no banco, OpenAI, envio) leva segundos, e no Workers o que não
 * está registrado em `waitUntil` é cortado quando quem chamou desiste de
 * esperar — a IA morria no meio, sem erro em lugar nenhum.
 *
 * Fora do runtime do Workers (build, testes) não há `waitUntil`; aí o trabalho
 * é simplesmente aguardado.
 */
export async function emSegundoPlano(trabalho: Promise<unknown>): Promise<void> {
  try {
    const { waitUntil } = (await import('cloudflare:workers')) as {
      waitUntil?: (p: Promise<unknown>) => void;
    };
    if (typeof waitUntil === 'function') {
      waitUntil(trabalho);
      return;
    }
  } catch {
    // Sem o módulo do Workers: cai para a espera direta.
  }
  await trabalho;
}
