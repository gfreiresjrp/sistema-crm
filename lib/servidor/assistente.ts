import { moeda } from '@/lib/dados/formato';
import { anonimo, segredo } from './banco';
import { gerarResposta, type Fala } from './openai';
import { enviarTexto } from './uazapi';

/**
 * A assistente que responde os pacientes no WhatsApp.
 *
 * O prompt é o que a clínica escreveu na tela Configurar IA. Os marcadores
 * dele são trocados aqui por dados vivos do banco — preço de procedimento,
 * limite de desconto, histórico da conversa — para que a resposta nunca dependa
 * de a clínica ter lembrado de atualizar o texto do prompt.
 */

type Contexto = {
  ia_ativa: boolean;
  clinica: string | null;
  fuso: string | null;
  config: {
    nome_assistente: string;
    tom_voz: string;
    mensagem_apresentacao: string | null;
    instrucoes_adicionais: string | null;
    prompt_sistema: string | null;
    modelo_ia: string;
    atendimento_24h: boolean;
    quebra_objecoes: boolean;
    desconto_maximo_percentual: number | null;
    valor_minimo_entrada: number | null;
    maximo_parcelas: number | null;
    silencio_inicio: string | null;
    silencio_fim: string | null;
    escalar_para_humano_apos: number | null;
  } | null;
  paciente: { nome: string; telefone: string; interesse: string | null; situacao: string } | null;
  procedimentos: Array<{
    nome: string;
    descricao: string | null;
    duracao_minutos: number | null;
    valor: number | null;
  }>;
  conhecimento: Array<{ pergunta: string; resposta: string }>;
  mensagens: Array<{ autor: string; conteudo: string }>;
};

const TOM: Record<string, string> = {
  acolhedor: 'Fale de forma acolhedora e profissional, com calor humano e sem exageros.',
  direto: 'Fale de forma direta e objetiva, sem rodeios, indo ao ponto.',
  descontraido: 'Fale de forma leve e descontraída, próxima, sem perder o respeito.',
  formal: 'Fale de forma formal e cerimoniosa, tratando por senhor ou senhora.',
};

/** "23:00" fica dentro de 21:00–08:00; a janela cruza a meia-noite. */
function dentroDoSilencio(agora: string, inicio: string | null, fim: string | null): boolean {
  if (!inicio || !fim) return false;
  const min = (h: string) => {
    const [hh, mm] = h.split(':');
    return Number(hh) * 60 + Number(mm ?? 0);
  };
  const a = min(agora);
  const i = min(inicio);
  const f = min(fim);
  return i <= f ? a >= i && a < f : a >= i || a < f;
}

function horaLocal(fuso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: fuso,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
}

function montarPrompt(contexto: Contexto): string {
  const c = contexto.config!;

  const procedimentos = contexto.procedimentos.length
    ? contexto.procedimentos
        .map((p) => {
          const partes = [`- ${p.nome}`];
          if (p.valor) partes.push(`${moeda(p.valor, true)}`);
          if (p.duracao_minutos) partes.push(`${p.duracao_minutos} min`);
          const linha = partes.join(' — ');
          return p.descricao ? `${linha}\n  ${p.descricao}` : linha;
        })
        .join('\n')
    : 'A clínica ainda não cadastrou procedimentos. Não cite valores: diga que vai confirmar com a equipe.';

  const limites = [
    c.quebra_objecoes
      ? `Desconto máximo: ${c.desconto_maximo_percentual ?? 0}%.`
      : 'Você não está autorizada a negociar desconto.',
    c.valor_minimo_entrada ? `Entrada mínima: ${moeda(c.valor_minimo_entrada, true)}.` : null,
    c.maximo_parcelas ? `Parcelamento em até ${c.maximo_parcelas}x.` : null,
  ]
    .filter(Boolean)
    .join(' ');

  const conhecimento = contexto.conhecimento.length
    ? contexto.conhecimento.map((k) => `P: ${k.pergunta}\nR: ${k.resposta}`).join('\n\n')
    : 'Nada cadastrado ainda.';

  const paciente = contexto.paciente
    ? [
        `Nome: ${contexto.paciente.nome}`,
        contexto.paciente.interesse ? `Interesse: ${contexto.paciente.interesse}` : null,
        `Situação: ${contexto.paciente.situacao}`,
      ]
        .filter(Boolean)
        .join('. ')
    : 'Contato novo, ainda sem cadastro.';

  const valores: Record<string, string> = {
    assistente: c.nome_assistente,
    clinica: contexto.clinica ?? 'clínica',
    tom: TOM[c.tom_voz] ?? TOM.acolhedor,
    apresentacao: c.mensagem_apresentacao ?? '',
    procedimentos,
    limites,
    conhecimento,
    paciente,
    instrucoes: c.instrucoes_adicionais ?? '',
  };

  const modelo = c.prompt_sistema?.trim() || '';
  return modelo.replace(/\{\{(\w+)\}\}/g, (inteiro, chave: string) =>
    chave in valores ? valores[chave] : inteiro,
  );
}

