import { anonimo, chaveWebhook, falha, segredo } from '@/lib/servidor/banco';
import { lerFuncao } from '@/lib/servidor/funcao-chip';
import { enviarTexto, listarMensagensDoDisparo } from '@/lib/servidor/uazapi';

/**
 * Roda as tarefas de fundo: lembretes, follow-ups e o acerto do funil.
 *
 * É chamada de fora em intervalo curto (pg_cron no Postgres). A mesma chave
 * derivada do webhook autoriza — não há sessão de usuário aqui.
 *
 * Tudo é idempotente: cada item sai da fila ao ser concluído, então uma
 * execução repetida ou sobreposta não reenvia o que já foi.
 */

/** Status da UazApi que significam "chegou no aparelho". */
const ENTREGUES = new Set(['sent', 'delivered', 'read', 'played', 'success']);
const FALHADOS = new Set(['failed', 'canceled', 'error']);

function digitos(valor: string | undefined): string {
  return (valor ?? '').split('@')[0].replace(/\D/g, '');
}

/**
 * As duas grafias de um celular brasileiro.
 *
 * O WhatsApp devolve muitos números sem o nono dígito (55 51 9380-4616), mas o
 * cadastro guarda com ele (55 51 9 9380-4616). Mandando só uma grafia, metade
 * dos envios entregues ficava "pendente" para sempre e a campanha mostrava
 * abordados que ninguém conseguia confirmar. O banco casa a que existir.
 */
function grafias(numero: string): string[] {
  if (!numero.startsWith('55')) return [numero];
  if (numero.length === 12 && /[6-9]/.test(numero[4])) {
    return [numero, `${numero.slice(0, 4)}9${numero.slice(4)}`];
  }
  if (numero.length === 13 && numero[4] === '9') {
    return [numero, `${numero.slice(0, 4)}${numero.slice(5)}`];
  }
  return [numero];
}

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    if (url.searchParams.get('k') !== (await chaveWebhook())) {
      return new Response('não autorizado', { status: 401 });
    }

    const chave = await segredo();
    const servidor = anonimo();
    const relatorio = { followupsCriados: 0, enviados: 0, falhas: 0, camposConciliados: 0 };

    /* 1. Cria o que venceu: follow-ups de quem não respondeu. */
    const { data: geradas, error: erroGerar } = await servidor.rpc('wa_gerar_pendencias', {
      p_segredo: chave,
    });
    if (erroGerar) console.error('[tarefas] gerar pendências:', erroGerar.message);
    else relatorio.followupsCriados = (geradas as { followups_criados?: number })?.followups_criados ?? 0;

    /* 2. Esvazia a fila de envio, um item por vez. */
    const { data: fila, error: erroFila } = await servidor.rpc('wa_fila_de_envio', {
      p_segredo: chave,
      p_limite: 40,
    });
    if (erroFila) console.error('[tarefas] ler fila:', erroFila.message);

    /**
     * Um item por vez, uma vez só.
     *
     * A fila pode trazer o mesmo follow-up uma vez por chip conectado; enviar
     * todas as linhas fez o mesmo contato receber a mensagem três vezes, de
     * três números diferentes.
     */
    // O chip principal só fala com lead qualificado: follow-up de campanha sai
    // por um chip de disparo sempre que houver um na fila.
    const principais = new Set<string>();
    for (const token of new Set((fila ?? []).map((item) => item.token))) {
      const funcao = await lerFuncao(token).catch(() => null);
      if (funcao?.principal) principais.add(token);
    }

    const escolhido = new Map<string, NonNullable<typeof fila>[number]>();
    for (const item of fila ?? []) {
      const chaveItem = `${item.tipo}:${item.id}`;
      const atual = escolhido.get(chaveItem);
      if (!atual || (principais.has(atual.token) && !principais.has(item.token))) {
        escolhido.set(chaveItem, item);
      }
    }
    const unicos = [...escolhido.values()];

    for (const item of unicos) {
      try {
        await enviarTexto(item.token, item.telefone, item.texto);
        await servidor.rpc('wa_concluir_envio', {
          p_segredo: chave,
          p_tipo: item.tipo,
          p_id: item.id,
          p_ok: true,
        });
        relatorio.enviados += 1;
      } catch (e) {
        // Falha de um item não pode parar a fila inteira.
        const motivo = e instanceof Error ? e.message : 'falha desconhecida';
        await servidor.rpc('wa_concluir_envio', {
          p_segredo: chave,
          p_tipo: item.tipo,
          p_id: item.id,
          p_ok: false,
          p_erro: motivo.slice(0, 400),
        });
        relatorio.falhas += 1;
      }
    }

    /* 3. Reconcilia o funil: quem de fato recebeu o disparo da campanha. */
    const { data: campanhas, error: erroCampanhas } = await servidor.rpc(
      'wa_campanhas_em_disparo',
      { p_segredo: chave },
    );
    if (erroCampanhas) console.error('[tarefas] campanhas:', erroCampanhas.message);

    for (const campanha of campanhas ?? []) {
      try {
        const mensagens = await listarMensagensDoDisparo(campanha.token, campanha.pasta_externa);

        const entregues: string[] = [];
        const falhados: string[] = [];
        for (const m of mensagens) {
          const numero = digitos(m.number ?? m.chatid);
          if (!numero) continue;
          const estado = (m.status ?? '').toLowerCase();
          if (ENTREGUES.has(estado)) entregues.push(...grafias(numero));
          else if (FALHADOS.has(estado)) falhados.push(...grafias(numero));
        }

        if (entregues.length || falhados.length) {
          await servidor.rpc('wa_atualizar_envios', {
            p_segredo: chave,
            p_campanha_id: campanha.campanha_id,
            p_entregues: entregues,
            p_falhados: falhados,
          });
          relatorio.camposConciliados += entregues.length + falhados.length;
        }
      } catch (e) {
        console.error('[tarefas] conciliar campanha:', e instanceof Error ? e.message : e);
      }
    }

    return Response.json({ ok: true, ...relatorio });
  } catch (e) {
    return falha(e);
  }
}

/** Deixa conferir a rota pelo navegador sem disparar nada. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const autorizado = url.searchParams.get('k') === (await chaveWebhook());
  return Response.json(
    autorizado ? { ok: true, dica: 'Use POST para executar as tarefas.' } : { erro: 'não autorizado' },
    { status: autorizado ? 200 : 401 },
  );
}
