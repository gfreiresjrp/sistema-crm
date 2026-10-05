import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/tipos-banco';
import { SUPABASE_CHAVE_PUBLICA, SUPABASE_URL } from '@/lib/supabase/ambiente-publico';
import { comoUsuario, segredo } from './banco';

/**
 * O login da IA.
 *
 * O servidor não tem chave-mestra, e o webhook e o agendador não têm usuário
 * — então não enxergavam a agenda, e a IA prometia "vou verificar um horário e
 * já te retorno" sem ter como cumprir. A IA passa a ter um login próprio de
 * atendente na clínica, criado pela mesma função que cria os logins da equipe;
 * com ele, tudo que ela faz passa pelo RLS como o de qualquer atendente.
 *
 * A senha não fica guardada em lugar nenhum: é derivada do segredo do servidor
 * e da clínica, então só o servidor consegue entrar com ela.
 */

type Cliente = SupabaseClient<Database>;

export function emailDoRobo(clinicaId: string): string {
  return `assistente-ia.${clinicaId}@cliniia.local`;
}

export async function senhaDoRobo(clinicaId: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${await segredo()}:robo:${clinicaId}`);
  const digerido = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digerido)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const sessoes = new Map<string, { jwt: string; expiraEm: number }>();

async function entrar(clinicaId: string): Promise<string | null> {
  const guardada = sessoes.get(clinicaId);
  if (guardada && guardada.expiraEm > Date.now() + 60_000) return guardada.jwt;

  const anonimo = createClient<Database>(
    SUPABASE_URL,
    SUPABASE_CHAVE_PUBLICA,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await anonimo.auth.signInWithPassword({
    email: emailDoRobo(clinicaId),
    password: await senhaDoRobo(clinicaId),
  });
  if (error || !data.session) return null;

  sessoes.set(clinicaId, {
    jwt: data.session.access_token,
    expiraEm: (data.session.expires_at ?? 0) * 1000,
  });
  return data.session.access_token;
}

/** Cliente com a sessão da IA na clínica, ou nulo se o login não foi ativado. */
export async function clienteDoRobo(clinicaId: string): Promise<Cliente | null> {
  const jwt = await entrar(clinicaId);
  return jwt ? comoUsuario(jwt) : null;
}

/**
 * Cria (ou recupera) o login da IA. Precisa de um gestor: é a mesma regra
 * que vale para criar qualquer login da equipe.
 */
export async function ativarRobo(
  gestor: Cliente,
  clinicaId: string,
): Promise<{ ok: boolean; erro?: string }> {
  if (await entrar(clinicaId)) return { ok: true };

  const email = emailDoRobo(clinicaId);
  const senha = await senhaDoRobo(clinicaId);

  const { error } = await gestor.rpc('criar_usuario_da_clinica', {
    p_clinica_id: clinicaId,
    p_email: email,
    p_senha: senha,
    p_nome: 'Assistente IA',
    p_papel: 'atendente',
  });

  if (error) {
    // Já existe (senha antiga, segredo trocado): redefine pela regra da equipe.
    const { data: membro } = await gestor
      .from('membros_clinica')
      .select('id, perfis!inner(email)')
      .eq('clinica_id', clinicaId)
      .eq('perfis.email', email)
      .maybeSingle();
    if (!membro) return { ok: false, erro: error.message };
    const { error: erroSenha } = await gestor.rpc('redefinir_senha_membro', {
      p_membro_id: membro.id,
      p_senha: senha,
    });
    if (erroSenha) return { ok: false, erro: erroSenha.message };
  }

  sessoes.delete(clinicaId);
  return (await entrar(clinicaId)) ? { ok: true } : { ok: false, erro: 'login criado, mas não entrou' };
}
