import {
  anonimo,
  erro,
  exigirUsuario,
  falha,
  normalizarTelefone,
  segredo,
} from '@/lib/servidor/banco';
import { enviarTexto } from '@/lib/servidor/uazapi';
import { escutarAgendamento } from '@/lib/servidor/escuta-agenda';
import { emSegundoPlano } from '@/lib/servidor/segundo-plano';

/**
 * Envia uma mensagem de uma conversa pelo WhatsApp e grava o registro.
 *
 * A gravação usa o id devolvido pela UazApi como `identificador_externo`, o
 * que faz o eco do webhook cair no índice de unicidade em vez de duplicar a
 * mensagem na tela.
 */
export async function POST(req: Request) {
  try {
    const autorizacao = await exigirUsuario(req);
    if (autorizacao instanceof Response) return autorizacao;

    const { conversaId, texto } = (await req.json()) as {
      conversaId?: string;
      texto?: string;
    };

    const conteudo = (texto ?? '').trim();
    if (!conversaId || !conteudo) return erro('Informe a conversa e o texto.');

    // Tudo abaixo passa pelo RLS: a conversa só aparece para quem é da clínica.
    const { data: conversa } = await autorizacao.cliente
      .from('conversas')
      .select('id, clinica_id, numero_whatsapp_id, pacientes(telefone)')
      .eq('id', conversaId)
      .maybeSingle();

    if (!conversa) return erro('Conversa não encontrada.', 404);

    const destino = normalizarTelefone(
      (conversa.pacientes as { telefone: string } | null)?.telefone ?? '',
    );
    if (!destino) return erro('Este contato não tem telefone cadastrado.');

    // O número da conversa, ou qualquer um conectado da clínica.
    let numeroId = conversa.numero_whatsapp_id;

    /*
     * Conversa sem chip gravado: vale o chip pelo qual o contato falou por
     * último. O banco só grava o chip ao criar a conversa, então uma conversa
     * aberta à mão e respondida depois pelo WhatsApp ficava sem ele — e a
     * resposta saía por um número qualquer da rotação.
     */
    if (!numeroId) {
      const { data: ultima } = await autorizacao.cliente
        .from('mensagens')
        .select('numero_whatsapp_id')
        .eq('conversa_id', conversa.id)
        .not('numero_whatsapp_id', 'is', null)
        .order('criado_em', { ascending: false })
        .limit(1)
        .maybeSingle();
      numeroId = ultima?.numero_whatsapp_id ?? null;
    }

    if (!numeroId) {
      const { data: disponivel } = await autorizacao.cliente
        .from('numeros_whatsapp')
        .select('id')
        .eq('clinica_id', conversa.clinica_id)
        .eq('ativo', true)
        .eq('status', 'conectado')
        .order('peso_rotacao', { ascending: false })
        .limit(1)
        .maybeSingle();
      numeroId = disponivel?.id ?? null;
    }

    if (!numeroId) {
      return erro(
        'Nenhum número de WhatsApp conectado. Conecte um em Minha clínica › Números de WhatsApp.',
        409,
      );
    }

    const chave = await segredo();
    const servidor = anonimo();
    const { data: credencial } = await servidor.rpc('wa_ler_credencial', {
      p_segredo: chave,
      p_numero_id: numeroId,
    });

    const linha = credencial?.[0];
    if (!linha) return erro('Este número ainda não foi pareado com o WhatsApp.', 409);

    const enviada = await enviarTexto(linha.token, destino, conteudo);
    const idExterno = enviada?.id ?? enviada?.messageid ?? enviada?.key?.id ?? null;

    const { data: registro, error } = await autorizacao.cliente
      .from('mensagens')
      .insert({
        clinica_id: conversa.clinica_id,
        conversa_id: conversa.id,
        autor: 'humano',
        direcao: 'saida',
        conteudo,
        numero_whatsapp_id: numeroId,
        identificador_externo: idExterno,
        status: 'enviada',
      })
      .select('id')
      .single();

    if (error) return erro(error.message, 500);

    // Se a conversa ainda não tinha número, fixa o que acabou de atender.
    if (!conversa.numero_whatsapp_id) {
      await autorizacao.cliente
        .from('conversas')
        .update({ numero_whatsapp_id: numeroId })
        .eq('id', conversa.id);
    }

    // Mensagem pelo principal: a IA escuta e agenda se a atendente fechou horário.
    const { data: chip } = await autorizacao.cliente
      .from('numeros_whatsapp')
      .select('peso_rotacao')
      .eq('id', numeroId)
      .maybeSingle();
    if (chip?.peso_rotacao === 0) {
      await emSegundoPlano(
        escutarAgendamento(autorizacao.cliente, conversa.id).catch((e) =>
          console.error('[escuta]', e instanceof Error ? e.message : e),
        ),
      );
    }

    return Response.json({ ok: true, mensagemId: registro.id, idExterno });
  } catch (e) {
    return falha(e);
  }
}
