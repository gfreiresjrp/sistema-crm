import { anonimo, erro, exigirUsuario, falha, numeroDoUsuario, segredo } from '@/lib/servidor/banco';
import { apagarInstancia } from '@/lib/servidor/uazapi';

/**
 * Tira o número da clínica.
 *
 * A linha só é desativada, não apagada: conversas e campanhas antigas apontam
 * para ela e perderiam a origem. A instância na UazApi, essa sim, é apagada —
 * o aparelho sai de "Aparelhos conectados" e o número deixa de ocupar vaga.
 */
export async function POST(req: Request) {
  try {
    const autorizacao = await exigirUsuario(req);
    if (autorizacao instanceof Response) return autorizacao;

    const { numeroId } = (await req.json()) as { numeroId?: string };
    if (!numeroId) return erro('Informe qual número excluir.');

    const numero = await numeroDoUsuario(autorizacao.cliente, numeroId);
    if (!numero) return erro('Número não encontrado nesta clínica.', 404);

    const chave = await segredo();
    const servidor = anonimo();
    const { data: credencial } = await servidor.rpc('wa_ler_credencial', {
      p_segredo: chave,
      p_numero_id: numeroId,
    });

    const linha = credencial?.[0];
    if (linha) {
      // Instância que já sumiu do lado da UazApi não pode travar a exclusão.
      try {
        await apagarInstancia(linha.token);
      } catch (e) {
        console.warn('[whatsapp] instância não apagada:', e instanceof Error ? e.message : e);
      }
      await servidor.rpc('wa_atualizar_conexao', {
        p_segredo: chave,
        p_instancia: linha.instancia,
        p_status: 'desconectado',
      });
    }

    const { error } = await autorizacao.cliente
      .from('numeros_whatsapp')
      .update({ ativo: false })
      .eq('id', numeroId);
    if (error) return erro(error.message, 500);

    return Response.json({ ok: true });
  } catch (e) {
    return falha(e);
  }
}
