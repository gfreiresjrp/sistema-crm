import { anonimo, erro, exigirUsuario, falha, segredo } from '@/lib/servidor/banco';
import { detalhesDoChat } from '@/lib/servidor/uazapi';
import { baixarImagemComoDataUrl } from '@/lib/servidor/imagem';

/**
 * Renova foto de perfil (e nome provisório) de contatos.
 *
 * A caixa de entrada chama aqui para quem está sem foto, com a URL antiga
 * (que expira) ou ainda identificado só pelo telefone. Pergunta à UazApi a
 * miniatura atual, baixa e guarda a imagem em si em `pacientes.foto_url`; se
 * o contato tem nome no WhatsApp e aqui só o telefone, o nome entra junto.
 * Precisa de um número conectado na clínica; sem isso responde vazio, sem
 * erro — é a situação normal fora do horário.
 */
const MAXIMO_POR_CHAMADA = 15;

export async function POST(req: Request) {
  try {
    const autorizacao = await exigirUsuario(req);
    if (autorizacao instanceof Response) return autorizacao;

    const { pacienteIds } = (await req.json()) as { pacienteIds?: string[] };
    const ids = Array.isArray(pacienteIds) ? pacienteIds.slice(0, MAXIMO_POR_CHAMADA) : [];
    if (ids.length === 0) return erro('Informe os contatos.');

    // RLS: só vêm os pacientes da clínica de quem chama.
    const { data: pacientes } = await autorizacao.cliente
      .from('pacientes')
      .select('id, clinica_id, telefone, nome_completo, foto_url, foto_origem')
      .in('id', ids);

    if (!pacientes?.length) return Response.json({ atualizados: [] });

    const { data: numeroChip } = await autorizacao.cliente
      .from('numeros_whatsapp')
      .select('id')
      .eq('clinica_id', pacientes[0].clinica_id)
      .eq('ativo', true)
      .eq('status', 'conectado')
      .limit(1)
      .maybeSingle();

    if (!numeroChip) return Response.json({ atualizados: [], motivo: 'sem número conectado' });

    const { data: credencial } = await anonimo().rpc('wa_ler_credencial', {
      p_segredo: await segredo(),
      p_numero_id: numeroChip.id,
    });
    const token = credencial?.[0]?.token;
    if (!token) return Response.json({ atualizados: [], motivo: 'número sem instância' });

    const atualizados: Array<{ id: string; foto_url: string | null }> = [];

    for (const paciente of pacientes) {
      try {
        const detalhes = await detalhesDoChat(token, paciente.telefone);
        const origem = detalhes.imagePreview || detalhes.image || null;

        // Nome provisório (igual ao telefone) dá lugar ao nome do WhatsApp.
        const nome = [detalhes.wa_contactName, detalhes.wa_name, detalhes.name]
          .map((t) => (typeof t === 'string' ? t.trim() : ''))
          .find((t) => t && t.replace(/\D/g, '') !== paciente.telefone);
        if (nome && paciente.nome_completo === paciente.telefone) {
          await autorizacao.cliente
            .from('pacientes')
            .update({ nome_completo: nome })
            .eq('id', paciente.id);
          atualizados.push({ id: paciente.id, foto_url: paciente.foto_url });
        }

        if (!origem) {
          // Sem foto no WhatsApp: limpa o que estava expirado para parar de tentar.
          if (paciente.foto_url) {
            await autorizacao.cliente
              .from('pacientes')
              .update({ foto_url: null, foto_origem: null })
              .eq('id', paciente.id);
            atualizados.push({ id: paciente.id, foto_url: null });
          }
          continue;
        }

        // Mesma URL e imagem já guardada: nada a fazer.
        if (origem === paciente.foto_origem && paciente.foto_url?.startsWith('data:')) continue;

        const dataUrl = await baixarImagemComoDataUrl(origem);
        await autorizacao.cliente
          .from('pacientes')
          .update({ foto_url: dataUrl, foto_origem: origem })
          .eq('id', paciente.id);
        atualizados.push({ id: paciente.id, foto_url: dataUrl });
      } catch (e) {
        console.error('[fotos]', paciente.id, e instanceof Error ? e.message : e);
      }
    }

    return Response.json({ atualizados });
  } catch (e) {
    return falha(e);
  }
}
