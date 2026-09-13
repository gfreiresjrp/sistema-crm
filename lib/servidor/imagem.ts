/**
 * Baixa uma imagem pequena e a devolve como data URL.
 *
 * Serve para a foto de perfil do contato: a URL que o WhatsApp entrega expira
 * em dias, então guardar a URL deixava a caixa de entrada sem foto depois de
 * uma semana. A miniatura tem poucos KB e cabe numa coluna de texto.
 */
export const LIMITE_FOTO = 200 * 1024;

export async function baixarImagemComoDataUrl(url: string): Promise<string> {
  const resposta = await fetch(url);
  if (!resposta.ok) throw new Error(`Imagem indisponível (${resposta.status}).`);

  const tipo = (resposta.headers.get('content-type') ?? 'image/jpeg').split(';')[0].trim();
  if (!tipo.startsWith('image/')) throw new Error(`Conteúdo não é imagem (${tipo}).`);

  const bytes = new Uint8Array(await resposta.arrayBuffer());
  if (bytes.byteLength === 0) throw new Error('Imagem vazia.');
  if (bytes.byteLength > LIMITE_FOTO) {
    throw new Error(`Imagem grande demais (${Math.round(bytes.byteLength / 1024)} KB).`);
  }

  // btoa espera uma string binária; montar em pedaços evita estourar a pilha.
  let binario = '';
  for (let i = 0; i < bytes.byteLength; i += 0x8000) {
    binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:${tipo};base64,${btoa(binario)}`;
}
