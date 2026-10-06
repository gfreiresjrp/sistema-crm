import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/tipos-banco';
import { buscarTodas, emBlocos } from '@/lib/dados/paginar';
import { anonimo, normalizarTelefone, segredo } from './banco';
import { checarNumeros, criarDisparo } from './uazapi';

/**
 * Um lote de campanha: tudo o que o chip ainda pode mandar hoje.
 *
 * O WhatsApp derruba chip que manda demais. Por isso cada chip tem um limite
 * diário (`numeros_whatsapp.limite_diario`) e a campanha não passa dele: sai
 * hoje o que cabe, e o agendador (/api/whatsapp/tarefas) manda o próximo lote
 * no dia seguinte, sozinho, até acabar a lista. O que falta fica em
 * `filtro_publico.faltam`.
 *
 * Quem chama decide com que login: a tela usa a sessão de quem clicou; o
 * agendador usa o login da IA (robo.ts). O RLS vale nos dois casos.
 */

type Cliente = SupabaseClient<Database>;

/** Arquivo que acompanha a campanha, guardado em `filtro_publico.anexo`. */
type AnexoCampanha = {
  caminho: string;
  tipo: 'imagem' | 'documento';
  nome: string | null;
  mimetype: string | null;
};

type Filtro = { lista_id?: string; anexo?: AnexoCampanha; faltam?: number } & Record<string, unknown>;

export class ErroDisparo extends Error {
  constructor(
    message: string,
    readonly status = 409,
  ) {
    super(message);
  }
}

export type ResultadoLote = {
  enviados: number;
  /** Contatos sem WhatsApp, marcados como falha para não serem checados de novo. */
  semWhatsapp: number;
  /** Quantos ainda vão sair nos próximos dias. */
  faltam: number;
  pasta: string | null;
};

/**
 * Troca os marcadores da mensagem pelos dados do contato.
 *
 * Sem nome cadastrado (ou com o telefone no lugar do nome), "Oi {{primeiro_nome}}!"
 * vira "Oi!" — melhor do que chamar alguém de "5551...".
 */
export function personalizar(modelo: string, nomeCompleto: string | null): string {
  const nome = (nomeCompleto ?? '').trim();
  const valido = nome && !/^[\d\s()+-]+$/.test(nome);
  const primeiro = valido ? nome.split(/\s+/)[0] : '';
  const formatado = primeiro
    ? primeiro.charAt(0).toUpperCase() + primeiro.slice(1).toLowerCase()
    : '';
  return modelo
    .replace(/\{\{\s*primeiro_nome\s*\}\}/g, formatado)
    .replace(/\{\{\s*nome\s*\}\}/g, valido ? nome : '')
    .replace(/ +([!?,.])/g, '$1')
    // "Oi, {{primeiro_nome}}, tudo bem?" sem nome não pode virar "Oi,, tudo bem?".
    .replace(/,+(?=[,!?.])/g, '')
    .replace(/ {2,}/g, ' ')
    .trim();
}

/**
 * Põe a mensagem da campanha na conversa de cada contato.
 *
 * Sem isto o disparo só existia na UazApi: a equipe abria Conversas, não via
 * nada, e concluía que a campanha não tinha saído. A mensagem também é o
 * começo do histórico que a IA lê quando o lead responde — sem ela, um "sim,
 * quero" chegava sem nenhum contexto.
 *
 * A conversa passa a usar o chip que disparou: é para ele que o lead vai
 * responder, e a resposta da equipe precisa sair do mesmo número.
 */
