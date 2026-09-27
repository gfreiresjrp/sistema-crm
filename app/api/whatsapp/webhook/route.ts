import { anonimo, chaveWebhook, falha, segredo } from '@/lib/servidor/banco';
import { baixarMidia, estaConectado, type RespostaConexao } from '@/lib/servidor/uazapi';
import { baixarImagemComoDataUrl } from '@/lib/servidor/imagem';
import { variavel } from '@/lib/servidor/ambiente';
import { enfileirar } from '@/lib/servidor/fila-ia';
import { lerFuncao } from '@/lib/servidor/funcao-chip';

/**
 * Recebe os eventos da UazApi.
 *
 * Não há usuário logado aqui, então a autorização é dupla: a chave derivada na
 * URL (que a UazApi guarda) e, dentro do banco, o segredo exigido pelas funções
 * `wa_*`. A chave da URL não serve para chamar essas funções, então vazá-la em
 * log de proxy não dá acesso ao banco.
 */

type Mensagem = {
  id?: string;
  messageid?: string;
  chatid?: string;
  sender?: string;
  sender_pn?: string;
  senderName?: string;
  isGroup?: boolean;
  fromMe?: boolean;
  messageType?: string;
  text?: string;
  content?: unknown;
  fileURL?: string;
  wasSentByApi?: boolean;
};

/**
 * Texto vindo de fora, sem confiar no tipo.
 *
 * `String(x)` num objeto produz "[object Object]", que passaria adiante como
 * se fosse um valor legítimo. Aqui só string e número viram texto; o resto
 * vira vazio e o chamador decide o que fazer.
 */
function texto(valor: unknown): string {
  if (typeof valor === 'string') return valor;
  if (typeof valor === 'number') return String(valor);
  return '';
}

/** Pega o primeiro campo preenchido entre as variações conhecidas do envelope. */
function primeiroTexto(...valores: unknown[]): string {
  for (const valor of valores) {
    const t = texto(valor).trim();
    if (t) return t;
  }
  return '';
}

/**
 * O formato do envelope varia entre versões; aceitamos as variações conhecidas.
 *
 * A ordem importa: o corpo real traz `instanceName` com o nome da instância e
 * `owner` com o número de telefone do aparelho. Consultar `owner` primeiro
 * fazia o telefone ser tratado como instância, e nenhuma credencial batia —
 * todo evento recebido era descartado com "instância não pertence a nenhuma
 * clínica". `owner` só entra como último recurso.
 */
function lerEnvelope(corpo: Record<string, unknown>) {
  const evento = primeiroTexto(corpo.event, corpo.EventType, corpo.type).toLowerCase();
  const instancia = primeiroTexto(
    corpo.instanceName,
    corpo.instance,
    corpo.instance_id,
    corpo.owner,
  );
  const dados = (corpo.data ?? corpo) as Record<string, unknown>;
  return { evento, instancia, dados };
}

function lerMensagem(dados: Record<string, unknown>): Mensagem | null {
  const bruta = (dados.message ?? dados.messages ?? dados) as Mensagem | Mensagem[];
  const alvo = Array.isArray(bruta) ? bruta[0] : bruta;
  if (!alvo || typeof alvo !== 'object') return null;
  return alvo.messageid || alvo.id || alvo.chatid ? alvo : null;
}

/** "5511998452031@s.whatsapp.net" → "5511998452031" */
function telefoneDoJid(jid: unknown): string {
  return texto(jid).split('@')[0].split(':')[0].replace(/\D/g, '');
}

/**
 * Rótulo para mensagem sem texto.
 *
 * O banco exige conteúdo ou mídia. Uma foto pode chegar antes de a URL do
 * arquivo estar resolvida, e sem isso a mensagem seria recusada e sumiria da
 * conversa. O rótulo mantém o registro na thread — é o mesmo que o WhatsApp
 * mostra na prévia da lista.
 */
const ROTULO_SEM_TEXTO: Record<string, string> = {
  imagem: 'Foto',
  video: 'Vídeo',
  audio: 'Áudio',
  documento: 'Documento',
  figurinha: 'Figurinha',
  localizacao: 'Localização',
  contato: 'Contato',
  texto: 'Mensagem sem texto',
};

