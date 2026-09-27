'use client';

import { supabase } from '@/lib/supabase/cliente';

/**
 * Chamadas às rotas de servidor.
 *
 * Elas são o único caminho até a UazApi: o token de administrador e os tokens
 * de instância vivem no servidor, nunca no navegador. O que vai daqui é o JWT
 * da sessão, que o servidor usa para reavaliar o RLS antes de agir.
 */
async function chamar<T>(caminho: string, opcoes?: { corpo?: unknown; metodo?: string }): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const jwt = data.session?.access_token;
  if (!jwt) throw new Error('Sua sessão expirou. Entre de novo.');

  const resposta = await fetch(caminho, {
    method: opcoes?.metodo ?? (opcoes?.corpo ? 'POST' : 'GET'),
    headers: {
      Authorization: `Bearer ${jwt}`,
      ...(opcoes?.corpo ? { 'Content-Type': 'application/json' } : {}),
    },
    body: opcoes?.corpo ? JSON.stringify(opcoes.corpo) : undefined,
  });

  const corpo = (await resposta.json().catch(() => null)) as (T & { erro?: string }) | null;
  if (!resposta.ok) throw new Error(corpo?.erro ?? `Falha na chamada (${resposta.status}).`);
  return corpo as T;
}

export type RespostaConexao = {
  instancia: string;
  conectado: boolean;
  qrcode: string | null;
  paircode: string | null;
  status: string | null;
  avisoWebhook: string | null;
};

export type EstadoNumero = {
  vinculado: boolean;
  conectado: boolean;
  perfil?: string | null;
  dono?: string | null;
  qrcode?: string | null;
};

export const whatsapp = {
  conectar: (numeroId: string, telefone?: string) =>
    chamar<RespostaConexao>('/api/whatsapp/conectar', { corpo: { numeroId, telefone } }),

  estado: (numeroId: string) =>
    chamar<EstadoNumero>(`/api/whatsapp/status?numeroId=${encodeURIComponent(numeroId)}`),

  desconectar: (numeroId: string) =>
    chamar<{ ok: true }>('/api/whatsapp/desconectar', { corpo: { numeroId } }),

  excluir: (numeroId: string) =>
    chamar<{ ok: true }>('/api/whatsapp/excluir', { corpo: { numeroId } }),

  enviar: (conversaId: string, texto: string) =>
    chamar<{ ok: true; mensagemId: string }>('/api/whatsapp/enviar', {
      corpo: { conversaId, texto },
    }),

  enviarMidia: (entrada: {
    conversaId: string;
    caminho: string;
    tipo: 'imagem' | 'audio' | 'video' | 'documento';
    legenda?: string | null;
    nomeArquivo?: string | null;
    mimetype?: string | null;
  }) => chamar<{ ok: true; mensagemId: string }>('/api/whatsapp/enviar-midia', { corpo: entrada }),

  atualizarFotos: (pacienteIds: string[]) =>
    chamar<{ atualizados: Array<{ id: string; foto_url: string | null }>; motivo?: string }>(
      '/api/whatsapp/fotos',
      { corpo: { pacienteIds } },
    ),

  definirPrincipal: (entrada: { numeroId: string | null; clinicaId: string }) =>
    chamar<{ ok: true; principal: string | null; semInstancia: string[] }>(
      '/api/whatsapp/principal',
      { corpo: entrada },
    ),
  controlarCampanha: (campanhaId: string, acao: 'pausar' | 'retomar') =>
    chamar<{ ok: true }>('/api/whatsapp/campanha', { corpo: { campanhaId, acao } }),
  escutarAgendamento: (conversaId: string) =>
    chamar<{ acao: 'nenhuma' | 'criado' | 'remarcado'; motivo?: string; inicio?: string }>(
      '/api/whatsapp/escuta',
      { corpo: { conversaId } },
    ),
  dispararCampanha: (campanhaId: string) =>
    chamar<{ ok: true; enviados: number; ignorados: number }>('/api/whatsapp/disparar', {
      corpo: { campanhaId },
    }),
};
