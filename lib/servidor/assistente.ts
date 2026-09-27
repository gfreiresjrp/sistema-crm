import { moeda } from '@/lib/dados/formato';
import { anonimo, segredo } from './banco';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/tipos-banco';
import { horariosLivres, type HorarioLivre } from './agenda';
import { lerFuncao } from './funcao-chip';
import { clienteDoRobo } from './robo';
import { gerarResposta, type Fala } from './openai';
import { enviarTexto, estaConectado, marcarComoLido, statusInstancia } from './uazapi';

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

/**
 * Marca invisível no fim da mensagem com que o chip principal assume o lead.
 * É por ela que a IA do chip de disparo sabe que aquela pessoa já foi passada
 * adiante e não deve mais responder — nem se o lead voltar a escrever na
 * conversa antiga.
 */
const MARCA_PASSAGEM = '\u2063';

/**
 * As regras de agenda e o formato da resposta.
 *
 * A IA não consegue voltar a falar sozinha: ela só responde quando o lead
 * escreve. "Vou verificar um horário e já te retorno" era uma promessa que
 * nunca se cumpria — o lead ficava esperando. Por isso ela recebe os horários
 * livres de verdade e oferece na mesma mensagem, ou, sem agenda, passa para a
 * equipe.
 */
function instrucoesDeResposta(entrada: {
  livres: HorarioLivre[] | null;
  temPrincipal: boolean;
}): string {
  // Agrupa por dia: "terça-feira, 30/09: 9h=2026-09-30T09:00, 10h=…".
  const porDia = new Map<string, string[]>();
  for (const h of entrada.livres ?? []) {
    const dia = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'UTC',
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
    }).format(new Date(`${h.local.slice(0, 10)}T12:00:00Z`));
    const lista = porDia.get(dia) ?? [];
    const [hh, mm] = h.local.slice(11).split(':');
    lista.push(`${Number(hh)}h${mm === '00' ? '' : mm}=${h.local}`);
    porDia.set(dia, lista);
  }
  const agenda = entrada.livres?.length
    ? [...porDia.entries()].map(([dia, horas]) => `- ${dia}: ${horas.join(', ')}`).join('\n')
    : null;

  const regrasAgenda = agenda
    ? `AGENDA (horários livres para avaliação; o código depois do "=" é só para o campo "horario")
${agenda}
- Quando a pessoa aceitar ou pedir para marcar, a sua mensagem JÁ traz 2 ou 3 destes horários escritos por extenso (no formato "tenho [dia] às [hora], [dia] às [hora] ou [dia] às [hora], qual fica melhor?", sempre com horários tirados da lista acima — varie os dias e prefira os mais próximos). Nunca pergunte "qual horário você prefere?" sem listar as opções, e nunca ofereça horário fora desta lista.
- Quando ela escolher um, preencha "horario" com o código dele.`
    : `AGENDA
- Você não tem a agenda agora. Quando a pessoa quiser marcar, diga que a equipe vai combinar o melhor horário com ela.`;

  const regrasPassagem = entrada.temPrincipal
    ? `- "qualificado": true quando a pessoa escolheu um horário da lista, ou pediu para falar com alguém da equipe, ou quer fechar e só falta combinar valores. Curiosidade vaga, "só estou olhando", resposta negativa ou pedido para parar de receber mensagens NÃO qualificam.
Quando "qualificado" for true, a "mensagem" deve, curta e natural, confirmar o horário escolhido (se houver) e avisar que uma especialista da equipe vai continuar o atendimento em instantes pelo número oficial da clínica. Não cite valores nesse caso.`
    : `- "qualificado": sempre false.
Quando a pessoa escolher um horário, a "mensagem" deve confirmar que ficou reservado e que a equipe vai confirmar com ela.`;

  return `

NUNCA diga que vai verificar algo e retornar depois ("vou ver e já te retorno", "aguarde que já te respondo"). Você só consegue falar quando a pessoa escreve: tudo o que tiver para dizer, diga agora.

${regrasAgenda}

FORMATO DA RESPOSTA
Responda sempre com um objeto JSON, sem nada fora dele:
{"mensagem": "...", "qualificado": false, "interesse": "", "horario": ""}
- "mensagem": o texto que vai para o WhatsApp do contato, seguindo todas as regras acima.
${regrasPassagem}
- "interesse": o procedimento ou assunto que a pessoa quer, em poucas palavras (ex.: "harmonização facial"). Vazio se ainda não souber.
- "horario": o código do horário que a pessoa escolheu nesta conversa, ou vazio.`;
}