async function registrarNasConversas(
  cliente: Cliente,
  entrada: {
    clinicaId: string;
    numeroId: string;
    mensagens: Array<{ pacienteId: string; texto: string }>;
    anexo: AnexoCampanha | null;
  },
) {
  const pacientes = entrada.mensagens.map((m) => m.pacienteId);
  const { data: existentes } = await cliente
    .from('conversas')
    .select('id, paciente_id')
    .eq('clinica_id', entrada.clinicaId)
    .eq('canal', 'whatsapp')
    .in('paciente_id', pacientes);

  const conversaDe = new Map((existentes ?? []).map((c) => [c.paciente_id, c.id]));
  const faltando = pacientes.filter((id) => !conversaDe.has(id));

  if (faltando.length) {
    const { data: novas } = await cliente
      .from('conversas')
      .insert(
        faltando.map((pacienteId) => ({
          clinica_id: entrada.clinicaId,
          paciente_id: pacienteId,
          canal: 'whatsapp' as const,
          numero_whatsapp_id: entrada.numeroId,
        })),
      )
      .select('id, paciente_id');
    for (const c of novas ?? []) conversaDe.set(c.paciente_id, c.id);
  }

  const conversas = [...new Set(conversaDe.values())];
  if (conversas.length === 0) return;

  await cliente
    .from('conversas')
    .update({ numero_whatsapp_id: entrada.numeroId })
    .in('id', conversas);

  const { error } = await cliente.from('mensagens').insert(
    entrada.mensagens
      .filter((m) => conversaDe.has(m.pacienteId))
      .map((m) => ({
        clinica_id: entrada.clinicaId,
        conversa_id: conversaDe.get(m.pacienteId)!,
        autor: 'sistema' as const,
        direcao: 'saida' as const,
        conteudo: m.texto || null,
        ...(entrada.anexo
          ? { tipo_conteudo: entrada.anexo.tipo, midia_url: entrada.anexo.caminho }
          : {}),
        numero_whatsapp_id: entrada.numeroId,
        status: 'pendente' as const,
      })),
  );
  // O disparo já está na fila da UazApi; falhar aqui não pode desfazê-lo.
  if (error) console.error('[disparo] mensagem da campanha fora da conversa:', error.message);
}

/** Chip que dispara: o escolhido para a campanha, ou o conectado de maior peso. */
async function chipDaCampanha(cliente: Cliente, campanhaId: string, clinicaId: string) {
  const { data: escolhidos } = await cliente
    .from('campanha_numeros')
    .select(
      'numero_whatsapp_id, numeros_whatsapp(id, apelido, ativo, status, peso_rotacao, limite_diario, enviados_hoje)',
    )
    .eq('campanha_id', campanhaId);

  type Chip = {
    id: string;
    apelido: string;
    ativo: boolean;
    status: string;
    peso_rotacao: number;
    limite_diario: number;
    enviados_hoje: number;
  };

  const escolhido = (escolhidos ?? [])
    .map((v) => v.numeros_whatsapp as Chip | null)
    .find((n) => n?.ativo);

  if (escolhido) {
    // O principal só recebe leads qualificados; disparar por ele queimaria
    // o número que a equipe usa para fechar.
    if (escolhido.peso_rotacao === 0) {
      throw new ErroDisparo(
        `"${escolhido.apelido}" é o chip principal e não dispara campanhas. Escolha um chip de disparo.`,
      );
    }
    if (escolhido.status !== 'conectado') {
      throw new ErroDisparo(
        `O número "${escolhido.apelido}", responsável por esta campanha, não está conectado.`,
      );
    }
    return escolhido;
  }

  const { data: rotacao } = await cliente
    .from('numeros_whatsapp')
    .select('id, apelido, ativo, status, peso_rotacao, limite_diario, enviados_hoje')
    .eq('clinica_id', clinicaId)
    .eq('ativo', true)
    .eq('status', 'conectado')
    .gt('peso_rotacao', 0)
    .order('peso_rotacao', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!rotacao) {
    throw new ErroDisparo(
      'Nenhum chip de disparo conectado. Conecte um em Minha clínica › Números de WhatsApp (o principal não dispara).',
    );
  }
  return rotacao as Chip;
}

