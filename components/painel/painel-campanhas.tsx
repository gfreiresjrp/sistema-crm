'use client';

import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  FileText,
  ImageIcon,
  Megaphone,
  Pause,
  Paperclip,
  Play,
  Plus,
  Send,
  Smartphone,
  Sparkles,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/cliente';
import { useConsulta } from '@/lib/dados/consulta';
import { useClinica } from '@/lib/dados/sessao';
import { whatsapp } from '@/lib/dados/api';
import { subirMidia, TAMANHO_MAXIMO } from '@/lib/dados/midia';
import {
  moeda,
  numero,
  percentual,
  ROTULO_STATUS_CHIP,
  telefoneVisivel,
} from '@/lib/dados/formato';
import { Cabecalho, Campo, Conteudo, EstadoVazio, Modal, useAcao, useAviso } from './base';
import { contagem, useListasLeads } from './painel-listas';

export type DesempenhoCampanha = {
  campanha_id: string;
  campanha: string;
  status: string;
  investimento: number;
  abordados: number;
  enviados: number;
  responderam: number;
  agendaram: number;
  compareceram: number;
  receita: number;
  retorno_sobre_investimento: number | null;
  taxa_resposta_percentual: number | null;
};

/**
 * Ritmo do disparo, em envios por hora. É o que define o intervalo entre uma
 * mensagem e a próxima (com folga aleatória, para não parecer robô).
 */
export const RITMOS: Array<{ porHora: number; rotulo: string }> = [
  { porHora: 240, rotulo: 'Rápido — uma a cada 10–20 s' },
  { porHora: 120, rotulo: 'Normal — uma a cada 20–40 s' },
  { porHora: 60, rotulo: 'Cuidadoso — uma a cada 40–80 s (chip novo)' },
];

/**
 * O que a IA faz com quem responde a campanha. Fica em
 * `filtro_publico.ia` (a tabela não tem coluna para isso) e o servidor lê em
 * `campanha-do-lead.ts`.
 */
type ModoIa = 'agendamento' | 'venda';
type IaCampanha = { modo: ModoIa; instrucoes: string };

const MODOS_IA: Array<{ valor: ModoIa; rotulo: string; dica: string }> = [
  {
    valor: 'agendamento',
    rotulo: 'Agendar avaliação ou procedimento',
    dica: 'A IA tira dúvidas, oferece horários livres da agenda e passa para a equipe confirmar.',
  },
  {
    valor: 'venda',
    rotulo: 'Vender produto direto',
    dica: 'A IA apresenta o produto e, quando a pessoa quer comprar, passa para a equipe fechar. Não oferece horário.',
  },
];

function iaDaCampanha(filtro: unknown): IaCampanha {
  const ia = ((filtro ?? {}) as { ia?: Partial<IaCampanha> }).ia;
  return { modo: ia?.modo === 'venda' ? 'venda' : 'agendamento', instrucoes: ia?.instrucoes ?? '' };
}

/** Vínculo campanha → número responsável (tabela `campanha_numeros`). */
type VinculoNumero = {
  id: string;
  campanha_id: string;
  numero_whatsapp_id: string;
};

type Chip = {
  numero_id: string;
  apelido: string;
  numero: string;
  status: string;
  enviados_hoje: number;
  limite_diario: number;
  uso_percentual: number | null;
};

export function useDesempenhoCampanhas(clinicaId: string, pulso = 0) {
  return useConsulta<DesempenhoCampanha[]>(
    clinicaId
      ? () =>
          supabase
            .from('vw_desempenho_campanhas')
            .select('*')
            .eq('clinica_id', clinicaId)
            .order('receita', { ascending: false })
      : null,
    [clinicaId], [pulso],
  );
}

