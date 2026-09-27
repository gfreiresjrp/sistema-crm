import {
  anonimo,
  erro,
  exigirUsuario,
  falha,
  normalizarTelefone,
  segredo,
} from '@/lib/servidor/banco';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/tipos-banco';
import { checarNumeros, criarDisparo } from '@/lib/servidor/uazapi';

/**
 * Troca os marcadores da mensagem pelos dados do contato.
 *
 * Sem nome cadastrado (ou com o telefone no lugar do nome), "Oi {{primeiro_nome}}!"
 * vira "Oi!" — melhor do que chamar alguém de "5551...".
 */
function personalizar(modelo: string, nomeCompleto: string | null): string {
  const nome = (nomeCompleto ?? '').trim();
  const valido = nome && !/^[\d\s()+-]+$/.test(nome);
  const primeiro = valido ? nome.split(/\s+/)[0] : '';
  const formatado = primeiro
    ? primeiro.charAt(0).toUpperCase() + primeiro.slice(1).toLowerCase()
    : '';
  return modelo
    .replace(/\{\{\s*primeiro_nome\s*\}\}/g, formatado)
    .replace(/\{\{\s*nome\s*\}\}/g, valido ? nome : '')
    .replace(/ +([!?,.])/g, '$1')
    .replace(/ {2,}/g, ' ')
    .trim();
}

/**
 * Põe a mensagem da campanha na conversa de cada contato.
 *
 * Sem isto o disparo só existia na UazApi: a Tati abria Conversas, não via
 * nada, e concluía que a campanha não tinha saído. A mensagem também é o
 * começo do histórico que a IA lê quando o lead responde — sem ela, um "sim,
 * quero" chegava sem nenhum contexto.
 *
 * A conversa passa a usar o chip que disparou: é para ele que o lead vai
 * responder, e a resposta da equipe precisa sair do mesmo número.
 */
async function registrarNasConversas(
  cliente: SupabaseClient<Database>,
  entrada: {
    clinicaId: string;
    numeroId: string;
    mensagens: Array<{ pacienteId: string; texto: string }>;
  },
) {
  const pacientes = entrada.mensagens.map((m) => m.pacienteId);
  const { data: existentes } = await cliente
    .from('conversas')
    .select('id, paciente_id')
    .eq('clinica_id', entrada.clinicaId)
    .eq('canal', 'whatsapp')
    .in('paciente_id', pacientes);

  const conversaDe = new Map((existentes ?? []).map((c) => [c.paciente_id, c.id]));
  const faltando = pacientes.filter((id) => !conversaDe.has(id));

  if (faltando.length) {
    const { data: novas } = await cliente
      .from('conversas')
      .insert(
        faltando.map((pacienteId) => ({
          clinica_id: entrada.clinicaId,
          paciente_id: pacienteId,
          canal: 'whatsapp' as const,
          numero_whatsapp_id: entrada.numeroId,
        })),
      )
      .select('id, paciente_id');
    for (const c of novas ?? []) conversaDe.set(c.paciente_id, c.id);
  }

  const conversas = [...new Set(conversaDe.values())];
  if (conversas.length === 0) return;

  await cliente
    .from('conversas')
    .update({ numero_whatsapp_id: entrada.numeroId })
    .in('id', conversas);

  const { error } = await cliente.from('mensagens').insert(
    entrada.mensagens
      .filter((m) => conversaDe.has(m.pacienteId))
      .map((m) => ({
      clinica_id: entrada.clinicaId,
      conversa_id: conversaDe.get(m.pacienteId)!,
      autor: 'sistema' as const,
      direcao: 'saida' as const,
      conteudo: m.texto,
      numero_whatsapp_id: entrada.numeroId,
      status: 'pendente' as const,
    })),
  );
  // O disparo já está na fila da UazApi; falhar aqui não pode desfazê-lo.
  if (error) console.error('[disparar] mensagem da campanha fora da conversa:', error.message);
}

/**
 * Dispara uma campanha de reativação.
 *
 * O público sai do filtro salvo na campanha; a UazApi cuida da fila e do
 * intervalo entre envios, que é o que protege o número do bloqueio. Cada
 * destinatário vira uma linha em `envios_campanha`, e é dela que o funil da
 * tela de Reativação se alimenta.
 */
