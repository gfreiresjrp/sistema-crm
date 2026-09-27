import { responderConversa } from './assistente';
import { lerFuncao } from './funcao-chip';
import { chatsComStatus, editarLead, estaConectado, listarInstancias } from './uazapi';

/**
 * A fila de respostas da IA.
 *
 * Responder na hora denuncia o robô, e responder trinta leads ao mesmo tempo
 * pelo mesmo chip é o jeito mais rápido de ele ser banido. Então o webhook não
 * responde: só põe o lead na fila do chip, com a hora a partir da qual pode
 * ser respondido. O agendador (a cada minuto) atende a fila de cada chip um
 * lead por vez.
 *
 * A fila mora no próprio contato, na UazApi — o banco não tem tabela para ela
 * e não há acesso para criar uma:
 *   lead_status  = 'ia_fila'
 *   lead_field01 = id da conversa no banco
 *   lead_field02 = quando pode responder (ms desde 1970)
 *   lead_field03 = tentativas que falharam
 */

const NA_FILA = 'ia_fila';

/** Quanto a IA espera depois da última mensagem do lead. */
export const ESPERA_ANTES_DE_RESPONDER = 60_000;

/** Tentativas antes de desistir de um lead (ex.: OpenAI fora do ar). */
const TENTATIVAS = 3;

/**
 * Põe (ou mantém) o lead na fila. Cada mensagem nova empurra a hora de
 * responder: quem manda três mensagens seguidas recebe uma resposta só, um
 * minuto depois da última.
 */
export async function enfileirar(token: string, chatid: string, conversaId: string) {
  await editarLead(token, chatid, {
    lead_status: NA_FILA,
    lead_field01: conversaId,
    lead_field02: String(Date.now() + ESPERA_ANTES_DE_RESPONDER),
    lead_field03: '0',
  });
}

async function tirarDaFila(token: string, chatid: string) {
  await editarLead(token, chatid, {
    lead_status: '',
    lead_field01: '',
    lead_field02: '',
    lead_field03: '',
  });
}

/**
 * Atende a fila de um chip: um lead por vez, e no máximo o que cabe na
 * janela de ~25 s que o Workers dá ao trabalho em segundo plano. Um segundo
 * lead só começa se o primeiro terminou cedo.
 */
async function atenderChip(token: string, prazo: number): Promise<string[]> {
  const relatorio: string[] = [];
  const vencidos = (await chatsComStatus(token, NA_FILA))
    .filter((c) => c.wa_chatid && c.lead_field01 && Number(c.lead_field02) <= Date.now())
    .sort((a, b) => Number(a.lead_field02) - Number(b.lead_field02));

  for (const chat of vencidos) {
    if (Date.now() > prazo) break;
    const chatid = chat.wa_chatid!;
    const telefone = chatid.split('@')[0];
    try {
      const resultado = await responderConversa(chat.lead_field01!, token, telefone);
      await tirarDaFila(token, chatid);
      relatorio.push(resultado.respondeu ? `respondeu ${telefone}` : `pulou ${telefone}: ${resultado.motivo}`);
    } catch (e) {
      const tentativas = Number(chat.lead_field03 || 0) + 1;
      const motivo = e instanceof Error ? e.message : String(e);
      console.error(`[fila-ia] ${telefone} tentativa ${tentativas}:`, motivo);
      if (tentativas >= TENTATIVAS) {
        await tirarDaFila(token, chatid);
      } else {
        await editarLead(token, chatid, {
          lead_field02: String(Date.now() + 2 * 60_000),
          lead_field03: String(tentativas),
        });
      }
      relatorio.push(`falhou ${telefone}: ${motivo}`);
    }
    // Só engata o próximo se sobrar folga para uma resposta inteira.
    if (Date.now() > prazo - 15_000) break;
  }
  return relatorio;
}

/** Roda a fila de todos os chips de disparo conectados, em paralelo entre si. */
export async function processarFilaIa(): Promise<string[]> {
  const prazo = Date.now() + 25_000;
  const instancias = (await listarInstancias()).filter(
    (i) => i.token && i.name?.startsWith('cliniia-') && estaConectado({ instance: i }),
  );

  const resultados = await Promise.all(
    instancias.map(async (i) => {
      const funcao = await lerFuncao(i.token!).catch(() => null);
      // No principal a IA não responde; nada entra na fila dele.
      if (!funcao || funcao.principal) return [];
      return atenderChip(i.token!, prazo).catch((e) => [
        `chip ${i.name}: ${e instanceof Error ? e.message : String(e)}`,
      ]);
    }),
  );
  return resultados.flat();
}
