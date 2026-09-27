'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bot,
  Check,
  ChevronDown,
  Megaphone,
  MessageCircle,
  PanelRight,
  Plus,
  Smartphone,
  Sparkles,
  UserPlus,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/cliente';
import { useConsulta } from '@/lib/dados/consulta';
import { useClinica } from '@/lib/dados/sessao';
import { garantirPaciente } from '@/lib/dados/catalogo';
import { whatsapp } from '@/lib/dados/api';
import { subirMidia, tipoDoArquivo } from '@/lib/dados/midia';
import { Composicao } from './composicao';
import { Avatar } from './avatar';
import { FichaContato } from './ficha-contato';
import { MidiaMensagem } from './midia-mensagem';
import {
  hora,
  ROTULO_ORIGEM,
  ROTULO_STATUS_CHIP,
  telefoneDigitos,
  tempoRelativo,
} from '@/lib/dados/formato';
import { Campo, Conteudo, EstadoVazio, Modal, useAcao, useAviso } from './base';

type LinhaCaixa = {
  conversa_id: string;
  paciente_id: string;
  nome_completo: string | null;
  telefone: string | null;
  ultima_mensagem_previa: string | null;
  ultima_mensagem_em: string | null;
  nao_lidas: number;
  ia_ativa: boolean;
  assumida_por: string | null;
  atendente: string | null;
  origem: string | null;
  interesse_principal: string | null;
  etapa_funil: string | null;
  foto_url: string | null;
  etiquetas: string[] | null;
  email: string | null;
  observacoes: string | null;
  situacao: string;
  status: string;
  criado_em?: string | null;
};

type Mensagem = {
  id: string;
  autor: 'paciente' | 'ia' | 'humano' | 'sistema';
  conteudo: string | null;
  tipo_conteudo: string;
  midia_url: string | null;
  numero_whatsapp_id: string | null;
  criado_em: string;
};

type ChipDaClinica = {
  id: string;
  apelido: string;
  numero: string | null;
  status: string;
  peso_rotacao: number;
};