export function PainelCampanhas() {
  const { clinicaId } = useClinica();
  const { executar, ocupado } = useAcao();
  const [pulso, setPulso] = useState(0);
  const [modalAberto, setModalAberto] = useState(false);

  const campanhas = useDesempenhoCampanhas(clinicaId, pulso);

  const chips = useConsulta<Chip[]>(
    clinicaId
      ? () =>
          supabase
            .from('vw_saude_chips')
            .select('*')
            .eq('clinica_id', clinicaId)
            .order('apelido')
      : null,
    [clinicaId], [pulso],
  );

  // O principal recebe os leads qualificados e não dispara campanha.
  const principais = useConsulta<Array<{ id: string }>>(
    clinicaId
      ? () =>
          supabase
            .from('numeros_whatsapp')
            .select('id')
            .eq('clinica_id', clinicaId)
            .eq('peso_rotacao', 0)
      : null,
    [clinicaId], [pulso],
  );
  const principalIds = new Set((principais.dados ?? []).map((p) => p.id));

  const conectados = (chips.dados ?? []).filter(
    (c) => c.status === 'conectado' && !principalIds.has(c.numero_id),
  ).length;

  const vinculos = useConsulta<VinculoNumero[]>(
    clinicaId
      ? () =>
          supabase
            .from('campanha_numeros')
            .select('id, campanha_id, numero_whatsapp_id')
            .eq('clinica_id', clinicaId)
      : null,
    [clinicaId], [pulso],
  );

  const ritmos = useConsulta<
    Array<{ id: string; envios_por_hora: number | null; filtro_publico: unknown }>
  >(
    clinicaId
      ? () =>
          supabase
            .from('campanhas')
            .select('id, envios_por_hora, filtro_publico')
            .eq('clinica_id', clinicaId)
      : null,
    [clinicaId], [pulso],
  );
  const filtroDaCampanha = new Map((ritmos.dados ?? []).map((r) => [r.id, r.filtro_publico]));
  const [editandoIa, setEditandoIa] = useState<DesempenhoCampanha | null>(null);
  const ritmoDaCampanha = new Map(
    (ritmos.dados ?? []).map((r) => [r.id, r.envios_por_hora ?? 240]),
  );

  async function definirRitmo(campanha: DesempenhoCampanha, porHora: number) {
    await executar(
      () =>
        supabase
          .from('campanhas')
          .update({ envios_por_hora: porHora })
          .eq('id', campanha.campanha_id),
      `Ritmo de "${campanha.campanha}" atualizado — vale para o próximo disparo`,
      () => setPulso((n) => n + 1),
    );
  }

  const numeroDaCampanha = new Map(
    (vinculos.dados ?? []).map((v) => [v.campanha_id, v.numero_whatsapp_id]),
  );

  /**
   * Troca o número responsável. Vazio volta para a rotação automática.
   * A tabela aceita vários números por campanha, mas aqui a escolha é única:
   * é o que a pessoa consegue raciocinar ("essa campanha sai do chip novo").
   */
  async function definirNumero(campanha: DesempenhoCampanha, numeroId: string) {
    await executar(
      async () => {
        const { error: erroLimpar } = await supabase
          .from('campanha_numeros')
          .delete()
          .eq('campanha_id', campanha.campanha_id);
        if (erroLimpar) return { error: erroLimpar };
        if (!numeroId) return { error: null };
        return supabase.from('campanha_numeros').insert({
          clinica_id: clinicaId,
          campanha_id: campanha.campanha_id,
          numero_whatsapp_id: numeroId,
        });
      },
      numeroId
        ? `"${campanha.campanha}" sai pelo número escolhido`
        : `"${campanha.campanha}" volta para a rotação automática`,
      () => setPulso((n) => n + 1),
    );
  }

  /**
   * Quantos envios de cada campanha ainda estão na fila. É o que diz se a
   * campanha terminou: sem pendentes, todo mundo da lista já recebeu (ou
   * falhou) e não há mais nada para a fila fazer.
   */
  const envios = useConsulta<Array<{ campanha_id: string; status: string }>>(
    clinicaId
      ? () =>
          supabase
            .from('envios_campanha')
            .select('campanha_id, status')
            .eq('clinica_id', clinicaId)
            .limit(5000)
      : null,
    [clinicaId], [pulso],
  );

  const andamento = new Map<string, { total: number; pendentes: number }>();
  for (const e of envios.dados ?? []) {
    const atual = andamento.get(e.campanha_id) ?? { total: 0, pendentes: 0 };
    atual.total += 1;
    if (e.status === 'pendente') atual.pendentes += 1;
    andamento.set(e.campanha_id, atual);
  }

  /*
   * A campanha em andamento que esvaziou a fila vira concluída sozinha. Quem
   * faz isso é a tela porque o agendador não tem permissão de mexer em
   * campanhas; basta alguém abrir Campanhas para o status acertar.
   */
  const concluidas = (campanhas.dados ?? []).filter((c) => {
    const a = andamento.get(c.campanha_id);
    return c.status === 'em_andamento' && a && a.total > 0 && a.pendentes === 0;
  });
  const idsConcluidas = concluidas.map((c) => c.campanha_id).join(',');
  useEffect(() => {
    if (!idsConcluidas) return;
    void supabase
      .from('campanhas')
      .update({ status: 'concluida' })
      .in('id', idsConcluidas.split(','))
      .then(() => setPulso((n) => n + 1));
  }, [idsConcluidas]);

  /** Inicia o envio para a lista inteira. Daqui em diante a fila anda sozinha. */
  async function iniciar(campanha: DesempenhoCampanha) {
    await executar(
      async () => {
        const r = await whatsapp.dispararCampanha(campanha.campanha_id);
        return { error: null, resultado: r };
      },
      `"${campanha.campanha}" iniciada — vai enviar para a lista inteira sozinha`,
      () => setPulso((n) => n + 1),
    );
  }

  /** Pausa ou retoma a fila de verdade, na UazApi. */
  async function controlar(campanha: DesempenhoCampanha, acao: 'pausar' | 'retomar') {
    await executar(
      () =>
        whatsapp.controlarCampanha(campanha.campanha_id, acao).then(() => ({ error: null })),
      acao === 'pausar' ? `"${campanha.campanha}" pausada` : `"${campanha.campanha}" retomada`,
      () => setPulso((n) => n + 1),
    );
  }

  return (
    <>
      <Cabecalho
        titulo="Campanhas"
        texto="Cada campanha pode ter um número responsável; sem escolha, a rotação decide."
        acao={
          <button className="primary-btn" onClick={() => setModalAberto(true)}>
            <Plus size={15} /> Criar campanha
          </button>
        }
      />

      <div className="chip-health panel">
        <div>
          <i className={conectados ? 'chip-on' : 'chip-off'} />
          <b>
            {conectados} de {(chips.dados ?? []).length} número(s) online
          </b>
          <span>
            {conectados ? 'Rotação disponível para disparo' : 'Cadastre um número em Minha clínica'}
          </span>
        </div>
        {(chips.dados ?? []).map((chip) => (
          <span key={chip.numero_id} title={telefoneVisivel(chip.numero)}>
            {chip.apelido}
            <b>{ROTULO_STATUS_CHIP[chip.status] ?? chip.status}</b>
            <em>
              {numero(chip.enviados_hoje)}/{numero(chip.limite_diario)}
            </em>
          </span>
        ))}
      </div>

      <article className="panel table-panel">
        <div className="panel-title">
          <div>
            <h2>Suas campanhas</h2>
            <p>Resultados calculados a partir dos envios registrados</p>
          </div>
        </div>

        <Conteudo
          consulta={campanhas}
          linhas={3}
          vazio={
            <EstadoVazio
              icone={Megaphone}
              titulo="Nenhuma campanha criada"
              texto="Crie uma campanha para reativar contatos antigos em escala."
              acao={
                <button className="primary-btn" onClick={() => setModalAberto(true)}>
                  <Plus size={15} /> Criar campanha
                </button>
              }
            />
          }
        >
          {(linhas) => (
            <div className="data-table">
              <header>
                <span>CAMPANHA</span>
                <span>NÚMERO</span>
                <span>ENVIADOS</span>
                <span>RESPOSTAS</span>
                <span>AGENDADOS</span>
                <span>RECEITA</span>
                <span>STATUS</span>
              </header>
              {linhas.map((linha) => (
                <div key={linha.campanha_id}>
                  <span className="nome-campanha">
                    {linha.campanha}
                    <button
                      type="button"
                      className={`selo-modo-ia ${iaDaCampanha(filtroDaCampanha.get(linha.campanha_id)).modo}`}
                      onClick={() => setEditandoIa(linha)}
                      title="O que a IA faz com quem responder — clique para editar"
                    >
                      <Sparkles size={11} />
                      {iaDaCampanha(filtroDaCampanha.get(linha.campanha_id)).modo === 'venda'
                        ? 'Venda'
                        : 'Agendamento'}
                    </button>
                  </span>
                  <div className="celula-disparo">
                  <select
                    className="select-etapa"
                    value={numeroDaCampanha.get(linha.campanha_id) ?? ''}
                    disabled={ocupado}
                    onChange={(e) => definirNumero(linha, e.target.value)}
                    aria-label={`Número responsável por ${linha.campanha}`}
                  >
                    <option value="">Rotação automática</option>
                    {(chips.dados ?? []).map((chip) => (
                      <option
                        key={chip.numero_id}
                        value={chip.numero_id}
                        disabled={principalIds.has(chip.numero_id)}
                      >
                        {chip.apelido}
                        {principalIds.has(chip.numero_id)
                          ? ' (principal — não dispara)'
                          : chip.status === 'conectado'
                            ? ''
                            : ` (${ROTULO_STATUS_CHIP[chip.status] ?? chip.status})`}
                      </option>
                    ))}
                  </select>
                  <select
                    className="select-etapa"
                    value={ritmoDaCampanha.get(linha.campanha_id) ?? 240}
                    disabled={ocupado}
                    onChange={(e) => definirRitmo(linha, Number(e.target.value))}
                    aria-label={`Ritmo de envio de ${linha.campanha}`}
                  >
                    {RITMOS.map((r) => (
                      <option key={r.porHora} value={r.porHora}>
                        {r.rotulo.split(' — ')[0]}
                      </option>
                    ))}
                  </select>
                  </div>
                  <span>
                    {numero(linha.enviados)}
                    {Number(linha.abordados) > Number(linha.enviados) && (
                      <small className="na-fila">
                        {' '}
                        +{numero(Number(linha.abordados) - Number(linha.enviados))} na fila
                      </small>
                    )}
                  </span>
                  <span>{numero(linha.responderam)}</span>
                  <span>{numero(linha.agendaram)}</span>
                  <span>{linha.receita ? moeda(linha.receita) : '—'}</span>
                  <ControleCampanha
                    campanha={linha}
                    andamento={andamento.get(linha.campanha_id)}
                    ocupado={ocupado}
                    podeIniciar={conectados > 0}
                    aoIniciar={() => iniciar(linha)}
                    aoControlar={(acao) => controlar(linha, acao)}
                  />
                </div>
              ))}
            </div>
          )}
        </Conteudo>
      </article>

      {editandoIa && (
        <ModalIaCampanha
          campanha={editandoIa}
          filtro={filtroDaCampanha.get(editandoIa.campanha_id)}
          aoFechar={() => setEditandoIa(null)}
          aoSalvar={() => setPulso((n) => n + 1)}
        />
      )}

      <ModalCampanha
        aberto={modalAberto}
        chips={(chips.dados ?? []).filter((c) => !principalIds.has(c.numero_id))}
        aoFechar={() => setModalAberto(false)}
        aoCriar={() => setPulso((n) => n + 1)}
      />
    </>
  );
}

