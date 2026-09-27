import { variavel } from './ambiente';

/**
 * Cliente da UazApi (uazapiGO v2).
 *
 * Vive só no servidor: o `admintoken` cria e apaga instâncias do servidor
 * inteiro, e o token de instância envia mensagens em nome da clínica. Nenhum
 * dos dois pode chegar ao navegador.
 *
 * A API usa dois esquemas de autenticação, ambos por cabeçalho:
 *   - `admintoken` para operações administrativas (criar/listar instâncias);
 *   - `token` (da instância) para todo o resto.
 */

export type Instancia = {
  id?: string;
  token?: string;
  status?: string;
  qrcode?: string;
  paircode?: string;
  name?: string;
  profileName?: string;
  owner?: string;
  adminField01?: string;
  adminField02?: string;
};

export type RespostaConexao = {
  connected?: boolean;
  loggedIn?: boolean;
  status?: { connected?: boolean; loggedIn?: boolean } | string;
  instance?: Instancia;
};

/**
 * Se o aparelho está pareado e logado.
 *
 * Cada rota responde num formato: `/instance/connect` traz `loggedIn` na raiz,
 * `/instance/status` aninha em `status`, e o webhook de conexão só manda a
 * instância. `instance.status === 'connected'` aparece nos três.
 */
export function estaConectado(resposta: RespostaConexao): boolean {
  const aninhado = typeof resposta.status === 'object' && resposta.status ? resposta.status : {};
  return (
    resposta.loggedIn === true ||
    aninhado.loggedIn === true ||
    resposta.instance?.status?.toLowerCase() === 'connected' ||
    (typeof resposta.status === 'string' && resposta.status.toLowerCase() === 'connected')
  );
}

export class ErroUazapi extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ErroUazapi';
  }
}

async function chamar<T>(
  caminho: string,
  opcoes: { metodo?: string; corpo?: unknown; adminToken?: string; token?: string },
): Promise<T> {
  const base = (await variavel('UAZAPI_URL')).replace(/\/+$/, '');

  const cabecalhos: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opcoes.adminToken) cabecalhos.admintoken = opcoes.adminToken;
  if (opcoes.token) cabecalhos.token = opcoes.token;

  const resposta = await fetch(`${base}${caminho}`, {
    method: opcoes.metodo ?? 'POST',
    headers: cabecalhos,
    body: opcoes.corpo === undefined ? undefined : JSON.stringify(opcoes.corpo),
  });

  const texto = await resposta.text();
  let corpo: unknown = null;
  try {
    corpo = texto ? JSON.parse(texto) : null;
  } catch {
    corpo = texto;
  }

  if (!resposta.ok) {
    // A API sinaliza a falha com `error: true` e explica em `message`; usar
    // `error` direto viraria a string "true", inútil no log e na tela.
    const dados = corpo as { error?: unknown; message?: unknown } | null;
    const detalhe =
      (typeof dados?.message === 'string' && dados.message) ||
      (typeof dados?.error === 'string' && dados.error) ||
      (typeof corpo === 'string' && corpo) ||
      resposta.statusText ||
      `HTTP ${resposta.status}`;
    throw new ErroUazapi(`UazApi ${caminho}: ${detalhe}`, resposta.status);
  }

  return corpo as T;
}

async function admin(): Promise<string> {
  return variavel('UAZAPI_ADMIN_TOKEN');
}

/** Cria uma instância nova. O token devolvido é o que autentica os envios. */
export async function criarInstancia(nome: string): Promise<Instancia> {
  const dados = await chamar<{ instance?: Instancia; token?: string; name?: string }>(
    '/instance/create',
    { corpo: { name: nome }, adminToken: await admin() },
  );

  // A resposta traz o token na raiz e o restante em `instance`.
  return { ...dados.instance, token: dados.token ?? dados.instance?.token, name: nome };
}

/**
 * Inicia o pareamento. Sem `telefone` devolve QR Code em base64; com telefone,
 * devolve um código de 8 dígitos para digitar no aparelho.
 */
export async function conectarInstancia(
  token: string,
  telefone?: string,
): Promise<RespostaConexao> {
  return chamar<RespostaConexao>('/instance/connect', {
    corpo: telefone ? { phone: telefone } : {},
    token,
  });
}

export async function statusInstancia(token: string): Promise<RespostaConexao> {
  return chamar<RespostaConexao>('/instance/status', { metodo: 'GET', token });
}

/**
 * Grava os dois campos livres da instância. Só o token de administrador
 * escreve; o token da própria instância lê (vem em /instance/status).
 */
