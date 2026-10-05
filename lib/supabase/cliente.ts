import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './tipos-banco';
import { SUPABASE_CHAVE_PUBLICA, SUPABASE_URL } from './ambiente-publico';

/**
 * Cliente Supabase do CliniIA.
 *
 * Usa a chave publicável, que é feita para rodar no navegador: toda a proteção
 * dos dados vem do RLS, não do sigilo da chave. A service_role nunca entra aqui.
 */

const URL = SUPABASE_URL;
const CHAVE = SUPABASE_CHAVE_PUBLICA;

/**
 * Estas variáveis são embutidas no código durante o build, não lidas em
 * execução. Se o build não as recebeu, não há o que fazer em produção além de
 * avisar — por isso a checagem é exposta, e não um erro lançado na importação.
 */
export const CONFIGURADO = Boolean(URL && CHAVE);

export type ClienteCliniIA = SupabaseClient<Database>;

let instancia: ClienteCliniIA | undefined;

/**
 * Cliente compartilhado do navegador. Um único socket de realtime e uma única
 * sessão para toda a aplicação — chamar várias vezes devolve a mesma instância.
 */
export function clienteSupabase(): ClienteCliniIA {
  if (!CONFIGURADO) {
    throw new Error(
      'Faltam VITE_SUPABASE_URL e/ou VITE_SUPABASE_PUBLISHABLE_KEY no build. ' +
        'Local: copie .env.example para .env.local. ' +
        'Produção: defina as duas como variáveis de build da hospedagem.',
    );
  }

  instancia ??= createClient<Database>(URL, CHAVE, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return instancia;
}

/**
 * O cliente só é criado no primeiro uso.
 *
 * Criá-lo na importação fazia um build sem as variáveis derrubar a aplicação
 * inteira com HTTP 500 e nenhuma pista — inclusive a tela que explicaria o
 * problema. Adiando, a falha aparece onde dá para tratá-la.
 */
export const supabase = new Proxy({} as ClienteCliniIA, {
  get(_alvo, propriedade) {
    const cliente = clienteSupabase();
    const valor = Reflect.get(cliente, propriedade, cliente);
    return typeof valor === 'function' ? valor.bind(cliente) : valor;
  },
});
