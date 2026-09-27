import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/tipos-banco';

/**
 * De qual campanha o lead veio, e o que a IA deve fazer com ele.
 *
 * Uma campanha pode vender um produto direto e outra levar para um
 * procedimento que exige avaliação; a IA não pode tratar os dois do mesmo
 * jeito. O modo e as instruções ficam na própria campanha, em
 * `filtro_publico.ia` (a tabela não tem coluna para isso):
 *   { modo: 'agendamento' | 'venda', instrucoes: string }
 * Lead sem campanha (chegou sozinho) segue o modo agendamento.
 */

export type ModoCampanha = 'agendamento' | 'venda';

export type CampanhaDoLead = {
  nome: string;
  objetivo: string | null;
  mensagem: string;
  modo: ModoCampanha;
  instrucoes: string;
};

export async function campanhaDoLead(
  cliente: SupabaseClient<Database>,
  conversaId: string,
): Promise<CampanhaDoLead | null> {
  const { data: conversa } = await cliente
    .from('conversas')
    .select('paciente_id')
    .eq('id', conversaId)
    .maybeSingle();
  if (!conversa) return null;

  // A campanha mais recente que falou com a pessoa é a que ela está respondendo.
  const { data: envio } = await cliente
    .from('envios_campanha')
    .select('campanhas(nome, objetivo, modelo_mensagem, filtro_publico)')
    .eq('paciente_id', conversa.paciente_id)
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle();

  const campanha = envio?.campanhas as {
    nome: string;
    objetivo: string | null;
    modelo_mensagem: string;
    filtro_publico: unknown;
  } | null;
  if (!campanha) return null;

  const ia = ((campanha.filtro_publico ?? {}) as { ia?: { modo?: string; instrucoes?: string } }).ia;
  return {
    nome: campanha.nome,
    objetivo: campanha.objetivo,
    mensagem: campanha.modelo_mensagem,
    modo: ia?.modo === 'venda' ? 'venda' : 'agendamento',
    instrucoes: ia?.instrucoes?.trim() ?? '',
  };
}