export async function atualizarCamposAdmin(
  instanciaId: string,
  campos: { adminField01: string; adminField02: string },
): Promise<unknown> {
  return chamar('/instance/updateAdminFields', {
    corpo: { id: instanciaId, ...campos },
    adminToken: await admin(),
  });
}

export async function desconectarInstancia(token: string): Promise<unknown> {
  return chamar('/instance/disconnect', { corpo: {}, token });
}

export async function apagarInstancia(token: string): Promise<unknown> {
  return chamar('/instance', { metodo: 'DELETE', token });
}

/** Aponta os eventos da instância para o nosso webhook. */
export async function configurarWebhook(token: string, url: string): Promise<unknown> {
  return chamar('/webhook', {
    corpo: {
      enabled: true,
      url,
      events: ['messages', 'connection'],
      // Mensagens que nós mesmos enviamos pela API já foram gravadas no envio;
      // recebê-las de volta só duplicaria trabalho.
      excludeMessages: ['wasSentByApi'],
      addUrlEvents: false,
      addUrlTypesMessages: false,
    },
    token,
  });
}

/** Todas as instâncias do servidor (token de administrador). */
export async function listarInstancias(): Promise<Instancia[]> {
  return chamar<Instancia[]>('/instance/all', { metodo: 'GET', adminToken: await admin() });
}

export type ChatLead = {
  wa_chatid?: string;
  lead_status?: string;
  lead_field01?: string;
  lead_field02?: string;
  lead_field03?: string;
  lead_notes?: string;
};

/** Grava campos livres do contato na UazApi (lead_status, lead_fieldNN). */
export async function editarLead(
  token: string,
  chatid: string,
  campos: Partial<Omit<ChatLead, 'wa_chatid'>>,
): Promise<unknown> {
  return chamar('/chat/editLead', { corpo: { id: chatid, ...campos }, token });
}

/** Contatos com um `lead_status` exato. */
export async function chatsComStatus(token: string, status: string): Promise<ChatLead[]> {
  const resposta = await chamar<{ chats?: ChatLead[] } | ChatLead[]>('/chat/find', {
    corpo: { lead_status: `=${status}`, wa_isGroup: false, limit: 100 },
    token,
  });
  return Array.isArray(resposta) ? resposta : (resposta?.chats ?? []);
}

/** Marca a conversa como lida: o contato vê os dois tiques azuis. */
export async function marcarComoLido(token: string, numero: string): Promise<unknown> {
  const jid = numero.includes('@') ? numero : `${numero}@s.whatsapp.net`;
  return chamar('/chat/read', { corpo: { number: jid, read: true }, token });
}

/**
 * Envia texto. `atraso` (ms) segura o envio mostrando "digitando..." para o
 * contato durante esse tempo — é o que a UazApi faz com `delay`.
 */
export async function enviarTexto(
  token: string,
  destino: string,
  texto: string,
  atraso?: number,
): Promise<{ id?: string; messageid?: string; key?: { id?: string } }> {
  return chamar('/send/text', {
    corpo: { number: destino, text: texto, ...(atraso ? { delay: atraso } : {}) },
    token,
  });
}

/**
 * Dispara uma campanha. A UazApi cuida da fila e do intervalo entre envios,
 * que é o que mantém o número longe do bloqueio.
 *
 * Usa o envio avançado porque cada contato recebe o próprio texto: o simples
 * manda a mesma string para todos, e o "Oi {{primeiro_nome}}!" chegava assim,
 * com as chaves, no celular do lead.
 */
export async function criarDisparo(
  token: string,
  entrada: {
    mensagens: Array<{ numero: string; texto: string }>;
    /** Imagem ou documento que acompanha cada mensagem; o texto vira legenda. */
    anexo?: { tipo: 'image' | 'document'; url: string; nome?: string | null } | null;
    pasta: string;
    atrasoMin: number;
    atrasoMax: number;
    agendadoPara?: number;
  },
): Promise<{ folder_id?: string; count?: number; status?: string }> {
  return chamar('/sender/advanced', {
    corpo: {
      info: entrada.pasta,
      delayMin: entrada.atrasoMin,
      delayMax: entrada.atrasoMax,
      scheduled_for: entrada.agendadoPara ?? 0,
      messages: entrada.mensagens.map((m) =>
        entrada.anexo
          ? {
              number: m.numero,
              type: entrada.anexo.tipo,
              file: entrada.anexo.url,
              ...(m.texto ? { text: m.texto } : {}),
              ...(entrada.anexo.tipo === 'document' && entrada.anexo.nome
                ? { docName: entrada.anexo.nome }
                : {}),
            }
          : { number: m.numero, type: 'text', text: m.texto },
      ),
    },
    token,
  });
}

