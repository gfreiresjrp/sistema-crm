import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/tipos-banco';
import { SUPABASE_CHAVE_PUBLICA, SUPABASE_URL } from '@/lib/supabase/ambiente-publico';
import { variavel } from './ambiente';

/**
 * Acesso ao Postgres a partir das rotas de servidor.
 *
 * Não existe chave-mestra neste projeto. São dois caminhos:
 *
 *  - `comoUsuario`: repassa o JWT de quem está logado, então o RLS continua
 *    valendo. É assim que as rotas verificam se a pessoa pode mexer naquele
 *    número — se não puder, a consulta simplesmente não retorna nada.
 *
 *  - `comSegredo`: chama as funções `wa_*`, que são SECURITY DEFINER e exigem
 *    o segredo do servidor. É o único jeito de o webhook gravar sem usuário.
 */

const URL_SUPABASE = SUPABASE_URL;
const CHAVE_PUBLICA = SUPABASE_CHAVE_PUBLICA;

export function comoUsuario(jwt: string): SupabaseClient<Database> {
  return createClient<Database>(URL_SUPABASE, CHAVE_PUBLICA, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function anonimo(): SupabaseClient<Database> {
  return createClient<Database>(URL_SUPABASE, CHAVE_PUBLICA, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function segredo(): Promise<string> {
  return variavel('INTEGRACAO_SEGREDO');
}

/** Lê o JWT do cabeçalho Authorization. */
export function jwtDaRequisicao(req: Request): string | null {
  const cabecalho = req.headers.get('authorization') ?? '';
  const [esquema, valor] = cabecalho.split(' ');
  return esquema?.toLowerCase() === 'bearer' && valor ? valor : null;
}

export type Autorizado = {
  cliente: SupabaseClient<Database>;
  usuarioId: string;
};

/**
 * Exige um usuário logado. Devolve um cliente que carrega o JWT dele, para
 * que toda consulta seguinte passe pelo RLS.
 */
export async function exigirUsuario(req: Request): Promise<Autorizado | Response> {
  const jwt = jwtDaRequisicao(req);
  if (!jwt) return erro('Faça login para continuar.', 401);

  const cliente = comoUsuario(jwt);
  const { data, error } = await cliente.auth.getUser();
  if (error || !data.user) return erro('Sessão inválida ou expirada.', 401);

  return { cliente, usuarioId: data.user.id };
}

/**
 * Confirma que o número pertence a uma clínica de quem está chamando. O RLS
 * faz o trabalho: para quem não é membro, a linha não existe.
 */
export async function numeroDoUsuario(
  cliente: SupabaseClient<Database>,
  numeroId: string,
): Promise<{ id: string; clinica_id: string; apelido: string; numero: string | null } | null> {
  const { data } = await cliente
    .from('numeros_whatsapp')
    .select('id, clinica_id, apelido, numero')
    .eq('id', numeroId)
    .maybeSingle();
  return data ?? null;
}

export function erro(mensagem: string, status = 400): Response {
  return Response.json({ erro: mensagem }, { status });
}

/** Converte a falha em resposta sem vazar detalhe interno ao navegador. */
export function falha(e: unknown): Response {
  const mensagem = e instanceof Error ? e.message : 'Falha inesperada.';
  console.error('[whatsapp]', mensagem);
  const status = (e as { status?: number })?.status;
  return Response.json(
    { erro: mensagem },
    { status: typeof status === 'number' && status >= 400 && status < 600 ? status : 500 },
  );
}

/** Só dígitos, com DDI — o formato que a UazApi espera. */
export function normalizarTelefone(entrada: string): string {
  const digitos = (entrada ?? '').replace(/\D/g, '');
  if (!digitos) return '';
  return digitos.startsWith('55') ? digitos : `55${digitos}`;
}

/**
 * Chave que vai na URL do webhook.
 *
 * É derivada do segredo, não o segredo em si: a URL fica registrada na UazApi
 * e pode aparecer em log de proxy, então quem a vir não ganha o direito de
 * chamar as funções `wa_*` do banco.
 */
export async function chaveWebhook(): Promise<string> {
  const bytes = new TextEncoder().encode(`${await segredo()}:webhook`);
  const digerido = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digerido)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