/** Os dois campos que dizem à IA como tratar quem responder a campanha. */
function CamposIa({
  modo,
  instrucoes,
  aoMudarModo,
  aoMudarInstrucoes,
}: {
  modo: ModoIa;
  instrucoes: string;
  aoMudarModo: (modo: ModoIa) => void;
  aoMudarInstrucoes: (texto: string) => void;
}) {
  const escolhido = MODOS_IA.find((m) => m.valor === modo)!;
  return (
    <>
      <Campo rotulo="O que a IA faz com quem responder" dica={escolhido.dica}>
        <select value={modo} onChange={(e) => aoMudarModo(e.target.value as ModoIa)}>
          {MODOS_IA.map((m) => (
            <option key={m.valor} value={m.valor}>
              {m.rotulo}
            </option>
          ))}
        </select>
      </Campo>
      <Campo
        rotulo="Instruções para a IA nesta campanha (opcional)"
        dica={
          modo === 'venda'
            ? 'O que ela precisa saber para vender: produto, preço, formas de pagamento, prazo, link. Ela não inventa nada fora disto.'
            : 'O que ela precisa saber desta oferta: procedimento, condição especial, validade, o que falar e o que evitar.'
        }
      >
        <textarea
          value={instrucoes}
          onChange={(e) => aoMudarInstrucoes(e.target.value)}
          rows={4}
          placeholder={
            modo === 'venda'
              ? 'Ex.: Kit Home Care Pele Radiante, R$ 289 à vista ou 3x sem juros no cartão. Entrega em 2 dias para Porto Alegre.'
              : 'Ex.: Avaliação de full face gratuita até 30/10. Não falar de preço antes da avaliação.'
          }
        />
      </Campo>
    </>
  );
}

