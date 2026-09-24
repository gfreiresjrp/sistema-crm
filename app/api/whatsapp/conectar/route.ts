import {
  chaveWebhook,
  erro,
  exigirUsuario,
  falha,
  numeroDoUsuario,
  segredo,
} from '@/lib/servidor/banco';
import {
  conectarInstancia,
  configurarWebhook,
  criarInstancia,
  estaConectado,
  statusInstancia,
} from '@/lib/servidor/uazapi';
import { anonimo } from '@/lib/servidor/banco';

/**
 * Inicia o pareamento de um número.
 *
 * Cria a instância na UazApi se ainda não existir, aponta o webhook para cá e
 * devolve o QR Code (ou o código de pareamento, quando o telefone é informado).
 * O token da instância fica no banco, numa tabela sem policy — nunca volta
 * para o navegador.
 */
export async function POST(req: Request) {
  try {
    const autorizacao = await exigirUsuario(req);
    if (autorizacao instanceof Response) return autorizacao;

    const { numeroId, telefone } = (await req.json()) as {
      numeroId?: string;
      telefone?: string;
    };
    if (!numeroId) return erro('Informe qual número conectar.');

    // O RLS decide: se a pessoa não é da clínica, o número não existe para ela.
    const numero = await numeroDoUsuario(autorizacao.cliente, numeroId);
    if (!numero) return erro('Número não encontrado nesta clínica.', 404);

    const chave = await segredo();
    const servidor = anonimo();

    // Reaproveita a instância já criada para este número, se houver.
    const { data: credencial } = await servidor.rpc('wa_ler_credencial', {
      p_segredo: chave,
      p_numero_id: numeroId,
    });

    let instancia = credencial?.[0]?.instancia ?? null;
    let token = credencial?.[0]?.token ?? null;

    if (!token) {
      const nome = `cliniia-${numeroId.slice(0, 8)}`;
      const criada = await criarInstancia(nome);
      if (!criada.token) return erro('A UazApi não devolveu o token da instância.', 502);

      instancia = criada.name ?? nome;
      token = criada.token;

      const { error } = await servidor.rpc('wa_guardar_credencial', {
        p_segredo: chave,
        p_numero_id: numeroId,
        p_instancia: instancia,
        p_token: token,
      });
      if (error) return erro(error.message, 500);
    }

    // Os eventos precisam voltar para cá antes de o celular parear. Em
    // desenvolvimento a URL é localhost, que a UazApi não alcança — isso não
    // pode impedir o pareamento, então a falha vira só um aviso.
    const destino = new URL(req.url);
    const base = destino.searchParams.get('base') ?? destino.origin;
    const urlWebhook = `${base}/api/whatsapp/webhook?k=${await chaveWebhook()}`;
    let avisoWebhook: string | null = null;
    try {
      await configurarWebhook(token, urlWebhook);
    } catch (e) {
      avisoWebhook = e instanceof Error ? e.message : 'Não foi possível registrar o webhook.';
      console.warn('[whatsapp] webhook não registrado:', avisoWebhook);
    }

    const conexao = await conectarInstancia(token, telefone || undefined);
    const atual = conexao.instance ?? (await statusInstancia(token)).instance;
    const conectado = estaConectado(conexao);

    await servidor.rpc('wa_atualizar_conexao', {
      p_segredo: chave,
      p_instancia: instancia!,
      p_status: conectado ? 'conectado' : 'conectando',
    });

    return Response.json({
      instancia,
      conectado,
      qrcode: atual?.qrcode ?? null,
      paircode: atual?.paircode ?? null,
      status: atual?.status ?? null,
      avisoWebhook,
    });
  } catch (e) {
    return falha(e);
  }
}
