import { erro, exigirUsuario, falha } from '@/lib/servidor/banco';
import { dispararLote, ErroDisparo } from '@/lib/servidor/disparo';

/**
 * Inicia uma campanha: manda hoje o que cabe no limite diário do chip. O resto
 * o agendador manda nos dias seguintes, sozinho (ver lib/servidor/disparo.ts).
 */
export async function POST(req: Request) {
  try {
    const autorizacao = await exigirUsuario(req);
    if (autorizacao instanceof Response) return autorizacao;

    const { campanhaId } = (await req.json()) as { campanhaId?: string };
    if (!campanhaId) return erro('Informe a campanha.');

    const lote = await dispararLote(autorizacao.cliente, campanhaId);
    if (lote.enviados === 0) {
      return erro(
        lote.semWhatsapp
          ? 'Nenhum dos contatos deste lote tem WhatsApp ativo.'
          : 'Nenhum contato novo para esta campanha.',
        409,
      );
    }

    return Response.json({
      ok: true,
      enviados: lote.enviados,
      ignorados: lote.semWhatsapp,
      faltam: lote.faltam,
      pasta: lote.pasta,
    });
  } catch (e) {
    if (e instanceof ErroDisparo) return erro(e.message, e.status);
    return falha(e);
  }
}
