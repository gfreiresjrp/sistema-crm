import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/tipos-banco';
import { anonimo, erro, exigirUsuario, falha, segredo } from '@/lib/servidor/banco';
import { controlarDisparo } from '@/lib/servidor/uazapi';

/**
 * Pausa, retoma ou exclui uma campanha.
 *
 * A campanha não tem modo manual: depois de iniciada, a fila da UazApi envia
 * para a lista inteira sozinha. Pausar aqui para a fila de verdade — antes a
 * chave da tela só trocava o status no banco e as mensagens continuavam
 * saindo.
 */
export async function POST(req: Request) {
  try {
    const autorizacao = await exigirUsuario(req);
    if (autorizacao instanceof Response) return autorizacao;

    const { campanhaId, acao } = (await req.json()) as {
      campanhaId?: string;
      acao?: 'pausar' | 'retomar' | 'excluir';
    };
    if (!campanhaId || !['pausar', 'retomar', 'excluir'].includes(acao ?? '')) {
      return erro('Informe a campanha e se é para pausar, retomar ou excluir.');
    }

    // RLS: a campanha só existe para quem é da clínica.
    const { data: campanha } = await autorizacao.cliente
      .from('campanhas')
      .select('id, status, pasta_externa, filtro_publico')
      .eq('id', campanhaId)
      .maybeSingle();
    if (!campanha) return erro('Campanha não encontrada.', 404);
    if (acao === 'excluir') return excluir(autorizacao.cliente, campanha);
    if (!campanha.pasta_externa) return erro('Esta campanha ainda não foi iniciada.', 409);

    // O chip que está disparando é o dos envios; é o token dele que manda na fila.
    const token = await tokenDaCampanha(autorizacao.cliente, campanhaId);
    if (!token) return erro('O chip desta campanha não está mais pareado.', 409);

    await controlarDisparo(token, campanha.pasta_externa, acao === 'pausar' ? 'stop' : 'continue');

    const { error } = await autorizacao.cliente
      .from('campanhas')
      .update({ status: acao === 'pausar' ? 'pausada' : 'em_andamento' })
      .eq('id', campanhaId);
    if (error) return erro(error.message, 500);

    return Response.json({ ok: true });
  } catch (e) {
    return falha(e);
  }
}

/** Token do chip que disparou a campanha (o dos envios). */
async function tokenDaCampanha(
  cliente: SupabaseClient<Database>,
  campanhaId: string,
): Promise<string | null> {
  const { data: envio } = await cliente
    .from('envios_campanha')
    .select('numero_whatsapp_id')
    .eq('campanha_id', campanhaId)
    .not('numero_whatsapp_id', 'is', null)
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!envio?.numero_whatsapp_id) return null;
  const { data: credencial } = await anonimo().rpc('wa_ler_credencial', {
    p_segredo: await segredo(),
    p_numero_id: envio.numero_whatsapp_id,
  });
  return credencial?.[0]?.token ?? null;
}

/**
 * Exclui a campanha.
 *
 * Primeiro para a fila na UazApi — apagar só no banco deixava as mensagens
 * ainda na fila saindo depois. As conversas e os agendamentos que ela gerou
 * ficam: são histórico dos leads, não da campanha.
 */
async function excluir(
  cliente: SupabaseClient<Database>,
  campanha: { id: string; pasta_externa: string | null; filtro_publico: unknown },
): Promise<Response> {
  if (campanha.pasta_externa) {
    const token = await tokenDaCampanha(cliente, campanha.id);
    if (token) {
      try {
        await controlarDisparo(token, campanha.pasta_externa, 'delete');
      } catch (e) {
        // Fila já concluída ou apagada na UazApi: não há o que parar.
        console.warn('[campanha] fila não apagada:', e instanceof Error ? e.message : e);
      }
    }
  }

  for (const tabela of ['envios_campanha', 'campanha_numeros'] as const) {
    const { error } = await cliente.from(tabela).delete().eq('campanha_id', campanha.id);
    if (error) return erro(`Não consegui apagar ${tabela}: ${error.message}`, 500);
  }

  const { error } = await cliente.from('campanhas').delete().eq('id', campanha.id);
  if (error) return erro(error.message, 500);

  // O anexo só servia a esta campanha.
  const anexo = ((campanha.filtro_publico ?? {}) as { anexo?: { caminho?: string } }).anexo;
  if (anexo?.caminho) await cliente.storage.from('midias').remove([anexo.caminho]);

  return Response.json({ ok: true });
}
