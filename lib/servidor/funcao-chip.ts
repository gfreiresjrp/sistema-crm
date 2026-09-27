import { atualizarCamposAdmin, statusInstancia } from './uazapi';

/**
 * Qual o papel de cada chip na operação.
 *
 * A Impéria trabalha assim: os chips de disparo (Envio 01, 02…) mandam as
 * campanhas e a IA conversa com quem responde; o chip principal só recebe quem
 * a IA já qualificou, e ali quem atende é a equipe.
 *
 * O papel vive em dois lugares, cada um para quem consegue lê-lo:
 *  - no banco, `peso_rotacao = 0` marca o principal — é o que as telas e o
 *    disparo (com a sessão do usuário) enxergam, e o que tira o principal da
 *    rotação de campanhas;
 *  - na UazApi, nos campos administrativos da instância — é o que o webhook
 *    enxerga, porque ele não tem usuário e o RLS esconde `numeros_whatsapp`.
 *    `adminField01` guarda o papel e a clínica ("disparo|<clinica_id>") e
 *    `adminField02` o id (no banco) do principal da clínica, para o disparo
 *    saber para onde passar o lead. A clínica é o que deixa o servidor entrar
 *    com o login da IA (`robo.ts`).
 */

export type FuncaoChip = {
  principal: boolean;
  principalId: string | null;
  clinicaId: string | null;
};

export const MARCA_PRINCIPAL = 'principal';
export const MARCA_DISPARO = 'disparo';

export async function lerFuncao(token: string): Promise<FuncaoChip> {
  const estado = await statusInstancia(token);
  const instancia = estado.instance ?? {};
  const [papel, clinicaId] = (instancia.adminField01 ?? '').split('|');
  return {
    principal: papel === MARCA_PRINCIPAL,
    principalId: instancia.adminField02?.trim() || null,
    clinicaId: clinicaId?.trim() || null,
  };
}

/** Grava o papel do chip e aponta para o principal da clínica. */
export async function gravarFuncao(
  token: string,
  funcao: { principal: boolean; principalId: string | null; clinicaId: string },
): Promise<void> {
  const estado = await statusInstancia(token);
  const id = estado.instance?.id;
  if (!id) throw new Error('Instância sem identificador na UazApi.');
  await atualizarCamposAdmin(id, {
    adminField01: `${funcao.principal ? MARCA_PRINCIPAL : MARCA_DISPARO}|${funcao.clinicaId}`,
    adminField02: funcao.principalId ?? '',
  });
}