/** Edita o modo e as instruções da IA de uma campanha já criada. */
function ModalIaCampanha({
  campanha,
  filtro,
  aoFechar,
  aoSalvar,
}: {
  campanha: DesempenhoCampanha;
  filtro: unknown;
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const { executar, ocupado } = useAcao();
  const atual = iaDaCampanha(filtro);
  const [modo, setModo] = useState<ModoIa>(atual.modo);
  const [instrucoes, setInstrucoes] = useState(atual.instrucoes);

  async function salvar() {
    await executar(
      () =>
        supabase
          .from('campanhas')
          .update({
            // Mantém lista e anexo: só a parte da IA muda.
            filtro_publico: {
              ...((filtro ?? {}) as Record<string, unknown>),
              ia: { modo, instrucoes: instrucoes.trim() },
            },
          })
          .eq('id', campanha.campanha_id),
      `IA de "${campanha.campanha}" atualizada — vale para as próximas respostas`,
      () => {
        aoSalvar();
        aoFechar();
      },
    );
  }

  return (
    <Modal
      titulo={`IA da campanha "${campanha.campanha}"`}
      descricao="Como a IA conduz a conversa com quem responder esta campanha."
      aberto
      aoFechar={aoFechar}
      aoConfirmar={salvar}
      rotuloConfirmar="Salvar"
      salvando={ocupado}
    >
      <CamposIa
        modo={modo}
        instrucoes={instrucoes}
        aoMudarModo={setModo}
        aoMudarInstrucoes={setInstrucoes}
      />
    </Modal>
  );
}

/**
 * O único controle da campanha. Não existe envio manual: iniciada, a fila
 * manda para a lista inteira sozinha, no ritmo escolhido, até o último
 * contato. Aqui só se inicia, pausa ou retoma — e se vê quanto já foi.
 */
function ControleCampanha({
  campanha,
  andamento,
  ocupado,
  podeIniciar,
  aoIniciar,
  aoControlar,
}: {
  campanha: DesempenhoCampanha;
  andamento: { total: number; pendentes: number } | undefined;
  ocupado: boolean;
  podeIniciar: boolean;
  aoIniciar: () => void;
  aoControlar: (acao: 'pausar' | 'retomar') => void;
}) {
  const total = andamento?.total ?? 0;
  const feitos = total - (andamento?.pendentes ?? 0);
  const progresso = total ? `${numero(feitos)} de ${numero(total)}` : '';

  if (campanha.status === 'concluida') {
    return (
      <div className="controle-campanha">
        <span className="estado-campanha concluida">
          <CheckCircle2 size={14} /> Concluída{progresso ? ` · ${progresso}` : ''}
        </span>
      </div>
    );
  }

  if (campanha.status === 'em_andamento' || campanha.status === 'pausada') {
    const pausada = campanha.status === 'pausada';
    return (
      <div className="controle-campanha">
        <span className={`estado-campanha ${pausada ? 'pausada' : 'enviando'}`}>
          {!pausada && <i />}
          {pausada ? 'Pausada' : 'Enviando'}
          {progresso ? ` · ${progresso}` : ''}
        </span>
        <button
          className="secondary-btn"
          disabled={ocupado}
          onClick={() => aoControlar(pausada ? 'retomar' : 'pausar')}
        >
          {pausada ? <Play size={14} /> : <Pause size={14} />}
          {pausada ? 'Retomar' : 'Pausar'}
        </button>
      </div>
    );
  }

  return (
    <div className="controle-campanha">
      <button
        className="primary-btn"
        disabled={ocupado || !podeIniciar}
        onClick={aoIniciar}
        title={
          podeIniciar
            ? 'Envia para a lista inteira sozinha, no ritmo escolhido, até o último contato'
            : 'Conecte um chip de disparo primeiro'
        }
      >
        <Send size={14} /> Iniciar campanha
      </button>
    </div>
  );
}

/**
 * Objetivos que uma clínica estética de fato usa. Cada um já traz uma sugestão
 * de mensagem, porque a folha em branco é onde a maioria das campanhas morre.
 */
const OBJETIVOS: Array<{ chave: string; rotulo: string; mensagem: string }> = [
  {
    chave: 'reativar',
    rotulo: 'Reativar quem não vem há meses',
    mensagem:
      'Oi {{primeiro_nome}}! Faz um tempo que a gente não se vê por aqui 💛 Preparei uma condição especial para você voltar. Quer que eu veja um horário?',
  },
  {
    chave: 'retorno',
    rotulo: 'Chamar para o retorno do procedimento',
    mensagem:
      'Oi {{primeiro_nome}}! Já está na época de renovar seu procedimento para manter o resultado. Quer que eu reserve um horário?',
  },
  {
    chave: 'orcamento',
    rotulo: 'Retomar orçamento que não fechou',
    mensagem:
      'Oi {{primeiro_nome}}! Passando para saber se ficou alguma dúvida sobre o que conversamos. Posso te ajudar a decidir?',
  },
  {
    chave: 'promocao',
    rotulo: 'Divulgar promoção ou novidade',
    mensagem:
      'Oi {{primeiro_nome}}! Temos uma novidade na clínica esta semana com condição especial. Quer saber mais?',
  },
  {
    chave: 'aniversario',
    rotulo: 'Felicitar aniversariantes do mês',
    mensagem:
      'Oi {{primeiro_nome}}, feliz aniversário! 🎉 Preparamos um mimo para você comemorar com a gente. Quer que eu conte?',
  },
  {
    chave: 'avaliacao',
    rotulo: 'Convidar para avaliação gratuita',
    mensagem:
      'Oi {{primeiro_nome}}! Estamos com agenda aberta para avaliação sem custo esta semana. Quer garantir a sua?',
  },
  {
    chave: 'outro',
    rotulo: 'Outro objetivo (escrever)',
    mensagem: '',
  },
];

function ModalCampanha({
  aberto,
  chips,
  aoFechar,
  aoCriar,
}: {
  aberto: boolean;
  chips: Chip[];
  aoFechar: () => void;
  aoCriar: () => void;
}) {
  const { clinicaId, unidadeId, membroId } = useClinica();
  const { executar, ocupado } = useAcao();
  const { alertar } = useAviso();

  const [nome, setNome] = useState('');
  // Imagem ou documento que vai junto; a mensagem vira a legenda dele.
  const [arquivo, setArquivo] = useState<File | null>(null);

  function escolherArquivo(escolhido: File | null) {
    if (!escolhido) return setArquivo(null);
    if (escolhido.size > TAMANHO_MAXIMO) {
      alertar('O arquivo precisa ter até 25 MB.');
      return;
    }
    if (escolhido.type.startsWith('video/') || escolhido.type.startsWith('audio/')) {
      alertar('A campanha aceita imagem ou documento.');
      return;
    }
    setArquivo(escolhido);
  }
  const [objetivoChave, setObjetivoChave] = useState('reativar');
  const [objetivoLivre, setObjetivoLivre] = useState('');
  const [modelo, setModelo] = useState(OBJETIVOS[0].mensagem);
  const [numeroId, setNumeroId] = useState('');
  const [porHora, setPorHora] = useState(240);
  const [modoIa, setModoIa] = useState<ModoIa>('agendamento');
  const [instrucoesIa, setInstrucoesIa] = useState('');
  // Público: uma lista de leads ou, sem escolha, toda a base que aceita marketing.
  const [listaId, setListaId] = useState('');
  const listas = useListasLeads(clinicaId, aberto ? 1 : 0);
  // Escolher outro objetivo troca a mensagem sugerida, mas nunca por cima de
  // um texto que a pessoa já ajustou.
  const [mensagemTocada, setMensagemTocada] = useState(false);

  const objetivo =
    objetivoChave === 'outro'
      ? objetivoLivre
      : (OBJETIVOS.find((o) => o.chave === objetivoChave)?.rotulo ?? '');

  function escolherObjetivo(chave: string) {
    setObjetivoChave(chave);
    const escolhido = OBJETIVOS.find((o) => o.chave === chave);
    if (escolhido?.mensagem && !mensagemTocada) setModelo(escolhido.mensagem);
  }

  async function salvar() {
    if (!nome.trim()) return;
    if (!modelo.trim() && !arquivo) {
      alertar('Escreva a mensagem ou anexe uma imagem ou documento.');
      return;
    }
    await executar(
      async () => {
        let anexo: {
          caminho: string;
          tipo: 'imagem' | 'documento';
          nome: string;
          mimetype: string | null;
        } | null = null;
        if (arquivo) {
          const { caminho, erro } = await subirMidia(clinicaId, arquivo, arquivo.name);
          if (erro) return { error: { message: erro } };
          anexo = {
            caminho,
            tipo: arquivo.type.startsWith('image/') ? 'imagem' : 'documento',
            nome: arquivo.name,
            mimetype: arquivo.type || null,
          };
        }

        const { data: criada, error } = await supabase
          .from('campanhas')
          .insert({
            clinica_id: clinicaId,
            unidade_id: unidadeId,
            nome: nome.trim(),
            objetivo: objetivo.trim() || null,
            modelo_mensagem: modelo,
            // O anexo mora aqui porque a tabela não tem coluna para ele.
            filtro_publico: {
              ...(listaId ? { lista_id: listaId } : {}),
              ...(anexo ? { anexo } : {}),
              ia: { modo: modoIa, instrucoes: instrucoesIa.trim() },
            },
            envios_por_hora: porHora,
            criado_por: membroId,
          })
          .select('id')
          .single();
        if (error || !criada) return { error };
        if (!numeroId) return { error: null };
        return supabase.from('campanha_numeros').insert({
          clinica_id: clinicaId,
          campanha_id: criada.id,
          numero_whatsapp_id: numeroId,
        });
      },
      'Campanha criada como rascunho',
      () => {
        setNome('');
        setObjetivoLivre('');
        setNumeroId('');
        setPorHora(240);
        setModoIa('agendamento');
        setInstrucoesIa('');
        setArquivo(null);
        setListaId('');
        setMensagemTocada(false);
        aoCriar();
        aoFechar();
      },
    );
  }

  return (
    <Modal
      titulo="Criar campanha"
      descricao="Ela nasce como rascunho. Ao clicar em Iniciar campanha, envia sozinha para a lista inteira."
      aberto={aberto}
      aoFechar={aoFechar}
      aoConfirmar={salvar}
      rotuloConfirmar="Criar"
      salvando={ocupado}
    >
      <Campo rotulo="Nome da campanha">
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Clientes inativos — setembro"
          required
          autoFocus
        />
      </Campo>
      <Campo rotulo="Objetivo" dica="Escolher um objetivo já sugere a mensagem.">
        <select value={objetivoChave} onChange={(e) => escolherObjetivo(e.target.value)}>
          {OBJETIVOS.map((o) => (
            <option key={o.chave} value={o.chave}>
              {o.rotulo}
            </option>
          ))}
        </select>
      </Campo>

      {objetivoChave === 'outro' && (
        <Campo rotulo="Qual o objetivo?">
          <input
            value={objetivoLivre}
            onChange={(e) => setObjetivoLivre(e.target.value)}
            placeholder="Trazer de volta quem não vem há 6 meses"
          />
        </Campo>
      )}

      <Campo rotulo="Mensagem" dica="Use {{primeiro_nome}} para personalizar.">
        <textarea
          value={modelo}
          onChange={(e) => {
            setModelo(e.target.value);
            setMensagemTocada(true);
          }}
          rows={4}
        />
      </Campo>
      <CamposIa
        modo={modoIa}
        instrucoes={instrucoesIa}
        aoMudarModo={setModoIa}
        aoMudarInstrucoes={setInstrucoesIa}
      />
      <Campo
        rotulo="Imagem ou documento (opcional)"
        dica="Vai junto com cada mensagem; o texto acima vira a legenda. Até 25 MB."
      >
        {arquivo ? (
          <div className="anexo-campanha">
            {arquivo.type.startsWith('image/') ? <ImageIcon size={16} /> : <FileText size={16} />}
            <span>{arquivo.name}</span>
            <button
              type="button"
              className="botao-icone"
              onClick={() => setArquivo(null)}
              aria-label="Remover anexo"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <label className="anexo-campanha anexo-vazio">
            <Paperclip size={16} />
            <span>Escolher arquivo</span>
            <input
              type="file"
              accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
              onChange={(e) => escolherArquivo(e.target.files?.[0] ?? null)}
            />
          </label>
        )}
      </Campo>
      <Campo rotulo="Público" dica="Só recebem contatos que aceitaram receber mensagens.">
        <select value={listaId} onChange={(e) => setListaId(e.target.value)}>
          <option value="">Toda a base de contatos</option>
          {(listas.dados ?? []).map((l) => (
            <option key={l.id} value={l.id}>
              {l.nome} ({contagem(l)})
            </option>
          ))}
        </select>
      </Campo>
      <Campo
        rotulo="Número responsável"
        dica="Sem escolha, o disparo usa o número conectado com mais folga no dia."
      >
        <select value={numeroId} onChange={(e) => setNumeroId(e.target.value)}>
          <option value="">Rotação automática</option>
          {chips.map((chip) => (
            <option key={chip.numero_id} value={chip.numero_id}>
              {chip.apelido}
              {chip.status === 'conectado' ? '' : ` (${ROTULO_STATUS_CHIP[chip.status] ?? chip.status})`}
            </option>
          ))}
        </select>
      </Campo>
      <Campo
        rotulo="Ritmo de envio"
        dica="Um clique em Disparar envia para a lista inteira; o ritmo só define o intervalo entre uma mensagem e outra."
      >
        <select value={porHora} onChange={(e) => setPorHora(Number(e.target.value))}>
          {RITMOS.map((r) => (
            <option key={r.porHora} value={r.porHora}>
              {r.rotulo}
            </option>
          ))}
        </select>
      </Campo>
      <p className="modal-nota">
        <Smartphone size={14} /> O público e o disparo dependem de um número de WhatsApp conectado.
      </p>
    </Modal>
  );
}

export function funilDaCampanha(c: DesempenhoCampanha) {
  return [
    // Só conta o que a UazApi confirmou como enviado; o que ainda está na fila
    // não é "abordado" — era essa diferença que fazia a campanha parecer ter
    // falado com gente que não recebeu nada.
    { rotulo: 'Enviados', valor: Number(c.enviados ?? 0), cor: '#6d5527' },
    { rotulo: 'Responderam', valor: Number(c.responderam ?? 0), cor: '#96742f' },
    { rotulo: 'Agendaram', valor: Number(c.agendaram ?? 0), cor: '#c8a15b' },
    { rotulo: 'Compareceram', valor: Number(c.compareceram ?? 0), cor: '#e7d0a1' },
  ];
}

export function resumoCampanha(c: DesempenhoCampanha) {
  return {
    receita: moeda(c.receita),
    roi: c.retorno_sobre_investimento ? `${Number(c.retorno_sobre_investimento).toFixed(1)}x` : '—',
    investido: moeda(c.investimento),
    taxaResposta: percentual(c.taxa_resposta_percentual),
  };
}