const TIPOS: Record<string, string> = {
  conversation: 'texto',
  extendedtextmessage: 'texto',
  text: 'texto',
  imagemessage: 'imagem',
  image: 'imagem',
  videomessage: 'video',
  video: 'video',
  audiomessage: 'audio',
  audio: 'audio',
  ptt: 'audio',
  pttmessage: 'audio',
  myaudio: 'audio',
  documentmessage: 'documento',
  document: 'documento',
  stickermessage: 'figurinha',
  sticker: 'figurinha',
  locationmessage: 'localizacao',
  contactmessage: 'contato',
};

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    if (url.searchParams.get('k') !== (await chaveWebhook())) {
      // Sem detalhe: um webhook não deve ajudar quem está sondando.
      return new Response('não autorizado', { status: 401 });
    }

    const corpo = (await req.json()) as Record<string, unknown>;
    const { evento, instancia, dados } = lerEnvelope(corpo);

    if (!instancia) return Response.json({ ignorado: 'sem instância' });

    const chave = await segredo();
    const servidor = anonimo();

    if (evento.startsWith('connection')) {
      const conectado = estaConectado(dados as RespostaConexao);
      const instanciaDados = (dados.instance ?? {}) as Record<string, unknown>;
      await servidor.rpc('wa_atualizar_conexao', {
        p_segredo: chave,
        p_instancia: instancia,
        p_status: conectado ? 'conectado' : 'desconectado',
        p_numero: primeiroTexto(dados.owner, instanciaDados.owner) || null,
      });
      return Response.json({ ok: true, tratado: 'conexao' });
    }

    if (!evento.startsWith('message')) {
      return Response.json({ ignorado: evento || 'evento sem nome' });
    }

    // A foto de perfil vem no bloco do chat, não no da mensagem.
    const chat = (dados.chat ?? {}) as Record<string, unknown>;
    const foto = primeiroTexto(chat.image, chat.imagePreview) || null;

    const mensagem = lerMensagem(dados);
    if (!mensagem) return Response.json({ ignorado: 'payload sem mensagem' });

    // Grupos não são atendimento individual; ficam de fora do CRM.
    if (mensagem.isGroup) return Response.json({ ignorado: 'grupo' });

    /**
     * Quem é o outro lado da conversa.
     *
     * `chatid` é sempre o interlocutor, nos dois sentidos — é ele que define a
     * thread. `sender_pn` só serve quando a mensagem é recebida: numa mensagem
     * enviada do celular ele traz o número da própria clínica, e usá-lo criava
     * um "paciente" com o número do próprio chip.
     *
     * `sender` fica de fora: em conversa individual ele costuma vir como LID
     * (13534129819741@lid), que não é telefone e viraria cadastro inválido.
     */
    const telefone = mensagem.fromMe
      ? telefoneDoJid(mensagem.chatid)
      : telefoneDoJid(mensagem.chatid) || telefoneDoJid(mensagem.sender_pn);

    if (!telefone) return Response.json({ ignorado: 'sem telefone' });

    // Conversa do número consigo mesmo ("Mensagem para mim") não é atendimento.
    if (telefone === telefoneDoJid(corpo.owner)) {
      return Response.json({ ignorado: 'conversa do número com ele mesmo' });
    }

    // O corpo real usa "Conversation", "ImageMessage" etc., e às vezes traz o
    // formato em `type`/`mediaType`. Normalizamos os três.
    const tipo =
      TIPOS[texto(mensagem.messageType).toLowerCase()] ??
      TIPOS[texto((mensagem as { mediaType?: unknown }).mediaType).toLowerCase()] ??
      TIPOS[texto((mensagem as { type?: unknown }).type).toLowerCase()] ??
      'texto';

    const idExterno = primeiroTexto(mensagem.messageid, mensagem.id) || null;
    let midia = primeiroTexto(mensagem.fileURL) || null;
    let transcricao: string | null = null;

    // O evento avisa que há mídia, mas não traz o arquivo: é preciso pedi-lo.
    if (tipo !== 'texto' && !midia && idExterno) {
      const { data: credencial } = await servidor.rpc('wa_credencial_por_instancia', {
        p_segredo: chave,
        p_instancia: instancia,
      });
      const token = credencial?.[0]?.token;

      if (token) {
        try {
          const chaveOpenai = await variavel('OPENAI_API_KEY').catch(() => undefined);
          const arquivo = await baixarMidia(token, idExterno, {
            transcrever: tipo === 'audio',
            chaveOpenai,
          });
          midia = arquivo.fileURL ?? null;
          transcricao = arquivo.transcription?.trim() || null;
        } catch (e) {
          // Sem o arquivo a mensagem ainda precisa existir na conversa.
          console.error('[webhook] mídia não baixada:', e instanceof Error ? e.message : e);
        }
      }
    }

    // A transcrição vira o texto da mensagem: aparece sob o áudio e, melhor
    // ainda, na prévia da caixa de entrada — "quero saber o preço" diz muito
    // mais do que "Áudio".
    const conteudo =
      primeiroTexto(mensagem.text, mensagem.content) ||
      transcricao ||
      (midia ? null : (ROTULO_SEM_TEXTO[tipo] ?? ROTULO_SEM_TEXTO.texto));

    /**
     * Nome do outro lado.
     *
     * `senderName` é quem escreveu a mensagem: numa mensagem enviada do celular
     * da clínica ele traz o nome do dono do chip, e usá-lo batizava todo contato
     * novo com o nome da própria clínica — a caixa de entrada ficava cheia de
     * "Gabriel Freire". O bloco `chat` descreve o interlocutor nos dois
     * sentidos, então é ele a fonte; `senderName` só vale na mensagem recebida.
     */
    const nomeContato =
      primeiroTexto(chat.wa_contactName, chat.wa_name, chat.name) ||
      (mensagem.fromMe ? '' : primeiroTexto(mensagem.senderName)) ||
      null;

    const { data, error } = await servidor.rpc('wa_registrar_mensagem', {
      p_segredo: chave,
      p_instancia: instancia,
      p_telefone: telefone,
      p_nome: nomeContato,
      p_conteudo: conteudo,
      p_de_mim: Boolean(mensagem.fromMe),
      p_id_externo: idExterno,
      p_tipo: tipo as never,
      p_midia_url: midia,
      p_enviada_pela_api: Boolean(mensagem.wasSentByApi),
      p_foto: foto,
    });

    if (error) {
      console.error('[webhook] falha ao gravar:', error.message);
      // 200 de propósito: reenviar não resolveria um payload que não encaixa.
      return Response.json({ erro: error.message }, { status: 200 });
    }

    const gravada = data as unknown as {
      mensagem_id: string | null;
      conversa_id: string;
      paciente_id: string;
      foto_pendente: boolean;
      duplicada: boolean;
    };

    // A URL da foto expira em dias; guardamos a miniatura em si, e só quando
    // a URL mudou desde a última vez — não a cada mensagem.
    if (gravada.foto_pendente && foto) {
      try {
        const dataUrl = await baixarImagemComoDataUrl(foto);
        await servidor.rpc('wa_guardar_foto', {
          p_segredo: chave,
          p_paciente_id: gravada.paciente_id,
          p_foto: dataUrl,
          p_origem: foto,
        });
      } catch (e) {
        console.error('[webhook] foto não baixada:', e instanceof Error ? e.message : e);
      }
    }

    // A assistente só entra em mensagem nova do paciente. Evento reentregue já
    // foi respondido; mensagem nossa não pede resposta.
    if (mensagem.fromMe || gravada.duplicada) {
      return Response.json({ ok: true, mensagemId: gravada.mensagem_id, respondeu: false });
    }

    const { data: credencial } = await servidor.rpc('wa_credencial_por_instancia', {
      p_segredo: chave,
      p_instancia: instancia,
    });

    const token = credencial?.[0]?.token;
    if (!token) {
      return Response.json({ ok: true, mensagemId: gravada.mensagem_id, respondeu: false });
    }

    /*
     * A IA não responde aqui. O lead entra na fila do chip e o agendador
     * responde depois de um minuto, um lead por vez por chip — resposta
     * instantânea denuncia o robô, e trinta respostas simultâneas derrubam o
     * chip. No principal nada entra na fila: ali quem responde é a equipe.
     */
    const funcao = await lerFuncao(token).catch(() => null);
    if (funcao?.principal) {
      return Response.json({ ok: true, mensagemId: gravada.mensagem_id, assistente: 'principal' });
    }

    const chatid = texto(mensagem.chatid) || `${telefone}@s.whatsapp.net`;
    try {
      await enfileirar(token, chatid, gravada.conversa_id);
    } catch (e) {
      console.error('[fila-ia] não enfileirou:', e instanceof Error ? e.message : e);
    }

    return Response.json({ ok: true, mensagemId: gravada.mensagem_id, assistente: 'na fila' });
  } catch (e) {
    return falha(e);
  }
}

/** A UazApi valida a URL com um GET antes de salvar o webhook. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const autorizado = url.searchParams.get('k') === (await chaveWebhook());
  return new Response(autorizado ? 'ok' : 'não autorizado', { status: autorizado ? 200 : 401 });
}
