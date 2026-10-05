import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/tipos-banco';
import { gerarResposta } from './openai';

/**
 * Confirma o agendamento quando o paciente responde ao lembrete.
 *
 * O lembrete pergunta "Podemos confirmar sua presença?" e a resposta ("sim",
 * "confirmado", "estarei lá") ficava parada até alguém da equipe ler e mudar o
 * status à mão. Aqui a IA lê a resposta e, se for um sim claro, confirma.
 * Cancelamento e pedido de troca ficam com a equipe: o agendamento não muda
 * sozinho para algo que exija conversa.
 *
 * Roda com o login da IA (robo.ts), então passa pelo RLS como uma atendente.
 */

type Cliente = SupabaseClient<Database>;

/** Só vale resposta a lembrete enviado há pouco. */
const JANELA_HORAS = 48;

export async function confirmarPeloLembrete(
  cliente: Cliente,
  conversaId: string,
): Promise<'confirmado' | 'nada'> {
  const { data: conversa } = await cliente
    .from('conversas')
    .select('paciente_id')
    .eq('id', conversaId)
    .maybeSingle();
  if (!conversa) return 'nada';

  const desde = new Date(Date.now() - JANELA_HORAS * 3600_000).toISOString();

  // Agendamento futuro esperando confirmação, com lembrete enviado há pouco.
  const { data: agendamentos } = await cliente
    .from('agendamentos')
    .select('id, inicio, lembretes_agendamento!inner(enviado_em, status)')
    .eq('paciente_id', conversa.paciente_id)
    .in('status', ['aguardando_confirmacao', 'remarcado'])
    .gt('inicio', new Date().toISOString())
    .eq('lembretes_agendamento.status', 'enviado')
    .gte('lembretes_agendamento.enviado_em', desde)
    .order('inicio')
    .limit(1);
  const agendamento = agendamentos?.[0];
  if (!agendamento) return 'nada';

  const lembretes = agendamento.lembretes_agendamento as Array<{ enviado_em: string | null }>;
  const enviadoEm = lembretes
    .map((l) => l.enviado_em ?? '')
    .sort()
    .at(-1);

  // O que o paciente escreveu depois do lembrete.
  const { data: respostas } = await cliente
    .from('mensagens')
    .select('conteudo')
    .eq('conversa_id', conversaId)
    .eq('autor', 'paciente')
    .gt('criado_em', enviadoEm ?? desde)
    .not('conteudo', 'is', null)
    .order('criado_em');
  const texto = (respostas ?? []).map((r) => r.conteudo).join('\n').trim();
  if (!texto) return 'nada';

  const bruto = await gerarResposta({
    modelo: 'gpt-4o-mini',
    json: true,
    temperatura: 0,
    maximoTokens: 30,
    falas: [
      {
        papel: 'system',
        texto: `Uma clínica perguntou ao paciente se ele confirma a presença no horário marcado. Classifique a resposta dele.
Responda só com JSON: {"resposta": "confirma" | "cancela" | "remarca" | "outro"}
- "confirma": sim claro ("sim", "confirmo", "estarei lá", "pode confirmar", "👍").
- "cancela": não vai / quer desmarcar.
- "remarca": quer outro dia ou horário.
- "outro": dúvida, pergunta ou qualquer coisa que não seja uma confirmação clara.`,
      },
      { papel: 'user', texto },
    ],
  });

  let resposta = 'outro';
  try {
    resposta = (JSON.parse(bruto) as { resposta?: string }).resposta ?? 'outro';
  } catch {
    // Resposta ilegível: na dúvida, não mexe na agenda.
  }
  if (resposta !== 'confirma') return 'nada';

  const { error } = await cliente
    .from('agendamentos')
    .update({ status: 'confirmado' })
    .eq('id', agendamento.id);
  if (error) throw new Error(error.message);
  return 'confirmado';
}
