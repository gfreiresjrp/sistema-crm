import { erro, exigirUsuario, falha } from '@/lib/servidor/banco';
import { escutarAgendamento } from '@/lib/servidor/escuta-agenda';

/**
 * Pede para a IA ler uma conversa do chip principal e, se a atendente fechou
 * um horário, pôr na agenda. Quem chama é a caixa de entrada, a cada mensagem
 * nova numa conversa do principal — com a sessão de quem está no sistema.
 */
export async function POST(req: Request) {
  try {
    const autorizacao = await exigirUsuario(req);
    if (autorizacao instanceof Response) return autorizacao;

    const { conversaId } = (await req.json()) as { conversaId?: string };
    if (!conversaId) return erro('Informe a conversa.');

    // Só escuta o principal: nos chips de disparo quem fala é a própria IA.
    const { data: conversa } = await autorizacao.cliente
      .from('conversas')
      .select('numeros_whatsapp(peso_rotacao)')
      .eq('id', conversaId)
      .maybeSingle();
    const chip = conversa?.numeros_whatsapp as { peso_rotacao: number } | null | undefined;
    if (!chip || chip.peso_rotacao !== 0) {
      return Response.json({ acao: 'nenhuma', motivo: 'conversa fora do chip principal' });
    }

    return Response.json(await escutarAgendamento(autorizacao.cliente, conversaId));
  } catch (e) {
    return falha(e);
  }
}
