import { anonimo, chaveWebhook, segredo } from '@/lib/servidor/banco';

/**
 * Para o monitor externo (UptimeRobot e afins): 200 quando a operação está de
 * pé, 503 quando não está — e o monitor avisa.
 *
 * No fim de semana de 2026-10-03 o banco caiu e a IA ficou parada dois dias
 * sem ninguém saber. Aqui o que derruba o status é o que tira a IA do ar:
 * banco sem responder, nenhum chip conectado ou o agendador parado (é ele que
 * roda a fila de respostas, follow-ups e lembretes).
 */

/** O agendador roda a cada minuto; parado há mais que isto é falha. */
const AGENDADOR_ATRASO_MAXIMO = 5 * 60_000;

/** O banco travado não devolve erro, só não responde: espera tem limite. */
const ESPERA_BANCO = 8_000;

type Saude = {
  chips_ativos: number;
  chips_conectados: number;
  chips_desconectados: string[];
  agendador_rodou_em: string | null;
  ultima_mensagem_recebida_em: string | null;
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get('k') !== (await chaveWebhook())) {
    return Response.json({ erro: 'não autorizado' }, { status: 401 });
  }

  const problemas: string[] = [];
  const avisos: string[] = [];
  let saude: Saude | null = null;

  const consulta = anonimo()
    .rpc('wa_saude', { p_segredo: await segredo() })
    .then(({ data, error }) => {
      if (error) throw new Error(error.message);
      return data as unknown as Saude;
    });
  const limite = new Promise<never>((_, falhar) =>
    setTimeout(() => falhar(new Error(`sem resposta em ${ESPERA_BANCO / 1000}s`)), ESPERA_BANCO),
  );

  try {
    saude = await Promise.race([consulta, limite]);
  } catch (e) {
    problemas.push(`banco de dados: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (saude) {
    if (saude.chips_ativos > 0 && saude.chips_conectados === 0) {
      problemas.push('nenhum chip de WhatsApp conectado');
    }
    if (saude.chips_desconectados.length) {
      avisos.push(`chips desconectados: ${saude.chips_desconectados.join(', ')}`);
    }

    const rodou = saude.agendador_rodou_em ? new Date(saude.agendador_rodou_em).getTime() : 0;
    if (Date.now() - rodou > AGENDADOR_ATRASO_MAXIMO) {
      problemas.push(
        rodou
          ? `tarefas automáticas paradas desde ${new Date(rodou).toISOString()}`
          : 'tarefas automáticas nunca rodaram',
      );
    }
  }

  return Response.json(
    { ok: problemas.length === 0, problemas, avisos, saude },
    { status: problemas.length ? 503 : 200, headers: { 'Cache-Control': 'no-store' } },
  );
}
