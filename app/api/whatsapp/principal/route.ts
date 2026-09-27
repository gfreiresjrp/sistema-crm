import { anonimo, erro, exigirUsuario, falha, numeroDoUsuario, segredo } from '@/lib/servidor/banco';
import { gravarFuncao } from '@/lib/servidor/funcao-chip';
import { ativarRobo } from '@/lib/servidor/robo';

/**
 * Define qual chip da clínica é o principal — o que recebe os leads já
 * qualificados pela IA. `numeroId` nulo deixa a clínica sem principal (a IA
 * volta a atender até o fim em cada chip).
 *
 * Grava nos dois lugares descritos em `funcao-chip.ts`: `peso_rotacao` no
 * banco e os campos administrativos de cada instância na UazApi. Um chip ainda
 * não pareado não tem instância; ele recebe o papel quando for conectado de
 * novo por esta mesma tela.
 */
export async function POST(req: Request) {
  try {
    const autorizacao = await exigirUsuario(req);
    if (autorizacao instanceof Response) return autorizacao;

    const { numeroId, clinicaId: informada } = (await req.json()) as {
      numeroId?: string | null;
      clinicaId?: string;
    };

    let clinicaId: string;
    if (numeroId) {
      const escolhido = await numeroDoUsuario(autorizacao.cliente, numeroId);
      if (!escolhido) return erro('Número não encontrado nesta clínica.', 404);
      clinicaId = escolhido.clinica_id;
    } else {
      if (!informada) return erro('Informe o número ou a clínica.');
      clinicaId = informada;
    }

    // RLS: só aparecem os números das clínicas de quem chamou.
    const { data: numeros, error } = await autorizacao.cliente
      .from('numeros_whatsapp')
      .select('id, peso_rotacao')
      .eq('clinica_id', clinicaId)
      .eq('ativo', true);
    if (error) return erro(error.message, 500);
    if (!numeros?.length) return erro('Nenhum número nesta clínica.', 404);

    for (const n of numeros) {
      const principal = n.id === numeroId;
      const peso = principal ? 0 : Math.max(1, n.peso_rotacao);
      if (peso !== n.peso_rotacao) {
        const { error: erroPeso } = await autorizacao.cliente
          .from('numeros_whatsapp')
          .update({ peso_rotacao: peso })
          .eq('id', n.id);
        if (erroPeso) return erro(erroPeso.message, 500);
      }
    }

    const chave = await segredo();
    const servidor = anonimo();
    const semInstancia: string[] = [];

    for (const n of numeros) {
      const { data: credencial } = await servidor.rpc('wa_ler_credencial', {
        p_segredo: chave,
        p_numero_id: n.id,
      });
      const token = credencial?.[0]?.token;
      if (!token) {
        semInstancia.push(n.id);
        continue;
      }
      try {
        await gravarFuncao(token, {
          principal: n.id === numeroId,
          principalId: numeroId ?? null,
          clinicaId,
        });
      } catch {
        semInstancia.push(n.id);
      }
    }

    // A IA precisa do próprio login para ler a agenda e agendar pelo principal.
    const robo = await ativarRobo(autorizacao.cliente, clinicaId);

    return Response.json({ ok: true, principal: numeroId ?? null, semInstancia, robo });
  } catch (e) {
    return falha(e);
  }
}