export function PainelConversas({ busca }: { busca: string }) {
  const { clinicaId, unidadeId, membroId } = useClinica();
  const { avisar, alertar } = useAviso();
  const { executar, ocupado } = useAcao();

  const [aba, setAba] = useState<'aguardando' | 'atendendo' | 'finalizadas'>('aguardando');
  const [conversaId, setConversaId] = useState<string | null>(null);
  const [enviandoMidia, setEnviandoMidia] = useState(false);
  // Mensagens já escritas e ainda a caminho do servidor. Sem isto a bolha só
  // aparece depois de autenticar, consultar a conversa, falar com a UazApi e
  // recarregar a thread — meio segundo largo de tela parada.
  const [pendentes, setPendentes] = useState<Array<{ id: string; conteudo: string }>>([]);
  const [modalAberto, setModalAberto] = useState(false);
  const [contatoAberto, setContatoAberto] = useState(false);
  const [pulso, setPulso] = useState(0);

  const caixa = useConsulta<LinhaCaixa[]>(
    clinicaId
      ? () => {
          let consulta = supabase
            .from('vw_caixa_entrada')
            .select('*')
            .eq('clinica_id', clinicaId)
            .neq('status', 'arquivada')
            .order('ultima_mensagem_em', { ascending: false, nullsFirst: false })
            .limit(100);
          if (unidadeId) consulta = consulta.or(`unidade_id.eq.${unidadeId},unidade_id.is.null`);
          return consulta;
        }
      : null,
    [clinicaId, unidadeId], [pulso],
  );

  /**
   * Foto de perfil que falta ou expirou.
   *
   * A URL do WhatsApp vale poucos dias; contatos antigos ficavam só com as
   * iniciais. Quem está sem foto, com a URL antiga (começa com http) ou ainda
   * identificado só pelo telefone passa uma vez por sessão pela rota que busca
   * a miniatura (e o nome) atual e guarda no banco. Sem número conectado a
   * rota responde vazio, e não insistimos.
   */
  const fotosTentadas = useRef(new Set<string>());
  useEffect(() => {
    const pendentes = (caixa.dados ?? [])
      .filter(
        (l) => !l.foto_url || l.foto_url.startsWith('http') || l.nome_completo === l.telefone,
      )
      .map((l) => l.paciente_id)
      .filter((id) => !fotosTentadas.current.has(id))
      .slice(0, 15);
    if (pendentes.length === 0) return;
    pendentes.forEach((id) => fotosTentadas.current.add(id));

    let ativo = true;
    void whatsapp
      .atualizarFotos(pendentes)
      .then((r) => {
        if (ativo && r.atualizados.length > 0) setPulso((n) => n + 1);
      })
      .catch(() => {
        // Sem foto a conversa continua inteira; não vale um alerta.
      });
    return () => {
      ativo = false;
    };
  }, [caixa.dados]);

  /**
   * Chegada de mensagem em tempo real.
   *
   * Três camadas, porque nenhuma sozinha é confiável:
   *
   *  1. Realtime do Postgres — o caminho rápido, quase instantâneo.
   *  2. Uma sondagem lenta de reserva, para o caso de a conexão cair sem
   *     avisar (troca de rede, aba suspensa pelo navegador, proxy que corta
   *     WebSocket). Sem ela, uma queda silenciosa deixa o atendente cego.
   *  3. Recarga ao voltar para a aba, que é quando a pessoa vai de fato olhar.
   *
   * As três só incrementam o mesmo gatilho de recarga, então repetição é
   * inofensiva.
   */
  useEffect(() => {
    if (!clinicaId) return;

    const recarregar = () => setPulso((n) => n + 1);

    const canal = supabase
      .channel(`conversas:${clinicaId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'mensagens',
          filter: `clinica_id=eq.${clinicaId}`,
        },
        recarregar,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversas',
          filter: `clinica_id=eq.${clinicaId}`,
        },
        recarregar,
      )
      .subscribe();

    const sondagem = setInterval(recarregar, 20000);

    const aoVoltar = () => {
      if (document.visibilityState === 'visible') recarregar();
    };
    document.addEventListener('visibilitychange', aoVoltar);
    window.addEventListener('focus', aoVoltar);

    return () => {
      clearInterval(sondagem);
      document.removeEventListener('visibilitychange', aoVoltar);
      window.removeEventListener('focus', aoVoltar);
      void supabase.removeChannel(canal);
    };
  }, [clinicaId]);

  /**
   * Quem falou por último em cada conversa. É o que diz, ao vivo, se o lead
   * está esperando alguém ou se já está sendo atendido — a view da caixa de
   * entrada não traz o autor da última mensagem.
   */
  const idsDaCaixa = (caixa.dados ?? []).map((l) => l.conversa_id).join(',');
  const ultimasFalas = useConsulta<Array<{ conversa_id: string; autor: string }>>(
    idsDaCaixa
      ? () =>
          supabase
            .from('mensagens')
            .select('conversa_id, autor, criado_em')
            .in('conversa_id', idsDaCaixa.split(','))
            .order('criado_em', { ascending: false })
            .limit(1000)
      : null,
    [idsDaCaixa], [pulso],
  );
  const ultimoAutor = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const m of ultimasFalas.dados ?? []) {
      if (!mapa.has(m.conversa_id)) mapa.set(m.conversa_id, m.autor);
    }
    return mapa;
  }, [ultimasFalas.dados]);

  /**
   * Em que estágio do atendimento cada conversa está, pelo que acontece nela:
   *  - finalizada: encerrada pela equipe;
   *  - atendendo: alguém respondeu por último (a IA ou a equipe), ou a
   *    conversa foi assumida;
   *  - aguardando: o lead falou por último e espera resposta.
   * Antes tudo que não estava assumido ficava em "Aguardando", mesmo com a IA
   * conversando com o lead.
   */
  const estagio = (linha: LinhaCaixa) => {
    if (linha.status === 'resolvida') return 'finalizadas';
    if (linha.assumida_por) return 'atendendo';
    const autor = ultimoAutor.get(linha.conversa_id);
    return autor && autor !== 'paciente' ? 'atendendo' : 'aguardando';
  };

  /**
   * Cada chip atende a própria carteira de contatos, como uma conta separada
   * do WhatsApp. O seletor no topo da lista escolhe de qual número se está
   * falando; a lista mostra só as conversas dele, e as respostas saem por ele.
   * A escolha fica guardada neste navegador para não voltar a "todos" a cada
   * recarga.
   */
  const [chipFiltro, setChipFiltroEstado] = useState('');
  // Lido depois de montar: no servidor não há localStorage, e ler no
  // inicializador faria o HTML do servidor divergir do primeiro render.
  useEffect(() => {
    try {
      const salvo = localStorage.getItem('conversas:chip');
      if (salvo) setChipFiltroEstado(salvo);
    } catch {
      // Sem armazenamento: começa em "todos os números".
    }
  }, []);
  function setChipFiltro(valor: string) {
    setChipFiltroEstado(valor);
    setConversaId(null);
    try {
      localStorage.setItem('conversas:chip', valor);
    } catch {
      // Sem armazenamento (aba anônima): a escolha vale só nesta visita.
    }
  }

  const chips = useConsulta<ChipDaClinica[]>(
    clinicaId
      ? () =>
          supabase
            .from('numeros_whatsapp')
            .select('id, apelido, numero, status, peso_rotacao')
            .eq('clinica_id', clinicaId)
            .eq('ativo', true)
            .order('apelido')
      : null,
    [clinicaId], [pulso],
  );

  // A view da caixa de entrada não traz o chip; ele vem da própria conversa.
  const chipsDasConversas = useConsulta<Array<{ id: string; numero_whatsapp_id: string | null }>>(
    clinicaId
      ? () =>
          supabase
            .from('conversas')
            .select('id, numero_whatsapp_id')
            .eq('clinica_id', clinicaId)
            .neq('status', 'arquivada')
      : null,
    [clinicaId], [pulso],
  );

  /*
   * Conversa sem chip gravado, mas com mensagem que chegou por um chip: o
   * banco só grava o chip quando cria a conversa, então quem já existia antes
   * de falar pelo WhatsApp ficava fora de qualquer filtro e sem selo. A tela
   * completa com o chip da última mensagem — uma vez por conversa.
   */
  const semChipTentadas = useRef(new Set<string>());
  useEffect(() => {
    const semChip = (chipsDasConversas.dados ?? [])
      .filter((c) => !c.numero_whatsapp_id && !semChipTentadas.current.has(c.id))
      .map((c) => c.id);
    if (semChip.length === 0) return;
    semChip.forEach((id) => semChipTentadas.current.add(id));

    void (async () => {
      const { data } = await supabase
        .from('mensagens')
        .select('conversa_id, numero_whatsapp_id, criado_em')
        .in('conversa_id', semChip)
        .not('numero_whatsapp_id', 'is', null)
        .order('criado_em', { ascending: false });
      const ultimo = new Map<string, string>();
      for (const m of data ?? []) {
        if (m.numero_whatsapp_id && !ultimo.has(m.conversa_id)) {
          ultimo.set(m.conversa_id, m.numero_whatsapp_id);
        }
      }
      for (const [conversa, numero] of ultimo) {
        await supabase
          .from('conversas')
          .update({ numero_whatsapp_id: numero })
          .eq('id', conversa);
      }
      if (ultimo.size) setPulso((n) => n + 1);
    })();
  }, [chipsDasConversas.dados]);

  const chipDe = useMemo(
    () => new Map((chipsDasConversas.dados ?? []).map((c) => [c.id, c.numero_whatsapp_id])),
    [chipsDasConversas.dados],
  );
  const nomeDoChip = new Map((chips.dados ?? []).map((c) => [c.id, c.apelido]));
  const chipPrincipal = (chips.dados ?? []).find((c) => c.peso_rotacao === 0)?.id ?? null;
  // Um chip que saiu da lista (excluído, desativado) não pode deixar a caixa vazia.
  const chipValido = chipFiltro && nomeDoChip.has(chipFiltro) ? chipFiltro : '';


  const termo = busca.trim().toLowerCase();
  const doChip = (caixa.dados ?? []).filter(
    (linha) => !chipValido || chipDe.get(linha.conversa_id) === chipValido,
  );
  const visiveis = doChip.filter((linha) =>
    termo
      ? `${linha.nome_completo ?? ''} ${linha.telefone ?? ''} ${(linha.etiquetas ?? []).join(' ')}`
          .toLowerCase()
          .includes(termo)
      : true,
  );

  const lista = visiveis.filter((linha) => estagio(linha) === aba);
  const quantos = (chave: string) => visiveis.filter((l) => estagio(l) === chave).length;
  // Só abre a conversa que a pessoa escolheu. Abrir a primeira sozinho faz
  // parecer que um atendimento foi assumido sem ninguém pedir.
  const atual = lista.find((l) => l.conversa_id === conversaId) ?? null;

  const abertaId = atual?.conversa_id;
  const abertaNaoLidas = atual?.nao_lidas ?? 0;

  const mensagens = useConsulta<Mensagem[]>(
    abertaId
      ? () =>
          supabase
            .from('mensagens')
            .select('id, autor, conteudo, tipo_conteudo, midia_url, numero_whatsapp_id, criado_em')
            .eq('conversa_id', abertaId)
            .order('criado_em')
            .limit(200)
      : null,
    [abertaId], [pulso],
  );

  useEffect(() => {
    if (!abertaId || abertaNaoLidas <= 0) return;
    void supabase
      .from('conversas')
      .update({ nao_lidas: 0 })
      .eq('id', abertaId)
      .then(() => setPulso((n) => n + 1));
  }, [abertaId, abertaNaoLidas]);

  const fimDaThread = useRef<HTMLDivElement>(null);
  const ultimaVista = useRef<string | null>(null);

  /**
   * Rola até a mensagem mais recente — mas só quando ela de fato muda.
   *
   * A revalidação silenciosa devolve um array novo a cada ciclo, mesmo sem
   * novidade. Reagir ao array jogaria a conversa para o fim a cada poucos
   * segundos, arrancando de quem estivesse lendo o histórico.
   */
  useEffect(() => {
    const ultima = mensagens.dados?.[mensagens.dados.length - 1]?.id ?? null;
    if (ultima === ultimaVista.current) return;
    ultimaVista.current = ultima;
    fimDaThread.current?.scrollIntoView({ block: 'end' });
  }, [mensagens.dados]);

  // Trocar de conversa ou receber a thread atualizada encerra a espera. O
  // guarda evita trocar uma lista vazia por outra lista vazia a cada ciclo de
  // revalidação, o que renderizaria a tela à toa.
  useEffect(() => {
    setPendentes((atuais) => (atuais.length ? [] : atuais));
  }, [mensagens.dados, abertaId]);

  /** Sobe o arquivo e manda pelo WhatsApp, usando o texto atual como legenda. */
  async function enviarArquivo(arquivo: Blob, nome: string) {
    if (!atual) return;
    setEnviandoMidia(true);
    try {
      const { caminho, erro } = await subirMidia(clinicaId, arquivo, nome);
      if (erro) {
        alertar(erro);
        return;
      }

      const ok = await executar(
        () =>
          whatsapp
            .enviarMidia({
              conversaId: atual.conversa_id,
              caminho,
              tipo: tipoDoArquivo(arquivo.type || ''),
              legenda: null,
              nomeArquivo: nome,
              mimetype: arquivo.type || null,
            })
            .then(() => ({ error: null })),
        'Arquivo enviado',
      );

      if (ok) setPulso((n) => n + 1);
    } finally {
      setEnviandoMidia(false);
    }
  }

  async function enviarTexto(conteudo: string) {
    if (!conteudo || !atual) return;

    const provisoria = { id: `pendente-${crypto.randomUUID()}`, conteudo };
    setPendentes((atuais) => [...atuais, provisoria]);

    // O servidor entrega no WhatsApp e grava o registro numa operação só —
    // assim a tela nunca mostra uma mensagem que não saiu.
    const ok = await executar(
      () => whatsapp.enviar(atual.conversa_id, conteudo).then(() => ({ error: null })),
      'Mensagem enviada',
    );

    if (ok) {
      setPulso((n) => n + 1);
    } else {
      // Falhou: a bolha some junto com o aviso de erro, senão a pessoa acha
      // que a mensagem saiu.
      setPendentes((atuais) => atuais.filter((p) => p.id !== provisoria.id));
    }
  }

  /** Tira a conversa da fila, ou devolve para ela. */
  async function alternarConclusao() {
    if (!atual) return;
    const finalizando = atual.status !== 'resolvida';
    await executar(
      () =>
        supabase
          .from('conversas')
          .update({ status: finalizando ? 'resolvida' : 'aberta' })
          .eq('id', atual.conversa_id),
      finalizando ? 'Atendimento finalizado' : 'Atendimento reaberto',
      () => setPulso((n) => n + 1),
    );
  }

  async function alternarAtendimento() {
    if (!atual) return;
    const assumindo = atual.ia_ativa;

    await executar(
      () =>
        supabase
          .from('conversas')
          .update(
            assumindo
              ? { assumida_por: membroId, assumida_em: new Date().toISOString() }
              : { assumida_por: null, assumida_em: null, ia_ativa: true },
          )
          .eq('id', atual.conversa_id),
      assumindo ? 'Você assumiu a conversa' : 'Conversa devolvida à IA',
      () => setPulso((n) => n + 1),
    );
  }

  if (!caixa.carregando && !caixa.erro && (caixa.dados ?? []).length === 0) {
    return (
      <div className="caixa-vazia">
        <EstadoVazio
          icone={MessageCircle}
          titulo="Nenhuma conversa ainda"
          texto="Abra a primeira conversa manualmente ou conecte um número de WhatsApp em Minha clínica."
          acao={
            <button className="primary-btn" onClick={() => setModalAberto(true)}>
              <Plus size={15} /> Nova conversa
            </button>
          }
        />
        <ModalNovaConversa
          numeroId={chipValido}
          aberto={modalAberto}
          aoFechar={() => setModalAberto(false)}
          aoCriar={(id) => {
            setConversaId(id);
            setPulso((n) => n + 1);
            avisar('Conversa criada');
          }}
        />
      </div>
    );
  }

  return (
    /* `data-movel` diz qual das três colunas o celular mostra: só cabe uma por
       vez. No desktop o atributo existe e é ignorado — as colunas convivem. */
    <div
      className={`caixa ${contatoAberto ? '' : 'sem-contato'}`}
      data-movel={!atual ? 'lista' : contatoAberto ? 'contato' : 'conversa'}
    >
      {/* ------------------------------------------------------------ lista */}
      <div className="caixa-lista">
        <header className="lista-topo">
          <div className="lista-linha-chip">
            <label className="seletor-chip-lista">
              <Smartphone size={15} />
              <select
                value={chipValido}
                onChange={(e) => setChipFiltro(e.target.value)}
                aria-label="Número de WhatsApp cujas conversas aparecem na lista"
              >
                <option value="">Todos os números</option>
                {(chips.dados ?? []).map((chip) => (
                  <option key={chip.id} value={chip.id}>
                    {chip.apelido}
                    {chip.status === 'conectado'
                      ? ''
                      : ` (${ROTULO_STATUS_CHIP[chip.status] ?? chip.status})`}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} />
            </label>
            <button
              className="botao-icone"
              onClick={() => setModalAberto(true)}
              aria-label="Nova conversa"
              title="Nova conversa"
            >
              <Plus size={16} />
            </button>
          </div>

          <div className="list-tabs" role="tablist">
            {(
              [
                ['aguardando', 'Aguardando'],
                ['atendendo', 'Atendendo'],
                ['finalizadas', 'Finalizadas'],
              ] as const
            ).map(([chave, rotulo]) => (
              <button
                key={chave}
                role="tab"
                aria-selected={aba === chave}
                className={aba === chave ? 'active' : ''}
                onClick={() => setAba(chave)}
              >
                <span>{rotulo}</span>
                {quantos(chave) > 0 && <em>{quantos(chave)}</em>}
              </button>
            ))}
          </div>
        </header>

        <div className="conversation-list">
          <Conteudo
            consulta={caixa}
            linhas={5}
            vazio={<p className="lista-vazia">Nenhuma conversa.</p>}
          >
            {() =>
              lista.length === 0 ? (
                <p className="lista-vazia">Nenhuma conversa neste filtro.</p>
              ) : (
                lista.map((linha) => (
                  <button
                    key={linha.conversa_id}
                    className={atual?.conversa_id === linha.conversa_id ? 'selected' : ''}
                    onClick={() => setConversaId(linha.conversa_id)}
                  >
                    <Avatar nome={linha.nome_completo} foto={linha.foto_url} />

                    <div className="item-corpo">
                      <div className="item-linha">
                        <b>{linha.nome_completo ?? 'Sem nome'}</b>
                        <time>{tempoRelativo(linha.ultima_mensagem_em)}</time>
                      </div>

                      <span className="item-atribuicao">
                        {linha.ia_ativa ? (
                          <>
                            <Bot size={11} /> Atendimento automático
                          </>
                        ) : (
                          <>
                            <Check size={11} /> Com {linha.atendente ?? 'um atendente'}
                          </>
                        )}
                      </span>

                      <span className="item-previa">
                        {linha.ultima_mensagem_previa ?? 'Sem mensagens'}
                      </span>

                      <div className="item-selos">
                        {(linha.etiquetas ?? []).slice(0, 2).map((etiqueta) => (
                          <span className="selo selo-ouro" key={etiqueta}>
                            {etiqueta}
                          </span>
                        ))}
                        {linha.origem && (
                          <span className="selo">{ROTULO_ORIGEM[linha.origem] ?? linha.origem}</span>
                        )}
                        {linha.nao_lidas > 0 && <span className="selo-contador">{linha.nao_lidas}</span>}
                      </div>
                    </div>
                  </button>
                ))
              )
            }
          </Conteudo>
        </div>
      </div>

      {/* -------------------------------------------------------------- chat */}
      <div className="chat">
        {atual ? (
          <>
            <header className="chat-head">
              {/* Volta para a lista no celular; escondido onde as duas colunas cabem. */}
              <button
                type="button"
                className="botao-icone chat-voltar"
                onClick={() => setConversaId(null)}
                aria-label="Voltar para a lista de conversas"
              >
                <ArrowLeft size={18} />
              </button>
              <Avatar
                nome={atual.nome_completo}
                foto={atual.foto_url}
                className="patient-avatar sage"
              />
              <div className="chat-quem">
                <b>{atual.nome_completo ?? 'Sem nome'}</b>
                <span>
                  <i className={atual.ia_ativa ? 'ponto-ia' : 'ponto-humano'} />
                  {atual.ia_ativa ? 'atendimento automático' : `com ${atual.atendente ?? 'atendente'}`}
                </span>
              </div>

              <div className="chat-acoes">
                {chipDe.get(atual.conversa_id) && (
                  <span className="selo-chip" title="Número que atende esta conversa">
                    <Smartphone size={13} />
                    {nomeDoChip.get(chipDe.get(atual.conversa_id)!) ?? 'Número removido'}
                  </span>
                )}
                <button className="secondary-btn" onClick={alternarAtendimento} disabled={ocupado}>
                  {atual.ia_ativa ? 'Assumir conversa' : 'Devolver para a IA'}
                </button>
                <button
                  className="secondary-btn"
                  onClick={alternarConclusao}
                  disabled={ocupado}
                >
                  {atual.status === 'resolvida' ? 'Reabrir' : 'Finalizar'}
                </button>
                <button
                  className={`botao-icone ${contatoAberto ? 'ativo' : ''}`}
                  onClick={() => setContatoAberto((v) => !v)}
                  aria-label={
                    contatoAberto ? 'Ocultar informações do contato' : 'Informações do contato'
                  }
                  title="Informações do contato"
                >
                  <PanelRight size={16} />
                </button>
              </div>
            </header>

            <div className="messages">
              <Conteudo
                consulta={mensagens}
                linhas={3}
                vazio={
                  <p className="lista-vazia">
                    Nenhuma mensagem nesta conversa. Escreva a primeira abaixo.
                  </p>
                }
              >
                {(itens) =>
                  itens.map((m) => (
                    <div
                      className={`message ${m.autor === 'paciente' ? 'client' : 'ai'}`}
                      key={m.id}
                    >
                      {m.autor === 'ia' &&
                        (m.numero_whatsapp_id && chipPrincipal === m.numero_whatsapp_id ? (
                          // A abertura com que o principal assume o lead: fala da equipe.
                          <small>
                            <Check size={11} /> EQUIPE
                          </small>
                        ) : (
                          <small>
                            <Sparkles size={11} /> IA
                          </small>
                        ))}
                      {m.autor === 'humano' && <small>VOCÊ</small>}
                      {m.autor === 'sistema' && (
                        <small>
                          <Megaphone size={11} /> CAMPANHA
                        </small>
                      )}
                      {m.midia_url && (
                        <MidiaMensagem
                          midiaUrl={m.midia_url}
                          tipo={m.tipo_conteudo}
                          legenda={m.conteudo}
                        />
                      )}
                      {m.conteudo && <p>{m.conteudo}</p>}
                      <time>
                        {m.autor !== 'paciente' && m.numero_whatsapp_id && nomeDoChip.has(m.numero_whatsapp_id)
                          ? `${nomeDoChip.get(m.numero_whatsapp_id)} · `
                          : ''}
                        {hora(m.criado_em)}
                      </time>
                    </div>
                  ))
                }
              </Conteudo>

              {pendentes.map((p) => (
                <div className="message ai pendente" key={p.id}>
                  <small>VOCÊ</small>
                  <p>{p.conteudo}</p>
                  <time>enviando...</time>
                </div>
              ))}

              <div ref={fimDaThread} />
            </div>

            <Composicao
              aoEnviarTexto={enviarTexto}
              aoEnviarArquivo={enviarArquivo}
              ocupado={ocupado}
              enviandoMidia={enviandoMidia}
            />
          </>
        ) : (
          <EstadoVazio
            icone={MessageCircle}
            titulo="Nenhuma conversa aberta"
            texto="Escolha um contato na lista à esquerda para ver o histórico e responder."
          />
        )}
      </div>

      {/* ---------------------------------------------------------- contato */}
      {contatoAberto && atual && (
        <FichaContato
          contato={atual}
          aoFechar={() => setContatoAberto(false)}
          aoSalvar={() => setPulso((n) => n + 1)}
        />
      )}

      <ModalNovaConversa
        numeroId={chipValido}
        aberto={modalAberto}
        aoFechar={() => setModalAberto(false)}
        aoCriar={(id) => {
          setConversaId(id);
          setPulso((n) => n + 1);
          avisar('Conversa criada');
        }}
      />
    </div>
  );
}

function ModalNovaConversa({
  numeroId,
  aberto,
  aoFechar,
  aoCriar,
}: {
  /** Chip escolhido no topo da lista; a conversa nova nasce nele. */
  numeroId: string;
  aberto: boolean;
  aoFechar: () => void;
  aoCriar: (conversaId: string) => void;
}) {
  const { clinicaId, unidadeId } = useClinica();
  const { executar, ocupado } = useAcao();
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [origem, setOrigem] = useState('whatsapp');

  async function salvar() {
    const digitos = telefoneDigitos(telefone);
    if (!nome.trim() || digitos.length < 12) return;

    await executar(
      async () => {
        const { id, error } = await garantirPaciente({
          clinicaId,
          unidadeId,
          nome: nome.trim(),
          telefone: digitos,
          origem: origem as never,
        });
        if (error || !id) return { error };

        // Uma thread por paciente e canal: se já existe, reaproveita.
        const { data: existente } = await supabase
          .from('conversas')
          .select('id')
          .eq('clinica_id', clinicaId)
          .eq('paciente_id', id)
          .eq('canal', 'whatsapp')
          .maybeSingle();

        if (existente) {
          aoCriar(existente.id);
          return { error: null };
        }

        const { data, error: erroConversa } = await supabase
          .from('conversas')
          .insert({
            clinica_id: clinicaId,
            unidade_id: unidadeId,
            paciente_id: id,
            canal: 'whatsapp',
            numero_whatsapp_id: numeroId || null,
          })
          .select('id')
          .single();

        if (data) aoCriar(data.id);
        return { error: erroConversa };
      },
      'Conversa aberta',
      () => {
        setNome('');
        setTelefone('');
        aoFechar();
      },
    );
  }

  return (
    <Modal
      titulo="Nova conversa"
      descricao="O telefone identifica o contato — se já existir, abrimos a conversa dele."
      aberto={aberto}
      aoFechar={aoFechar}
      aoConfirmar={salvar}
      rotuloConfirmar="Abrir conversa"
      salvando={ocupado}
    >
      <Campo rotulo="Nome do contato">
        <input value={nome} onChange={(e) => setNome(e.target.value)} required autoFocus />
      </Campo>
      <Campo rotulo="Telefone (com DDD)" dica="Ex.: (11) 99845-2031">
        <input
          value={telefone}
          onChange={(e) => setTelefone(e.target.value)}
          placeholder="(11) 99845-2031"
          required
        />
      </Campo>
      <Campo rotulo="Origem">
        <select value={origem} onChange={(e) => setOrigem(e.target.value)}>
          {Object.entries(ROTULO_ORIGEM).map(([valor, rotulo]) => (
            <option key={valor} value={valor}>
              {rotulo}
            </option>
          ))}
        </select>
      </Campo>
      <p className="modal-nota">
        <UserPlus size={14} /> O contato entra como lead e pode virar oportunidade na Lista de Leads.
      </p>
    </Modal>
  );
}
