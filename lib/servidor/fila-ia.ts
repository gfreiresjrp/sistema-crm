import { responderConversa, tempoDigitando } from './assistente';
import { anonimo, segredo } from './banco';
import { lerFuncao } from './funcao-chip';
import { clienteDoRobo } from './robo';
import {
  chatsComStatus,
  editarLead,
  enviarTexto,
  estaConectado,
  listarInstancias,
} from './uazapi';

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
 *
 * No chip principal a fila guarda a passagem — a abertura com que a equipe
 * assume o lead qualificado:
 *   lead_status  = 'passagem'
 *   lead_notes   = o texto da abertura
 */

const NA_FILA = 'ia_fila';
const PASSAGEM = 'passagem';

/** Quanto a IA espera depois da última mensagem do lead. */
export const ESPERA_ANTES_DE_RESPONDER = 50_000;

/**
 * O agendador passa a cada minuto; sem isto a resposta cairia entre 50 e
 * 110 s. Quem vence nos próximos segundos é atendido nesta passada, esperando
 * a hora exata — a espera real fica perto dos 50 s.
 */
const ANTECIPA = 8_000;

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
    lead_notes: '',
  });
}

/** Põe a abertura do principal na fila dele, para a próxima passada. */
export async function agendarPassagem(
  tokenPrincipal: string,
  telefone: string,
  passagem: { conversaId: string; texto: string },
) {
  await editarLead(tokenPrincipal, `${telefone}@s.whatsapp.net`, {
    lead_status: PASSAGEM,
    lead_field01: passagem.conversaId,
    lead_field02: String(Date.now() + 20_000),
    lead_field03: '0',
    lead_notes: passagem.texto,
  });
}

/** O principal manda as aberturas pendentes, uma por vez. */
async function atenderPassagens(
  token: string,
  instancia: string,
  funcao: { principalId: string | null; clinicaId: string | null },
  prazo: number,
): Promise<string[]> {
  const relatorio: string[] = [];
  const pendentes = (await chatsComStatus(token, PASSAGEM)).filter(
    (c) => c.wa_chatid && c.lead_notes && Number(c.lead_field02) <= Date.now(),
  );
  for (const chat of pendentes) {
    if (Date.now() > prazo - 12_000) break;
    const chatid = chat.wa_chatid!;
    const telefone = chatid.split('@')[0];
    const texto = chat.lead_notes!;
    try {
      const saida = await enviarTexto(token, telefone, texto, Math.min(6000, tempoDigitando(texto)));
      // Registrar pelo principal leva a conversa para ele, onde a equipe olha.
      // A função do banco só é encontrada com todos os parâmetros: faltando
      // p_nome/p_midia_url/p_foto, o PostgREST não acha a assinatura e a
      // abertura sumia da conversa (e a IA do disparo não sabia que já passou).
      const { error: erroRegistro } = await anonimo().rpc('wa_registrar_mensagem', {
        p_segredo: await segredo(),
        p_instancia: instancia,
        p_telefone: telefone,
        p_nome: null,
        p_conteudo: texto,
        p_de_mim: true,
        p_id_externo: saida?.id ?? saida?.messageid ?? saida?.key?.id ?? null,
        p_tipo: 'texto',
        p_midia_url: null,
        p_enviada_pela_api: true,
        p_foto: null,
      });
      if (erroRegistro) console.error('[fila-ia] abertura sem registro:', erroRegistro.message);
      /*
       * A conversa passa a ser do principal: sai do filtro do chip de disparo
       * e as respostas da equipe (inclusive as digitadas no sistema) saem por
       * ele. Registrar a mensagem não troca
       * o chip da conversa; quem troca é o login da IA (ver robo.ts).
       */
      const robo = funcao.clinicaId ? await clienteDoRobo(funcao.clinicaId) : null;
      if (robo && funcao.principalId && chat.lead_field01) {
        // E a IA sai da conversa: daqui em diante é a equipe, e a tela para
        // de mostrar "atendimento automático". Nem o chip de disparo nem o
        // principal voltam a responder sozinhos este lead.
        await robo
          .from('conversas')
          .update({ numero_whatsapp_id: funcao.principalId, ia_ativa: false })
          .eq('id', chat.lead_field01);
      }
      await tirarDaFila(token, chatid);
      relatorio.push(`passagem ${telefone}`);
    } catch (e) {
      const tentativas = Number(chat.lead_field03 || 0) + 1;
      if (tentativas >= TENTATIVAS) await tirarDaFila(token, chatid);
      else await editarLead(token, chatid, { lead_field03: String(tentativas) });
      relatorio.push(`passagem falhou ${telefone}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return relatorio;
}

/**
 * Atende a fila de um chip: um lead por vez, e no máximo o que cabe na
 * janela de ~25 s que o Workers dá ao trabalho em segundo plano. Um segundo
 * lead só começa se o primeiro terminou cedo.
 */
async function atenderChip(token: string, prazo: number): Promise<string[]> {
  const relatorio: string[] = [];
  const vencidos = (await chatsComStatus(token, NA_FILA))
    .filter(
      (c) => c.wa_chatid && c.lead_field01 && Number(c.lead_field02) <= Date.now() + ANTECIPA,
    )
    .sort((a, b) => Number(a.lead_field02) - Number(b.lead_field02));

  for (const chat of vencidos) {
    if (Date.now() > prazo) break;
    const chatid = chat.wa_chatid!;
    const telefone = chatid.split('@')[0];
    const falta = Number(chat.lead_field02) - Date.now();
    if (falta > 0) await new Promise((pronto) => setTimeout(pronto, falta));
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
      if (!funcao) return [];
      // No principal a IA não responde; a fila dele só tem as passagens.
      if (funcao.principal) {
        return atenderPassagens(i.token!, i.name!, funcao, prazo).catch(() => []);
      }
      return atenderChip(i.token!, prazo).catch((e) => [
        `chip ${i.name}: ${e instanceof Error ? e.message : String(e)}`,
      ]);
    }),
  );
  return resultados.flat();
}
