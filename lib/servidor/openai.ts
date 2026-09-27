import { variavel } from './ambiente';

/**
 * Cliente da OpenAI. Só servidor: a chave nunca chega ao navegador.
 *
 * Usa a API de chat direto por fetch, sem SDK — o Workers não tem as APIs de
 * Node que a biblioteca oficial espera, e a chamada é simples o bastante.
 */

export type Fala = { papel: 'system' | 'user' | 'assistant'; texto: string };

export class ErroOpenai extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ErroOpenai';
  }
}

export async function gerarResposta(entrada: {
  modelo: string;
  falas: Fala[];
  maximoTokens?: number;
  temperatura?: number;
  /** Obriga a resposta a ser um objeto JSON (o prompt diz qual). */
  json?: boolean;
}): Promise<string> {
  const chave = await variavel('OPENAI_API_KEY');

  const resposta = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${chave}`,
    },
    body: JSON.stringify({
      model: entrada.modelo,
      messages: entrada.falas.map((f) => ({
        role: f.papel,
        content: f.texto,
      })),
      // Resposta de WhatsApp é curta por natureza; o teto evita conta alta e
      // texto longo demais para o canal.
      max_tokens: entrada.maximoTokens ?? 320,
      temperature: entrada.temperatura ?? 0.6,
      ...(entrada.json ? { response_format: { type: 'json_object' } } : {}),
    }),
  });

  const corpo = (await resposta.json().catch(() => null)) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  } | null;

  if (!resposta.ok) {
    throw new ErroOpenai(
      `OpenAI: ${corpo?.error?.message ?? resposta.statusText}`,
      resposta.status,
    );
  }

  const texto = corpo?.choices?.[0]?.message?.content?.trim();
  if (!texto) throw new ErroOpenai('A OpenAI respondeu vazio.', 502);

  return texto;
}