type Decisao = { mensagem: string; qualificado: boolean; interesse: string; horario: string };

function lerDecisao(bruto: string): Decisao {
  try {
    const dados = JSON.parse(bruto) as Partial<Decisao>;
    const mensagem = typeof dados.mensagem === 'string' ? dados.mensagem.trim() : '';
    if (mensagem) {
      return {
        mensagem,
        qualificado: dados.qualificado === true,
        interesse: typeof dados.interesse === 'string' ? dados.interesse.trim() : '',
        horario: typeof dados.horario === 'string' ? dados.horario.trim() : '',
      };
    }
  } catch {
    // Veio texto solto em vez de JSON: ainda é uma resposta válida.
  }
  return { mensagem: bruto.trim(), qualificado: false, interesse: '', horario: '' };
}

function primeiroNome(nome: string | undefined): string {
  const limpo = (nome ?? '').trim();
  if (!limpo || /^[\d\s()+-]+$/.test(limpo)) return '';
  const primeiro = limpo.split(/\s+/)[0];
  return primeiro.charAt(0).toUpperCase() + primeiro.slice(1).toLowerCase();
}

function mensagemDaPassagem(
  contexto: Contexto,
  interesse: string,
  horario: HorarioLivre | null,
): string {
  const nome = primeiroNome(contexto.paciente?.nome);
  const clinica = contexto.clinica ?? 'clínica';
  const assistente = contexto.config?.nome_assistente ?? 'nossa assistente';
  const assunto = interesse ? `, e vi que você tem interesse em ${interesse}` : '';
  const quando = horario ? ` Seu horário de ${horario.rotulo} já está separado.` : '';
  return (
    `Oi${nome ? `, ${nome}` : ''}! Aqui é a equipe da ${clinica} 💛 ` +
    `A ${assistente} me passou seu contato${assunto}.${quando} ` +
    `Vou continuar seu atendimento por aqui, tudo bem?${MARCA_PASSAGEM}`
  );
}

/** Separa o horário escolhido pelo lead, aguardando a equipe confirmar. */
async function reservarHorario(
  robo: SupabaseClient<Database>,
  conversaId: string,
  horario: HorarioLivre,
  interesse: string,
) {
  const { data: conversa } = await robo
    .from('conversas')
    .select('clinica_id, unidade_id, paciente_id')
    .eq('id', conversaId)
    .maybeSingle();
  if (!conversa) return;

  let unidadeId = conversa.unidade_id;
  if (!unidadeId) {
    const { data: unidade } = await robo
      .from('unidades')
      .select('id')
      .eq('clinica_id', conversa.clinica_id)
      .order('criado_em')
      .limit(1)
      .maybeSingle();
    unidadeId = unidade?.id ?? null;
  }
  if (!unidadeId) return;

  const { error } = await robo.from('agendamentos').insert({
    clinica_id: conversa.clinica_id,
    unidade_id: unidadeId,
    paciente_id: conversa.paciente_id,
    inicio: horario.inicio.toISOString(),
    fim: new Date(horario.inicio.getTime() + 60 * 60_000).toISOString(),
    status: 'aguardando_confirmacao',
    origem: 'whatsapp',
    agendado_pela_ia: true,
    observacoes: `Horário escolhido pelo lead com a IA${interesse ? ` (${interesse})` : ''}. Falta a equipe confirmar.`,
  });
  if (error) throw new Error(error.message);
}

