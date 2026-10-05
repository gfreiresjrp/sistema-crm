import { anonimo, chaveWebhook, segredo } from '@/lib/servidor/banco';
import { responderConversa } from '@/lib/servidor/assistente';
import { lerFuncao } from '@/lib/servidor/funcao-chip';
import { horariosLivres } from '@/lib/servidor/agenda';
import { clienteDoRobo } from '@/lib/servidor/robo';
import { variavel, variaveisPresentes } from '@/lib/servidor/ambiente';
import { modoSegundoPlano } from '@/lib/servidor/segundo-plano';

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

  /*
   * Com `conversa` e `instancia`, roda a IA inteira naquela conversa em modo
   * simulação — contexto, papel do chip, decisão e texto — sem enviar nada.
   * Como a IA trabalha em segundo plano, é o único jeito de ver de fora em
   * que passo ela para.
   */
  const conversa = url.searchParams.get('conversa');
  const instancia = url.searchParams.get('instancia');
  let simulacao: unknown = null;
  if (conversa && instancia) {
    const passos: Record<string, unknown> = {};
    try {
      const { data: credencial, error } = await anonimo().rpc('wa_credencial_por_instancia', {
        p_segredo: await segredo(),
        p_instancia: instancia,
      });
      passos.credencial = error ? `erro: ${error.message}` : Boolean(credencial?.[0]?.token);
      const token = credencial?.[0]?.token;
      if (token) {
        passos.funcao = await lerFuncao(token).catch((e) => `erro: ${String(e)}`);
        passos.resultado = await responderConversa(conversa, token, '0', { simular: true });
        // Os primeiros horários livres, para conferir o que a IA oferece.
        const clinicaId = typeof passos.funcao === 'object' ? (passos.funcao as { clinicaId?: string }).clinicaId : null;
        const robo = clinicaId ? await clienteDoRobo(clinicaId) : null;
        passos.agenda = robo
          ? (await horariosLivres(robo, { clinicaId: clinicaId!, fuso: 'America/Sao_Paulo', limite: 12 })).map((h) => h.rotulo)
          : 'sem login da IA';
      }
    } catch (e) {
      passos.erro = e instanceof Error ? e.message : String(e);
    }
    simulacao = passos;
  }

  // A IA roda depois da resposta ao webhook; sem `waitUntil` ela seria cortada.
  const segundoPlano = await modoSegundoPlano();

  return Response.json({ variaveis, openai, segundoPlano, simulacao });
}
