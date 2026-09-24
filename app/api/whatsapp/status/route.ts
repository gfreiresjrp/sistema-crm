import { anonimo, erro, exigirUsuario, falha, numeroDoUsuario, segredo } from '@/lib/servidor/banco';
import { estaConectado, statusInstancia } from '@/lib/servidor/uazapi';

/** Estado da conexão de um número, consultado direto na UazApi. */
export async function GET(req: Request) {
  try {
    const autorizacao = await exigirUsuario(req);
    if (autorizacao instanceof Response) return autorizacao;

    const numeroId = new URL(req.url).searchParams.get('numeroId');
    if (!numeroId) return erro('Informe qual número consultar.');

    const numero = await numeroDoUsuario(autorizacao.cliente, numeroId);
    if (!numero) return erro('Número não encontrado nesta clínica.', 404);

    const chave = await segredo();
    const servidor = anonimo();
    const { data: credencial } = await servidor.rpc('wa_ler_credencial', {
      p_segredo: chave,
      p_numero_id: numeroId,
    });

    const linha = credencial?.[0];
    if (!linha) return Response.json({ vinculado: false, conectado: false });

    const estado = await statusInstancia(linha.token);
    const conectado = estaConectado(estado);

    await servidor.rpc('wa_atualizar_conexao', {
      p_segredo: chave,
      p_instancia: linha.instancia,
      p_status: conectado ? 'conectado' : 'desconectado',
      p_numero: estado.instance?.owner ?? null,
    });

    return Response.json({
      vinculado: true,
      conectado,
      perfil: estado.instance?.profileName ?? null,
      dono: estado.instance?.owner ?? null,
      qrcode: conectado ? null : (estado.instance?.qrcode ?? null),
    });
  } catch (e) {
    return falha(e);
  }
}
