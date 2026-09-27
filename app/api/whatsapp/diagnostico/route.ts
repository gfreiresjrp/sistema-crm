import { chaveWebhook } from '@/lib/servidor/banco';
import { variavel, variaveisPresentes } from '@/lib/servidor/ambiente';

/**
 * Diz se o servidor tem o que a IA precisa, sem revelar nenhum valor.
 *
 * A falha da IA acontece em segundo plano e só aparece no log do Workers; sem
 * isto, "a IA não responde" não tinha como ser conferido de fora. A mesma
 * chave derivada do webhook autoriza.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get('k') !== (await chaveWebhook())) {
    return Response.json({ erro: 'não autorizado' }, { status: 401 });
  }

  const variaveis = await variaveisPresentes();

  let openai: string = 'sem chave';
  if (variaveis.OPENAI_API_KEY) {
    const resposta = await fetch('https://api.openai.com/v1/models/gpt-4o-mini', {
      headers: { Authorization: `Bearer ${await variavel('OPENAI_API_KEY')}` },
    }).catch(() => null);
    openai = !resposta
      ? 'sem conexão'
      : resposta.ok
        ? 'ok'
        : `recusada (HTTP ${resposta.status})`;
  }

  return Response.json({ variaveis, openai });
}
