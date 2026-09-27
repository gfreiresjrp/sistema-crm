import {
  anonimo,
  comoUsuario,
  erro,
  exigirUsuario,
  falha,
  jwtDaRequisicao,
  normalizarTelefone,
  segredo,
} from '@/lib/servidor/banco';
import { enviarMidia, type TipoMidia } from '@/lib/servidor/uazapi';

/**
 * Envia uma mídia já guardada no nosso armazenamento.
 *
 * O navegador sobe o arquivo direto para o Storage (passando pelo RLS) e manda
 * aqui só o caminho. O servidor gera uma URL assinada de curta duração e
 * entrega à UazApi, que busca o arquivo. Assim o binário não trafega duas
 * vezes, e o link nunca fica público.
 */

const TIPOS: Record<string, { uaz: TipoMidia; banco: string }> = {
  imagem: { uaz: 'image', banco: 'imagem' },
  audio: { uaz: 'ptt', banco: 'audio' },
  video: { uaz: 'video', banco: 'video' },
  documento: { uaz: 'document', banco: 'documento' },
};

export async function POST(req: Request) {
  try {
    const autorizacao = await exigirUsuario(req);
    if (autorizacao instanceof Response) return autorizacao;

    const { conversaId, caminho, tipo, legenda, nomeArquivo, mimetype } = (await req.json()) as {
      conversaId?: string;
      caminho?: string;
      tipo?: string;
      legenda?: string | null;
      nomeArquivo?: string | null;
      mimetype?: string | null;
    };

    if (!conversaId || !caminho) return erro('Informe a conversa e o arquivo.');

    const mapeado = TIPOS[tipo ?? ''];
    if (!mapeado) return erro('Tipo de mídia não suportado.');

    const { data: conversa } = await autorizacao.cliente
      .from('conversas')
      .select('id, clinica_id, numero_whatsapp_id, pacientes(telefone)')
      .eq('id', conversaId)
      .maybeSingle();

    if (!conversa) return erro('Conversa não encontrada.', 404);

    // O caminho carrega a clínica no primeiro segmento; conferir aqui impede
    // que alguém mande o arquivo de outra clínica pela própria conversa.
    if (!caminho.startsWith(`${conversa.clinica_id}/`)) {
      return erro('Arquivo não pertence a esta clínica.', 403);
    }

    const destino = normalizarTelefone(
      (conversa.pacientes as { telefone: string } | null)?.telefone ?? '',
    );
    if (!destino) return erro('Este contato não tem telefone cadastrado.');

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
    const { data: credencial } = await anonimo().rpc('wa_ler_credencial', {
      p_segredo: chave,
      p_numero_id: numeroId,
    });

    const linha = credencial?.[0];
    if (!linha) return erro('Este número ainda não foi pareado com o WhatsApp.', 409);

    // Assinatura curta: a UazApi busca o arquivo em seguida, não depois.
    const jwt = jwtDaRequisicao(req)!;
    const { data: assinada, error: erroAssinatura } = await comoUsuario(jwt)
      .storage.from('midias')
      .createSignedUrl(caminho, 600);

    if (erroAssinatura || !assinada?.signedUrl) {
      return erro(erroAssinatura?.message ?? 'Não foi possível liberar o arquivo.', 500);
    }

    const enviada = await enviarMidia(linha.token, {
      destino,
      tipo: mapeado.uaz,
      arquivo: assinada.signedUrl,
      legenda: legenda ?? null,
      nomeDocumento: mapeado.uaz === 'document' ? (nomeArquivo ?? null) : null,
      mimetype: mimetype ?? null,
    });

    const idExterno = enviada?.id ?? enviada?.messageid ?? enviada?.key?.id ?? null;

    const { data: registro, error } = await autorizacao.cliente
      .from('mensagens')
      .insert({
        clinica_id: conversa.clinica_id,
        conversa_id: conversa.id,
        autor: 'humano',
        direcao: 'saida',
        tipo_conteudo: mapeado.banco as never,
        conteudo: legenda?.trim() || null,
        // Guardamos o caminho, não a URL assinada: ela expira em minutos.
        midia_url: caminho,
        numero_whatsapp_id: numeroId,
        identificador_externo: idExterno,
        status: 'enviada',
      })
      .select('id')
      .single();

    if (error) return erro(error.message, 500);

    if (!conversa.numero_whatsapp_id) {
      await autorizacao.cliente
        .from('conversas')
        .update({ numero_whatsapp_id: numeroId })
        .eq('id', conversa.id);
    }

    return Response.json({ ok: true, mensagemId: registro.id });
  } catch (e) {
    return falha(e);
  }
}
