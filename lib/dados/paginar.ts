/**
 * O Supabase devolve no máximo 1.000 linhas por consulta (`max_rows` do
 * projeto), mesmo com `.limit()` maior — e corta calado, sem erro. Toda
 * leitura que pode passar disso (contatos, itens de lista, envios) vem por
 * aqui, página a página, até acabar.
 *
 * Serve ao navegador e ao servidor: não depende de qual cliente montou a
 * consulta.
 */

export const PAGINA = 1000;

type Pagina<T> = PromiseLike<{ data: T[] | null; error: unknown }>;

/**
 * `montar(de, ate)` devolve a consulta com `.range(de, ate)` aplicado. A
 * consulta precisa de ordem estável (de preferência terminando em `id`), senão
 * uma linha pode cair em duas páginas ou em nenhuma.
 */
export async function buscarTodas<T>(
  montar: (de: number, ate: number) => Pagina<T>,
): Promise<{ data: T[] | null; error: unknown }> {
  const todas: T[] = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await montar(de, de + PAGINA - 1);
    if (error) return { data: null, error };
    todas.push(...(data ?? []));
    if (!data || data.length < PAGINA) return { data: todas, error: null };
  }
}

/**
 * Filtros `.in()` vão na URL; com milhares de valores ela passa do tamanho
 * que o servidor aceita e a consulta falha. Fatias deste tamanho cabem com
 * folga mesmo com UUIDs.
 */
export const BLOCO_IN = 200;

export function emBlocos<T>(itens: T[], tamanho = BLOCO_IN): T[][] {
  const blocos: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) blocos.push(itens.slice(i, i + tamanho));
  return blocos;
}