export type ResultadoAssistente =
  | { respondeu: true; texto: string }
  | { respondeu: false; motivo: string };

/**
 * Decide se responde e, se sim, responde.
 *
 * As recusas são silenciosas de propósito: um horário de silêncio ou uma
 * conversa assumida por humano não são erro, são o comportamento correto.
 */
export async function responderConversa(
  conversaId: string,
  token: string,
  telefone: string,
): Promise<ResultadoAssistente> {
  const chave = await segredo();
  const servidor = anonimo();

  const { data, error } = await servidor.rpc('wa_contexto_assistente', {
    p_segredo: chave,
    p_conversa_id: conversaId,
  });

  if (error) return { respondeu: false, motivo: error.message };

  const contexto = data as unknown as Contexto;
  const c = contexto.config;

  if (!c) return { respondeu: false, motivo: 'clínica sem configuração de IA' };
  if (!contexto.ia_ativa) return { respondeu: false, motivo: 'conversa assumida por humano' };
  if (!c.atendimento_24h) return { respondeu: false, motivo: 'atendimento automático desligado' };

  const fuso = contexto.fuso ?? 'America/Sao_Paulo';
  if (dentroDoSilencio(horaLocal(fuso), c.silencio_inicio, c.silencio_fim)) {
    return { respondeu: false, motivo: 'horário de silêncio' };
  }

  /*
   * Não há mais corte por número de respostas. O limite
   * `escalar_para_humano_apos` (3 por padrão, e sem campo na tela) fazia a IA
   * se calar para sempre na quarta mensagem de qualquer conversa: a troca para
   * atendimento humano tentava gravar sem permissão, falhava em silêncio, e a
   * conversa seguia marcada como automática sem ninguém responder. Quem passa a
   * conversa para uma pessoa é o botão "Assumir conversa".
   */

  const prompt = montarPrompt(contexto);
  if (!prompt.trim()) return { respondeu: false, motivo: 'prompt vazio' };

  const falas: Fala[] = [
    { papel: 'system', texto: prompt },
    ...contexto.mensagens.map<Fala>((m) => ({
      papel: m.autor === 'paciente' ? 'user' : 'assistant',
      texto: m.conteudo,
    })),
  ];

  const texto = await gerarResposta({ modelo: c.modelo_ia, falas });

  const enviada = await enviarTexto(token, telefone, texto);
  const idExterno = enviada?.id ?? enviada?.messageid ?? enviada?.key?.id ?? null;

  await servidor.rpc('wa_registrar_resposta_ia', {
    p_segredo: chave,
    p_conversa_id: conversaId,
    p_conteudo: texto,
    p_id_externo: idExterno,
  });

  return { respondeu: true, texto };
}
