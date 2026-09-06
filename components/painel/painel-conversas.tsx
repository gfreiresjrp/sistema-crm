'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bot,
  Check,
  MessageCircle,
  PanelRight,
  Plus,
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
  criado_em: string;
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
   * Em que estágio do atendimento cada conversa está.
   *
   * Sai do que já existe no banco: resolvida está finalizada; com atendente é
   * atendimento humano; o resto aguarda alguém — inclusive as que a IA está
   * respondendo, porque elas ainda podem precisar de gente.
   */
  const estagio = (linha: LinhaCaixa) =>
    linha.status === 'resolvida'
      ? 'finalizadas'
      : linha.assumida_por
        ? 'atendendo'
        : 'aguardando';

  const termo = busca.trim().toLowerCase();
  const visiveis = (caixa.dados ?? []).filter((linha) =>
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
            .select('id, autor, conteudo, tipo_conteudo, midia_url, criado_em')
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
          <div className="list-tabs">
            {(
              [
                ['aguardando', 'Aguardando'],
                ['atendendo', 'Atendendo'],
                ['finalizadas', 'Finalizadas'],
              ] as const
            ).map(([chave, rotulo]) => (
              <button
                key={chave}
                className={aba === chave ? 'active' : ''}
                onClick={() => setAba(chave)}
              >
                {rotulo}
                {quantos(chave) > 0 && <em>{quantos(chave)}</em>}
              </button>
            ))}
          </div>
          <button
            className="botao-icone"
            onClick={() => setModalAberto(true)}
            aria-label="Nova conversa"
          >
            <Plus size={16} />
          </button>
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
                      {m.autor === 'ia' && (
                        <small>
                          <Sparkles size={11} /> IA
                        </small>
                      )}
                      {m.autor === 'humano' && <small>VOCÊ</small>}
                      {m.midia_url && (
                        <MidiaMensagem
                          midiaUrl={m.midia_url}
                          tipo={m.tipo_conteudo}
                          legenda={m.conteudo}
                        />
                      )}
                      {m.conteudo && <p>{m.conteudo}</p>}
                      <time>{hora(m.criado_em)}</time>
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
  aberto,
  aoFechar,
  aoCriar,
}: {
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
        <UserPlus size={14} /> O contato entra como lead e pode virar oportunidade no CRM.
      </p>
    </Modal>
  );
}