export async function dispararLote(cliente: Cliente, campanhaId: string): Promise<ResultadoLote> {
  // RLS: a campanha só existe para quem é da clínica.
  const { data: campanha } = await cliente
    .from('campanhas')
    .select('id, clinica_id, nome, modelo_mensagem, status, envios_por_hora, filtro_publico, pasta_externa')
    .eq('id', campanhaId)
    .maybeSingle();
  if (!campanha) throw new ErroDisparo('Campanha não encontrada.', 404);

  const filtro = (campanha.filtro_publico ?? {}) as Filtro;
  const anexo = filtro.anexo ?? null;
  if (!campanha.modelo_mensagem?.trim() && !anexo) {
    throw new ErroDisparo('Escreva a mensagem ou anexe um arquivo antes de disparar.', 400);
  }

  const chip = await chipDaCampanha(cliente, campanha.id, campanha.clinica_id);
  const folga = Math.max(0, chip.limite_diario - chip.enviados_hoje);
  if (folga === 0) {
    throw new ErroDisparo(
      `O chip "${chip.apelido}" já mandou ${chip.enviados_hoje} mensagens hoje (limite ${chip.limite_diario}). A campanha continua amanhã sozinha.`,
    );
  }

  // Público: a lista escolhida (ou a base toda), quem aceita marketing e
  // ainda não passou por esta campanha. Tudo em páginas: o Supabase corta
  // cada consulta em 1.000 linhas.
  const { data: jaEnviados } = await buscarTodas((de, ate) =>
    cliente
      .from('envios_campanha')
      .select('paciente_id')
      .eq('campanha_id', campanha.id)
      .order('id')
      .range(de, ate),
  );
  const excluir = new Set((jaEnviados ?? []).map((e) => e.paciente_id));

  const daBase = () =>
    cliente
      .from('pacientes')
      .select('id, nome_completo, telefone, criado_em')
      .eq('clinica_id', campanha.clinica_id)
      .eq('aceita_marketing', true)
      .is('excluido_em', null);

  type Contato = { id: string; nome_completo: string; telefone: string; criado_em: string };
  let publico: Contato[] = [];

  const listaId = filtro.lista_id;
  if (listaId) {
    const { data: itens } = await buscarTodas((de, ate) =>
      cliente
        .from('listas_leads_itens')
        .select('paciente_id')
        .eq('lista_id', listaId)
        .order('id')
        .range(de, ate),
    );
    const idsDaLista = (itens ?? []).map((i) => i.paciente_id);
    if (idsDaLista.length === 0) throw new ErroDisparo('A lista escolhida para esta campanha está vazia.');
    // `.in()` vai na URL: milhares de ids de uma vez estouram o tamanho dela.
    for (const bloco of emBlocos(idsDaLista)) {
      const { data, error } = await daBase().in('id', bloco);
      if (error) throw new ErroDisparo(error.message, 500);
      publico.push(...(data ?? []));
    }
    publico.sort((a, b) => a.criado_em.localeCompare(b.criado_em) || a.id.localeCompare(b.id));
  } else {
    const { data, error } = await buscarTodas((de, ate) =>
      daBase().order('criado_em').order('id').range(de, ate),
    );
    if (error) throw new ErroDisparo((error as Error).message, 500);
    publico = data ?? [];
  }

  const restantes = (publico ?? []).filter((p) => !excluir.has(p.id));
  if (restantes.length === 0) {
    await cliente
      .from('campanhas')
      .update({ filtro_publico: { ...filtro, faltam: 0 } })
      .eq('id', campanha.id);
    throw new ErroDisparo('Nenhum contato novo para esta campanha.');
  }

  const { data: credencial } = await anonimo().rpc('wa_ler_credencial', {
    p_segredo: await segredo(),
    p_numero_id: chip.id,
  });
  const linha = credencial?.[0];
  if (!linha) throw new ErroDisparo('O número conectado não tem instância vinculada.');

  // Confere só o necessário para encher o lote: quem não tem WhatsApp não
  // gasta envio do chip, e fica marcado para não ser checado de novo amanhã.
  const candidatos = restantes.slice(0, Math.min(restantes.length, folga * 2 + 20));
  const conferidos = await checarNumeros(
    linha.token,
    candidatos.map((p) => normalizarTelefone(p.telefone)),
  );
  const validos = new Set(
    conferidos.filter((c) => c.isInWhatsapp).map((c) => c.query.replace(/\D/g, '')),
  );
  const semWhatsapp = candidatos.filter((p) => !validos.has(normalizarTelefone(p.telefone)));
  const alvos = candidatos.filter((p) => validos.has(normalizarTelefone(p.telefone))).slice(0, folga);

  if (semWhatsapp.length) {
    await cliente.from('envios_campanha').insert(
      semWhatsapp.map((p) => ({
        clinica_id: campanha.clinica_id,
        campanha_id: campanha.id,
        paciente_id: p.id,
        status: 'falhou' as const,
        erro: 'número sem WhatsApp',
      })),
    );
  }

  const faltam = Math.max(0, restantes.length - semWhatsapp.length - alvos.length);

  if (alvos.length === 0) {
    await cliente
      .from('campanhas')
      .update({ status: 'em_andamento', filtro_publico: { ...filtro, faltam } })
      .eq('id', campanha.id);
    return { enviados: 0, semWhatsapp: semWhatsapp.length, faltam, pasta: null };
  }

  /**
   * Intervalo entre uma mensagem e a próxima, com folga aleatória, a partir
   * do ritmo da campanha (envios por hora).
   */
  const porHora = Math.max(1, campanha.envios_por_hora ?? 240);
  const medioSegundos = Math.max(4, Math.round(3600 / porHora));

  /*
   * A UazApi busca o arquivo na hora de cada envio: a assinatura dura o máximo
   * que o Storage aceita (7 dias). Guardamos o caminho; a URL é só da fila.
   */
  let anexoUrl: string | null = null;
  if (anexo) {
    const { data: assinada, error: erroAssinatura } = await cliente.storage
      .from('midias')
      .createSignedUrl(anexo.caminho, 60 * 60 * 24 * 7);
    if (erroAssinatura || !assinada?.signedUrl) {
      throw new ErroDisparo('O arquivo da campanha não foi encontrado. Anexe de novo.');
    }
    anexoUrl = assinada.signedUrl;
  }

  const mensagens = alvos.map((p) => ({
    pacienteId: p.id,
    numero: normalizarTelefone(p.telefone),
    texto: personalizar(campanha.modelo_mensagem, p.nome_completo),
  }));

  const disparo = await criarDisparo(linha.token, {
    anexo:
      anexo && anexoUrl
        ? { tipo: anexo.tipo === 'imagem' ? 'image' : 'document', url: anexoUrl, nome: anexo.nome }
        : null,
    mensagens: mensagens.map((m) => ({ numero: m.numero, texto: m.texto })),
    pasta: `${campanha.nome} (${campanha.id.slice(0, 8)})`,
    atrasoMin: Math.max(3, Math.round(medioSegundos * 0.65)),
    atrasoMax: Math.round(medioSegundos * 1.35),
  });

  // Cada destinatário vira uma linha do funil da campanha.
  const { error: erroEnvios } = await cliente.from('envios_campanha').insert(
    mensagens.map((m) => ({
      clinica_id: campanha.clinica_id,
      campanha_id: campanha.id,
      paciente_id: m.pacienteId,
      numero_whatsapp_id: chip.id,
      status: 'pendente' as const,
      mensagem_enviada: m.texto,
      agendado_para: new Date().toISOString(),
    })),
  );
  if (erroEnvios) throw new ErroDisparo(erroEnvios.message, 500);

  await registrarNasConversas(cliente, {
    clinicaId: campanha.clinica_id,
    numeroId: chip.id,
    mensagens: mensagens.map((m) => ({ pacienteId: m.pacienteId, texto: m.texto })),
    anexo,
  });

  // Cada lote é uma pasta na UazApi; a lista é a chave para reconciliar e pausar.
  const pastas = [
    ...(campanha.pasta_externa ?? '').split(',').filter(Boolean),
    ...(disparo.folder_id ? [disparo.folder_id] : []),
  ];
  await cliente
    .from('campanhas')
    .update({
      status: 'em_andamento',
      pasta_externa: pastas.join(',') || null,
      filtro_publico: { ...filtro, faltam },
    })
    .eq('id', campanha.id);

  return { enviados: alvos.length, semWhatsapp: semWhatsapp.length, faltam, pasta: disparo.folder_id ?? null };
}