/** Pausa, retoma ou apaga (com o que ainda não saiu) uma fila de disparo. */
export async function controlarDisparo(
  token: string,
  pastaId: string,
  acao: 'stop' | 'continue' | 'delete',
): Promise<unknown> {
  return chamar('/sender/edit', { corpo: { folder_id: pastaId, action: acao }, token });
}

/** Tipos que a UazApi aceita em /send/media. */
export type TipoMidia = 'image' | 'video' | 'document' | 'audio' | 'ptt' | 'sticker';

/**
 * Envia mídia. `arquivo` pode ser uma URL alcançável pela UazApi ou o conteúdo
 * em base64 — usamos URL assinada do nosso armazenamento, que evita trafegar o
 * arquivo inteiro duas vezes.
 */
export async function enviarMidia(
  token: string,
  entrada: {
    destino: string;
    tipo: TipoMidia;
    arquivo: string;
    legenda?: string | null;
    nomeDocumento?: string | null;
    mimetype?: string | null;
  },
): Promise<{ id?: string; messageid?: string; key?: { id?: string } }> {
  return chamar('/send/media', {
    corpo: {
      number: entrada.destino,
      type: entrada.tipo,
      file: entrada.arquivo,
      ...(entrada.legenda ? { text: entrada.legenda } : {}),
      ...(entrada.nomeDocumento ? { docName: entrada.nomeDocumento } : {}),
      ...(entrada.mimetype ? { mimetype: entrada.mimetype } : {}),
    },
    token,
  });
}

/**
 * Situação de cada mensagem de uma fila de disparo. É por aqui que o funil
 * descobre quem realmente recebeu — a criação da fila só enfileira.
 */
export type MensagemDoDisparo = {
  number?: string;
  chatid?: string;
  status?: string;
  messageid?: string;
  text?: string;
};

export async function listarMensagensDoDisparo(
  token: string,
  pastaId: string,
): Promise<MensagemDoDisparo[]> {
  const resposta = await chamar<{ messages?: MensagemDoDisparo[] } | MensagemDoDisparo[]>(
    '/sender/listmessages',
    { corpo: { folder_id: pastaId, limit: 1000 }, token },
  );

  if (Array.isArray(resposta)) return resposta;
  return resposta?.messages ?? [];
}

/**
 * Busca o arquivo de uma mensagem de mídia.
 *
 * A mídia recebida não chega no evento do webhook — ele traz só o aviso de que
 * existe. Este endpoint materializa o arquivo e devolve uma URL. Para áudio
 * pedimos MP3, que toca em qualquer navegador (o OGG do WhatsApp não toca no
 * Safari).
 *
 * `transcrever` só é pedido quando há chave da OpenAI: sem ela a chamada
 * inteira poderia falhar e o áudio ficaria sem nem a URL.
 */
export async function baixarMidia(
  token: string,
  idMensagem: string,
  opcoes?: { transcrever?: boolean; chaveOpenai?: string },
): Promise<{ fileURL?: string; mimetype?: string; transcription?: string }> {
  const corpo: Record<string, unknown> = {
    id: idMensagem,
    return_link: true,
    generate_mp3: true,
  };

  if (opcoes?.transcrever && opcoes.chaveOpenai) {
    corpo.transcribe = true;
    corpo.openai_apikey = opcoes.chaveOpenai;
  }

  try {
    return await chamar('/message/download', { corpo, token });
  } catch (e) {
    // Transcrição é acessório; sem ela ainda queremos o arquivo.
    if (!corpo.transcribe) throw e;
    return chamar('/message/download', {
      corpo: { id: idMensagem, return_link: true, generate_mp3: true },
      token,
    });
  }
}

/** Filtra quem realmente tem WhatsApp antes de gastar disparo. */
export async function checarNumeros(
  token: string,
  numeros: string[],
): Promise<Array<{ query: string; isInWhatsapp: boolean }>> {
  return chamar('/chat/check', { corpo: { numbers: numeros }, token });
}

export type DetalhesChat = {
  name?: string;
  wa_name?: string;
  wa_contactName?: string;
  image?: string;
  imagePreview?: string;
};

/**
 * Nome e foto de perfil de um contato.
 *
 * Com `preview` a API devolve a miniatura, que é o que a caixa de entrada
 * usa; a imagem cheia só faz sentido na ficha e pesa dez vezes mais.
 */
export async function detalhesDoChat(token: string, numero: string): Promise<DetalhesChat> {
  return chamar<DetalhesChat>('/chat/details', { token, corpo: { number: numero, preview: true } });
}
