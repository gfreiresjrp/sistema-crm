import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/tipos-banco';
import { localParaUtc as localParaUtcPartes } from './agenda';
import { gerarResposta } from './openai';

/**
 * A IA escutando o chip principal.
 *
 * No principal quem conversa é a atendente; a IA não responde ali. Mas quando
 * a conversa fecha um horário ("fechado, terça às 14h"), é ela quem põe na
 * agenda — a atendente não precisa sair do WhatsApp para cadastrar.
 *
 * Roda com um cliente que respeita o RLS: o login da IA (webhook) ou a sessão
 * de quem enviou pelo sistema (rota de envio).
 */

type Cliente = SupabaseClient<Database>;

export type ResultadoEscuta =
  | { acao: 'nenhuma'; motivo: string }
  | { acao: 'criado' | 'remarcado'; agendamentoId: string; inicio: string };

/** "2026-09-29T14:00" no fuso da clínica → instante UTC. */
function localParaUtc(local: string, fuso: string): Date {
  const [data, hora] = local.split('T');
  const [a, m, d] = data.split('-').map(Number);
  const [h, min] = (hora ?? '00:00').split(':').map(Number);
  return localParaUtcPartes(a, m, d, h, min, fuso);
}

function agoraNoFuso(fuso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: fuso,
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date());
}