/** Credencial do chip principal, se ele existir e estiver no ar. */
async function principalDisponivel(
  principalId: string | null,
): Promise<{ instancia: string; token: string } | null> {
  if (!principalId) return null;
  const { data } = await anonimo().rpc('wa_ler_credencial', {
    p_segredo: await segredo(),
    p_numero_id: principalId,
  });
  const credencial = data?.[0];
  if (!credencial?.token) return null;
  try {
    return estaConectado(await statusInstancia(credencial.token)) ? credencial : null;
  } catch {
    return null;
  }
}

/**
 * O ritmo de uma pessoa, não de um robô.
 *
 * Resposta em um segundo denuncia a automação e assusta o lead. O minuto de
 * espera vem da fila (`fila-ia.ts`); aqui a IA abre a conversa, marca como
 * vista e digita por um tempo proporcional ao tamanho do texto (com
 * "digitando..." aparecendo para o contato). Cada resposta fica abaixo de ~20 s
 * porque roda em `waitUntil`, que o Workers mantém vivo por até 30 s.
 */
const esperar = (ms: number) => new Promise((pronto) => setTimeout(pronto, ms));
const entre = (min: number, max: number) => min + Math.random() * (max - min);

function tempoDigitando(texto: string): number {
  // ~35 caracteres por segundo no celular, entre 3 e 11 segundos.
  return Math.round(Math.min(11000, Math.max(3000, (texto.length / 35) * 1000 + entre(0, 1500))));
}

