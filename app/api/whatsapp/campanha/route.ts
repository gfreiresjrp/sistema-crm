import { anonimo, erro, exigirUsuario, falha, segredo } from '@/lib/servidor/banco';
import { controlarDisparo } from '@/lib/servidor/uazapi';

/**
 * Pausa ou retoma uma campanha em andamento.
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
      acao?: 'pausar' | 'retomar';
    };
    if (!campanhaId || (acao !== 'pausar' && acao !== 'retomar')) {
      return erro('Informe a campanha e se é para pausar ou retomar.');
    }

    // RLS: a campanha só existe para quem é da clínica.
    const { data: campanha } = await autorizacao.cliente
      .from('campanhas')
      .select('id, status, pasta_externa')
      .eq('id', campanhaId)
      .maybeSingle();
    if (!campanha) return erro('Campanha não encontrada.', 404);
    if (!campanha.pasta_externa) return erro('Esta campanha ainda não foi iniciada.', 409);

    // O chip que está disparando é o dos envios; é o token dele que manda na fila.
    const { data: envio } = await autorizacao.cliente
      .from('envios_campanha')
      .select('numero_whatsapp_id')
      .eq('campanha_id', campanhaId)
      .not('numero_whatsapp_id', 'is', null)
      .order('criado_em', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!envio?.numero_whatsapp_id) return erro('Não achei o chip desta campanha.', 409);

    const { data: credencial } = await anonimo().rpc('wa_ler_credencial', {
      p_segredo: await segredo(),
      p_numero_id: envio.numero_whatsapp_id,
    });
    const token = credencial?.[0]?.token;
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