export async function escutarAgendamento(
  cliente: Cliente,
  conversaId: string,
): Promise<ResultadoEscuta> {
  const { data: conversa } = await cliente
    .from('conversas')
    .select('id, clinica_id, unidade_id, paciente_id')
    .eq('id', conversaId)
    .maybeSingle();
  if (!conversa) return { acao: 'nenhuma', motivo: 'conversa não encontrada' };

  const [{ data: mensagens }, { data: clinica }, { data: procedimentos }, { data: profissionais }] =
    await Promise.all([
      cliente
        .from('mensagens')
        .select('autor, conteudo, criado_em')
        .eq('conversa_id', conversaId)
        .not('conteudo', 'is', null)
        .order('criado_em', { ascending: false })
        .limit(25),
      cliente.from('clinicas').select('fuso_horario').eq('id', conversa.clinica_id).maybeSingle(),
      cliente
        .from('procedimentos')
        .select('id, nome, duracao_minutos')
        .eq('clinica_id', conversa.clinica_id)
        .eq('ativo', true),
      cliente
        .from('profissionais')
        .select('id, nome')
        .eq('clinica_id', conversa.clinica_id)
        .eq('ativo', true),
    ]);

  // Só vale o que a equipe disse: sem mensagem humana, não há confirmação.
  const historico = (mensagens ?? []).reverse();
  if (!historico.some((m) => m.autor === 'humano')) {
    return { acao: 'nenhuma', motivo: 'a equipe ainda não falou nesta conversa' };
  }

  const fuso = clinica?.fuso_horario || 'America/Sao_Paulo';
  const quem: Record<string, string> = {
    paciente: 'CLIENTE',
    humano: 'ATENDENTE',
    ia: 'ASSISTENTE',
    sistema: 'CLÍNICA',
  };

  const bruto = await gerarResposta({
    modelo: 'gpt-4o-mini',
    json: true,
    temperatura: 0,
    maximoTokens: 200,
    falas: [
      {
        papel: 'system',
        texto: `Você lê conversas de WhatsApp de uma clínica estética e identifica se um agendamento foi FECHADO.
Agora é ${agoraNoFuso(fuso)} (fuso ${fuso}).

Responda só com JSON:
{"agendado": false, "inicio": "", "procedimento_id": null, "profissional_id": null}

- "agendado": true SOMENTE se a ATENDENTE confirmou um dia e um horário específicos para o cliente vir (ex.: "agendado para terça às 14h", "fechado, dia 30 às 10h", "te espero amanhã 15h") e o cliente não recusou depois. Sugestões, perguntas ("pode terça?"), horários em aberto ou só o cliente propondo NÃO contam.
- "inicio": data e hora confirmadas no formato AAAA-MM-DDTHH:MM, no horário local da clínica. Resolva "amanhã", "terça" etc. a partir de agora.
- "procedimento_id": o id do procedimento combinado, se estiver claro na conversa; senão null.
- "profissional_id": o id da profissional combinada, se citada; senão null.

Procedimentos: ${JSON.stringify(procedimentos ?? [])}
Profissionais: ${JSON.stringify(profissionais ?? [])}`,
      },
      {
        papel: 'user',
        texto: historico.map((m) => `${quem[m.autor] ?? m.autor}: ${m.conteudo}`).join('\n'),
      },
    ],
  });

  let decisao: {
    agendado?: boolean;
    inicio?: string;
    procedimento_id?: string | null;
    profissional_id?: string | null;
  };
  try {
    decisao = JSON.parse(bruto);
  } catch {
    return { acao: 'nenhuma', motivo: 'resposta da IA ilegível' };
  }

  if (!decisao.agendado || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(decisao.inicio ?? '')) {
    return { acao: 'nenhuma', motivo: 'nenhum horário fechado na conversa' };
  }

  const inicio = localParaUtc(decisao.inicio!, fuso);
  if (Number.isNaN(inicio.getTime()) || inicio.getTime() < Date.now() - 60 * 60 * 1000) {
    return { acao: 'nenhuma', motivo: 'horário no passado' };
  }

  // Só aceita ids que existem de fato — a IA não pode inventar cadastro.
  const procedimento = (procedimentos ?? []).find((p) => p.id === decisao.procedimento_id) ?? null;
  const profissional = (profissionais ?? []).find((p) => p.id === decisao.profissional_id) ?? null;
  const duracao = procedimento?.duracao_minutos || 60;
  const fim = new Date(inicio.getTime() + duracao * 60 * 1000);

  // Já existe horário futuro para esta pessoa? Então é remarcação, não outro agendamento.
  const { data: existente } = await cliente
    .from('agendamentos')
    .select('id, inicio')
    .eq('clinica_id', conversa.clinica_id)
    .eq('paciente_id', conversa.paciente_id)
    .is('cancelado_em', null)
    .not('status', 'in', '(cancelado,faltou,concluido,compareceu)')
    .gte('inicio', new Date(Date.now() - 60 * 60 * 1000).toISOString())
    .order('inicio')
    .limit(1)
    .maybeSingle();

  if (existente) {
    if (Math.abs(new Date(existente.inicio).getTime() - inicio.getTime()) < 60 * 1000) {
      return { acao: 'nenhuma', motivo: 'este horário já está na agenda' };
    }
    const { error } = await cliente
      .from('agendamentos')
      .update({
        inicio: inicio.toISOString(),
        fim: fim.toISOString(),
        status: 'remarcado',
        ...(procedimento ? { procedimento_id: procedimento.id } : {}),
        ...(profissional ? { profissional_id: profissional.id } : {}),
      })
      .eq('id', existente.id);
    if (error) return { acao: 'nenhuma', motivo: error.message };
    return { acao: 'remarcado', agendamentoId: existente.id, inicio: inicio.toISOString() };
  }

  let unidadeId = conversa.unidade_id;
  if (!unidadeId) {
    const { data: unidade } = await cliente
      .from('unidades')
      .select('id')
      .eq('clinica_id', conversa.clinica_id)
      .order('criado_em')
      .limit(1)
      .maybeSingle();
    unidadeId = unidade?.id ?? null;
  }
  if (!unidadeId) return { acao: 'nenhuma', motivo: 'clínica sem unidade cadastrada' };

  const { data: criado, error } = await cliente
    .from('agendamentos')
    .insert({
      clinica_id: conversa.clinica_id,
      unidade_id: unidadeId,
      paciente_id: conversa.paciente_id,
      procedimento_id: procedimento?.id ?? null,
      profissional_id: profissional?.id ?? null,
      inicio: inicio.toISOString(),
      fim: fim.toISOString(),
      origem: 'whatsapp',
      agendado_pela_ia: true,
      observacoes: 'Agendado pela IA a partir da conversa no WhatsApp.',
    })
    .select('id')
    .single();
  if (error || !criado) return { acao: 'nenhuma', motivo: error?.message ?? 'falha ao agendar' };

  return { acao: 'criado', agendamentoId: criado.id, inicio: inicio.toISOString() };
}