export type ResultadoAssistente =
  | { respondeu: true; texto: string; passouParaPrincipal: boolean }
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
  opcoes?: { simular?: boolean },
): Promise<ResultadoAssistente> {
  const chave = await segredo();
  const servidor = anonimo();

  // No chip principal quem atende é a equipe: ali só chega lead qualificado.
  const funcao = await lerFuncao(token).catch(() => ({
    principal: false,
    principalId: null,
    clinicaId: null,
  }));
  if (funcao.principal) return { respondeu: false, motivo: 'chip principal é atendido pela equipe' };

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

  /*
   * Sem horário de silêncio. A tela Configurar IA só mostra "Atendimento
   * automático 24h"; a janela `silencio_inicio`–`silencio_fim` (21h–08h por
   * padrão) não aparece em lugar nenhum e calava a IA toda noite, com a chave
   * de 24h ligada. Se um dia a clínica quiser silêncio, ele precisa ter campo
   * na tela antes de voltar a valer aqui.
   */

  /*
   * Não há mais corte por número de respostas. O limite
   * `escalar_para_humano_apos` (3 por padrão, e sem campo na tela) fazia a IA
   * se calar para sempre na quarta mensagem de qualquer conversa: a troca para
   * atendimento humano tentava gravar sem permissão, falhava em silêncio, e a
   * conversa seguia marcada como automática sem ninguém responder. Quem passa a
   * conversa para uma pessoa é o botão "Assumir conversa".
   */

  if (contexto.mensagens.some((m) => m.conteudo?.includes(MARCA_PASSAGEM))) {
    return { respondeu: false, motivo: 'lead já passado para o chip principal' };
  }

  // O lead já esperou o minuto da fila; aqui é só o instante de abrir a
  // conversa antes do visto.
  if (!opcoes?.simular) {
    await esperar(entre(1000, 2500));
    await marcarComoLido(token, telefone).catch(() => {
      // Sem o visto a resposta ainda precisa sair.
    });
  }

  const prompt = montarPrompt(contexto);
  if (!prompt.trim()) return { respondeu: false, motivo: 'prompt vazio' };

  // A agenda de verdade, pelo login da IA na clínica (ver robo.ts).
  const robo = funcao.clinicaId ? await clienteDoRobo(funcao.clinicaId).catch(() => null) : null;
  const livres =
    robo && funcao.clinicaId
      ? await horariosLivres(robo, {
          clinicaId: funcao.clinicaId,
          fuso: contexto.fuso ?? 'America/Sao_Paulo',
          dias: 7,
          limite: 36,
        }).catch(() => null)
      : null;

  const temPrincipal = Boolean(funcao.principalId);
  const falas: Fala[] = [
    { papel: 'system', texto: prompt + instrucoesDeResposta({ livres, temPrincipal }) },
    ...contexto.mensagens.map<Fala>((m) => ({
      papel: m.autor === 'paciente' ? 'user' : 'assistant',
      texto: m.conteudo,
    })),
  ];

  const decisao = lerDecisao(await gerarResposta({ modelo: c.modelo_ia, falas, json: true }));
  // Só vale horário que está de fato livre — a IA não inventa agenda.
  const escolhido = (livres ?? []).find((h) => h.local === decisao.horario) ?? null;

  // A passagem só acontece se o principal estiver no ar; senão a IA segue
  // atendendo, e o aviso de "a especialista vai te chamar" não pode sair.
  const principal =
    temPrincipal && decisao.qualificado ? await principalDisponivel(funcao.principalId) : null;
  const texto =
    decisao.qualificado && temPrincipal && !principal
      ? lerDecisao(
          await gerarResposta({
            modelo: c.modelo_ia,
            falas: [
              ...falas,
              {
                papel: 'system',
                texto:
                  'A equipe não está disponível agora. Responda com "qualificado": false e siga você mesma o atendimento, oferecendo ajuda com o próximo passo.',
              },
            ],
            json: true,
          }),
        ).mensagem
      : decisao.mensagem;

  // Simulação (rota de diagnóstico): mostra o que a IA faria, sem enviar.
  if (opcoes?.simular) {
    return {
      respondeu: true,
      texto: `${texto} [agenda: ${livres ? `${livres.length} horários livres` : 'sem acesso'}${escolhido ? `; escolheu ${escolhido.rotulo}` : ''}${decisao.qualificado ? `; qualificado: ${decisao.interesse}; principal ${principal ? 'no ar' : 'fora do ar'}` : ''}]`,
      passouParaPrincipal: false,
    };
  }

  const enviada = await enviarTexto(token, telefone, texto, tempoDigitando(texto));
  const idExterno = enviada?.id ?? enviada?.messageid ?? enviada?.key?.id ?? null;

  await servidor.rpc('wa_registrar_resposta_ia', {
    p_segredo: chave,
    p_conversa_id: conversaId,
    p_conteudo: texto,
    p_id_externo: idExterno,
  });

  /*
   * Horário escolhido: fica separado na agenda como "aguardando confirmação".
   * Segura a vaga — a IA não oferece o mesmo horário a outro lead — e a
   * atendente confirma ou troca pela conversa (a escuta do principal acerta).
   */
  if (escolhido && robo && (principal || !temPrincipal)) {
    await reservarHorario(robo, conversaId, escolhido, decisao.interesse).catch((e) =>
      console.error('[assistente] reserva:', e instanceof Error ? e.message : e),
    );
  }

  if (!principal) return { respondeu: true, texto, passouParaPrincipal: false };

  /*
   * A passagem: o chip principal chama o lead. Registrar a mensagem por ele
   * leva a conversa para o principal, que é onde a equipe está olhando.
   */
  const abertura = mensagemDaPassagem(contexto, decisao.interesse, escolhido);
  // Quem assume é uma pessoa: um respiro antes, e digitando.
  // O teto de 6 s na digitação mantém a passagem inteira dentro dos 30 s.
  await esperar(entre(1500, 2500));
  const saida = await enviarTexto(
    principal.token,
    telefone,
    abertura,
    Math.min(6000, tempoDigitando(abertura)),
  );
  await servidor.rpc('wa_registrar_mensagem', {
    p_segredo: chave,
    p_instancia: principal.instancia,
    p_telefone: telefone,
    p_conteudo: abertura,
    p_de_mim: true,
    p_id_externo: saida?.id ?? saida?.messageid ?? saida?.key?.id ?? null,
    p_tipo: 'texto',
    p_enviada_pela_api: true,
  });

  return { respondeu: true, texto, passouParaPrincipal: true };
}