export async function POST(req: Request) {
  try {
    const autorizacao = await exigirUsuario(req);
    if (autorizacao instanceof Response) return autorizacao;

    const { campanhaId } = (await req.json()) as { campanhaId?: string };
    if (!campanhaId) return erro('Informe a campanha.');

    // RLS: a campanha só existe para quem é da clínica.
    const { data: campanha } = await autorizacao.cliente
      .from('campanhas')
      .select('id, clinica_id, nome, modelo_mensagem, status, envios_por_hora, filtro_publico')
      .eq('id', campanhaId)
      .maybeSingle();

    if (!campanha) return erro('Campanha não encontrada.', 404);
    if (!campanha.modelo_mensagem?.trim()) {
      return erro('Escreva a mensagem da campanha antes de disparar.');
    }

    /**
     * Número que dispara: o escolhido para a campanha, se houver; senão o
     * conectado com maior peso na rotação. Um número escolhido mas fora do ar
     * não cai na rotação em silêncio — a pessoa escolheu aquele chip por um
     * motivo (aquecimento, reputação), e o erro deixa isso claro.
     */
    const { data: escolhidos } = await autorizacao.cliente
      .from('campanha_numeros')
      .select('numero_whatsapp_id, numeros_whatsapp(id, apelido, ativo, status)')
      .eq('campanha_id', campanha.id);

    const escolhido = (escolhidos ?? [])
      .map((v) => v.numeros_whatsapp as { id: string; apelido: string; ativo: boolean; status: string } | null)
      .find((n) => n?.ativo);

    let numeroChip: { id: string } | null = null;

    if (escolhido) {
      if (escolhido.status !== 'conectado') {
        return erro(
          `O número "${escolhido.apelido}", responsável por esta campanha, não está conectado.`,
          409,
        );
      }
      numeroChip = { id: escolhido.id };
    } else {
      const { data: rotacao } = await autorizacao.cliente
        .from('numeros_whatsapp')
        .select('id')
        .eq('clinica_id', campanha.clinica_id)
        .eq('ativo', true)
        .eq('status', 'conectado')
        .order('peso_rotacao', { ascending: false })
        .limit(1)
        .maybeSingle();
      numeroChip = rotacao ?? null;
    }

    if (!numeroChip) {
      return erro(
        'Nenhum número conectado. Conecte um em Minha clínica › Números de WhatsApp.',
        409,
      );
    }

    // Público: quem aceita marketing e ainda não recebeu esta campanha.
    const { data: jaEnviados } = await autorizacao.cliente
      .from('envios_campanha')
      .select('paciente_id')
      .eq('campanha_id', campanha.id);

    const excluir = new Set((jaEnviados ?? []).map((e) => e.paciente_id));

    // Público: a lista escolhida na campanha ou, sem lista, toda a base.
    const filtro = (campanha.filtro_publico ?? {}) as { lista_id?: string };
    let consultaPublico = autorizacao.cliente
      .from('pacientes')
      .select('id, nome_completo, telefone')
      .eq('clinica_id', campanha.clinica_id)
      .eq('aceita_marketing', true)
      .is('excluido_em', null)
      .limit(1000);

    if (filtro.lista_id) {
      const { data: itens } = await autorizacao.cliente
        .from('listas_leads_itens')
        .select('paciente_id')
        .eq('lista_id', filtro.lista_id)
        .limit(5000);
      const idsDaLista = (itens ?? []).map((i) => i.paciente_id);
      if (idsDaLista.length === 0) {
        return erro('A lista escolhida para esta campanha está vazia.', 409);
      }
      consultaPublico = consultaPublico.in('id', idsDaLista);
    }

    const { data: publico } = await consultaPublico;
    const destinatarios = (publico ?? []).filter((p) => !excluir.has(p.id));
    if (destinatarios.length === 0) {
      return erro('Nenhum contato novo para esta campanha.', 409);
    }

    const chave = await segredo();
    const { data: credencial } = await anonimo().rpc('wa_ler_credencial', {
      p_segredo: chave,
      p_numero_id: numeroChip.id,
    });

    const linha = credencial?.[0];
    if (!linha) return erro('O número conectado não tem instância vinculada.', 409);

    // Gastar disparo com quem não tem WhatsApp só queima reputação do número.
    const telefones = destinatarios.map((p) => normalizarTelefone(p.telefone));
    const conferidos = await checarNumeros(linha.token, telefones);
    const validos = new Set(
      conferidos.filter((c) => c.isInWhatsapp).map((c) => c.query.replace(/\D/g, '')),
    );

    const alvos = destinatarios.filter((p) => validos.has(normalizarTelefone(p.telefone)));
    if (alvos.length === 0) {
      return erro('Nenhum dos contatos tem WhatsApp ativo.', 409);
    }

    /**
     * Intervalo entre uma mensagem e a próxima, com folga aleatória.
     *
     * Sai do ritmo da campanha (envios por hora): 240/h dá 10–20 s entre
     * mensagens. O ritmo antigo de 60/h espaçava 42–84 s e fazia uma lista
     * pequena parecer travada — a Tati via uma mensagem sair e achava que o
     * resto não ia.
     */
    const porHora = Math.max(1, campanha.envios_por_hora ?? 240);
    const medioSegundos = Math.max(4, Math.round(3600 / porHora));

    const disparo = await criarDisparo(linha.token, {
      mensagens: alvos.map((p) => ({
        numero: normalizarTelefone(p.telefone),
        texto: personalizar(campanha.modelo_mensagem, p.nome_completo),
      })),
      pasta: `${campanha.nome} (${campanha.id.slice(0, 8)})`,
      atrasoMin: Math.max(3, Math.round(medioSegundos * 0.65)),
      atrasoMax: Math.round(medioSegundos * 1.35),
    });

    // Cada destinatário vira uma linha do funil da campanha.
    const { error: erroEnvios } = await autorizacao.cliente.from('envios_campanha').insert(
      alvos.map((p) => ({
        clinica_id: campanha.clinica_id,
        campanha_id: campanha.id,
        paciente_id: p.id,
        numero_whatsapp_id: numeroChip.id,
        status: 'pendente' as const,
        mensagem_enviada: personalizar(campanha.modelo_mensagem, p.nome_completo),
        agendado_para: new Date().toISOString(),
      })),
    );
    if (erroEnvios) return erro(erroEnvios.message, 500);

    await registrarNasConversas(autorizacao.cliente, {
      clinicaId: campanha.clinica_id,
      numeroId: numeroChip.id,
      mensagens: alvos.map((p) => ({
        pacienteId: p.id,
        texto: personalizar(campanha.modelo_mensagem, p.nome_completo),
      })),
    });

    // A pasta é a chave para reconciliar depois quem de fato recebeu.
    await autorizacao.cliente
      .from('campanhas')
      .update({ status: 'em_andamento', pasta_externa: disparo.folder_id ?? null })
      .eq('id', campanha.id);

    return Response.json({
      ok: true,
      enviados: alvos.length,
      ignorados: destinatarios.length - alvos.length,
      pasta: disparo.folder_id ?? null,
    });
  } catch (e) {
    return falha(e);
  }
}
