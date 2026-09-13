'use client';

import {
  Bot,
  CalendarDays,
  QrCode,
  CircleDollarSign,
  Clock3,
  MessageCircle,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/cliente';
import { useConsulta } from '@/lib/dados/consulta';
import { useClinica } from '@/lib/dados/sessao';
import {
  dataIso,
  dataPorExtenso,
  hora,
  iniciais,
  moedaCompacta,
  numero,
  percentual,
  ROTULO_STATUS_AGENDAMENTO,
  variacao,
} from '@/lib/dados/formato';
import { Cabecalho, Conteudo, EstadoVazio } from './base';
import type { Vista } from './navegacao';

type Indicadores = {
  mes: string;
  conversas_atendidas: number;
  agendamentos: number;
  agendamentos_pela_ia: number;
  comparecimentos: number;
  taxa_conversao_percentual: number;
  receita_total: number;
  receita_atribuida_ia: number;
  ticket_medio: number;
};

type LinhaAgenda = {
  agendamento_id: string;
  inicio: string;
  paciente: string | null;
  procedimento: string | null;
  status: string;
};

const VAZIO: Indicadores = {
  mes: '',
  conversas_atendidas: 0,
  agendamentos: 0,
  agendamentos_pela_ia: 0,
  comparecimentos: 0,
  taxa_conversao_percentual: 0,
  receita_total: 0,
  receita_atribuida_ia: 0,
  ticket_medio: 0,
};

export function PainelDashboard({ ir }: { ir: (v: Vista) => void }) {
  const { clinicaId, unidadeId, perfil } = useClinica();

  // Duas linhas: mês corrente e anterior — a segunda é a base da variação.
  const indicadores = useConsulta<Indicadores[]>(
    clinicaId
      ? () =>
          supabase
            .from('vw_indicadores_mensais')
            .select('*')
            .eq('clinica_id', clinicaId)
            .order('mes', { ascending: false })
            .limit(2)
      : null,
    [clinicaId],
  );

  const agendaHoje = useConsulta<LinhaAgenda[]>(
    clinicaId
      ? () => {
          let consulta = supabase
            .from('vw_agenda')
            .select('agendamento_id, inicio, paciente, procedimento, status')
            .eq('clinica_id', clinicaId)
            .eq('data_local', dataIso(new Date()))
            .neq('status', 'cancelado')
            .order('inicio');
          if (unidadeId) consulta = consulta.eq('unidade_id', unidadeId);
          return consulta;
        }
      : null,
    [clinicaId, unidadeId],
  );

  const atual = indicadores.dados?.[0] ?? VAZIO;
  const anterior = indicadores.dados?.[1] ?? VAZIO;

  const metricas = [
    {
      rotulo: 'Conversas atendidas',
      valor: numero(atual.conversas_atendidas),
      delta: variacao(atual.conversas_atendidas, anterior.conversas_atendidas),
      icone: MessageCircle,
    },
    {
      rotulo: 'Agendamentos',
      valor: numero(atual.agendamentos),
      delta: variacao(atual.agendamentos, anterior.agendamentos),
      icone: CalendarDays,
    },
    {
      rotulo: 'Taxa de conversão',
      valor: percentual(atual.taxa_conversao_percentual),
      delta: variacao(atual.taxa_conversao_percentual, anterior.taxa_conversao_percentual),
      icone: TrendingUp,
    },
    {
      rotulo: 'Receita atribuída',
      valor: moedaCompacta(atual.receita_atribuida_ia),
      delta: variacao(atual.receita_atribuida_ia, anterior.receita_atribuida_ia),
      icone: CircleDollarSign,
    },
  ];

  const saudacao = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Bom dia';
    if (h < 18) return 'Boa tarde';
    return 'Boa noite';
  })();

  return (
    <>
      <Cabecalho
        etiqueta={dataPorExtenso(new Date()).toUpperCase()}
        titulo={`${saudacao}${perfil?.nome_completo ? `, ${perfil.nome_completo.split(' ')[0]}` : ''}.`}
        texto="Seu resumo do mês, direto do que aconteceu na clínica."
      />

      <AvisoWhatsapp ir={ir} />

      <div className="metrics">
        {indicadores.carregando
          ? metricas.map((m) => (
              <article className="metric metric-carregando" key={m.rotulo}>
                <div className="metric-head">
                  <span>{m.rotulo}</span>
                </div>
                <strong>—</strong>
              </article>
            ))
          : metricas.map((m) => (
              <article className="metric" key={m.rotulo}>
                <div className="metric-head">
                  <span>{m.rotulo}</span>
                  <i>
                    <m.icone size={18} />
                  </i>
                </div>
                <strong>{m.valor}</strong>
                <small>
                  <b>{m.delta}</b> vs. mês anterior
                </small>
              </article>
            ))}
      </div>

      <div className="main-grid">
        <FunilDoMes clinicaId={clinicaId} />
        <PainelIA
          agendamentosIA={atual.agendamentos_pela_ia}
          agendamentos={atual.agendamentos}
          ir={ir}
        />
      </div>

      <div className="bottom-grid">
        <article className="panel schedule-panel">
          <div className="panel-title">
            <div>
              <h2>Agenda de hoje</h2>
              <p>
                {agendaHoje.dados?.length
                  ? `${agendaHoje.dados.length} atendimento(s)`
                  : 'Nada marcado ainda'}
              </p>
            </div>
            <button className="link-btn" onClick={() => ir('Agenda')}>
              Ver agenda completa →
            </button>
          </div>

          <Conteudo
            consulta={agendaHoje}
            linhas={3}
            vazio={
              <EstadoVazio
                icone={CalendarDays}
                titulo="Agenda livre hoje"
                texto="Quando houver atendimentos marcados, eles aparecem aqui."
                acao={
                  <button className="secondary-btn" onClick={() => ir('Agenda')}>
                    Criar agendamento
                  </button>
                }
              />
            }
          >
            {(linhas) => (
              <div className="appointments">
                {linhas.map((linha) => (
                  <div className="appointment" key={linha.agendamento_id}>
                    <time>{hora(linha.inicio)}</time>
                    <div className="patient-avatar sage">{iniciais(linha.paciente)}</div>
                    <div className="patient">
                      <b>{linha.paciente ?? 'Sem nome'}</b>
                      <span>{linha.procedimento ?? 'Sem procedimento'}</span>
                    </div>
                    <span
                      className={`status ${linha.status === 'confirmado' ? 'confirmed' : 'waiting'}`}
                    >
                      <i />
                      {ROTULO_STATUS_AGENDAMENTO[linha.status] ?? linha.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Conteudo>
        </article>

        <FollowupsDoDia clinicaId={clinicaId} />
      </div>
    </>
  );
}

/* --------------------------------------------------------------- funil do mês */

type LinhaFunil = {
  etapa_id: string;
  etapa: string;
  cor: string;
  ordem: number;
  oportunidades_abertas: number;
  valor_em_aberto: number;
};

function FunilDoMes({ clinicaId }: { clinicaId: string }) {
  const funil = useConsulta<LinhaFunil[]>(
    clinicaId
      ? () =>
          supabase
            .from('vw_funil_crm')
            .select('etapa_id, etapa, cor, ordem, oportunidades_abertas, valor_em_aberto')
            .eq('clinica_id', clinicaId)
            .order('ordem')
      : null,
    [clinicaId],
  );

  const linhas = funil.dados ?? [];
  const total = linhas.reduce((soma, l) => soma + Number(l.oportunidades_abertas), 0);
  const valorTotal = linhas.reduce((soma, l) => soma + Number(l.valor_em_aberto ?? 0), 0);
  const maior = Math.max(1, ...linhas.map((l) => Number(l.oportunidades_abertas)));

  return (
    <article className="panel funnel-panel">
      <div className="panel-title">
        <div>
          <h2>Funil de vendas</h2>
          <p>
            {total ? `${numero(total)} oportunidade(s) em aberto` : 'Nenhuma oportunidade aberta'}
          </p>
        </div>
      </div>

      <Conteudo
        consulta={funil}
        linhas={4}
        vazio={
          <EstadoVazio
            icone={TrendingUp}
            titulo="Funil ainda vazio"
            texto="Cadastre um lead na Lista de Leads para acompanhar a jornada dele aqui."
          />
        }
      >
        {() =>
          total === 0 ? (
            <EstadoVazio
              icone={TrendingUp}
              titulo="Funil ainda vazio"
              texto="Cadastre um lead na Lista de Leads para acompanhar a jornada dele aqui."
            />
          ) : (
            <div className="funnel-content">
              <div className="funnel-bars">
                {linhas.map((linha) => (
                  <div className="funnel-row" key={linha.etapa_id}>
                    <div
                      className="bar"
                      style={{
                        width: `${Math.max(8, (Number(linha.oportunidades_abertas) / maior) * 100)}%`,
                        background: linha.cor,
                      }}
                    >
                      <span>{numero(linha.oportunidades_abertas)}</span>
                    </div>
                    <label>{linha.etapa}</label>
                  </div>
                ))}
              </div>
              <div className="campaign-return">
                <span>VALOR EM ABERTO</span>
                <strong>{moedaCompacta(valorTotal)}</strong>
                <p>
                  <b>{numero(total)}</b> oportunidade(s) em negociação
                </p>
              </div>
            </div>
          )
        }
      </Conteudo>
    </article>
  );
}

/* --------------------------------------------------------------- painel da IA */

function PainelIA({
  agendamentosIA,
  agendamentos,
  ir,
}: {
  agendamentosIA: number;
  agendamentos: number;
  ir: (v: Vista) => void;
}) {
  const { clinicaId } = useClinica();

  const configuracao = useConsulta<{ nome_assistente: string; atendimento_24h: boolean } | null>(
    clinicaId
      ? () =>
          supabase
            .from('configuracoes_ia')
            .select('nome_assistente, atendimento_24h')
            .eq('clinica_id', clinicaId)
            .is('unidade_id', null)
            .maybeSingle()
      : null,
    [clinicaId],
  );

  const ativa = configuracao.dados?.atendimento_24h ?? false;
  const nome = configuracao.dados?.nome_assistente ?? 'Sua assistente';
  const participacao = agendamentos ? Math.round((agendamentosIA / agendamentos) * 100) : 0;

  return (
    <article className="panel ai-panel">
      <div className="ai-icon">
        <Bot size={22} />
      </div>
      <span className={ativa ? 'online' : 'online-off'}>
        <i /> {ativa ? 'IA ATIVA' : 'IA PAUSADA'}
      </span>
      <h2>{nome}</h2>
      <p>
        {agendamentos
          ? `Ela participou de ${numero(agendamentosIA)} dos ${numero(agendamentos)} agendamentos do mês.`
          : 'Assim que as conversas começarem, o resultado dela aparece aqui.'}
      </p>
      <div className="ai-stats">
        <div>
          <b>{participacao}%</b>
          <span>dos agendamentos</span>
        </div>
        <div>
          <b>{numero(agendamentosIA)}</b>
          <span>marcados pela IA</span>
        </div>
      </div>
      <button className="outline-btn" onClick={() => ir('Conversas')}>
        Ver conversas <span>→</span>
      </button>
    </article>
  );
}

/* ------------------------------------------------------------ follow-ups hoje */

type LinhaFollowup = {
  id: string;
  agendado_para: string;
  etapas_regua_followup: { ordem: number } | null;
};

function FollowupsDoDia({ clinicaId }: { clinicaId: string }) {
  const followups = useConsulta<LinhaFollowup[]>(
    clinicaId
      ? () =>
          supabase
            .from('followups')
            .select('id, agendado_para, etapas_regua_followup(ordem)')
            .eq('clinica_id', clinicaId)
            .eq('status', 'pendente')
            .lte('agendado_para', new Date(new Date().setHours(23, 59, 59)).toISOString())
            .order('agendado_para')
      : null,
    [clinicaId],
  );

  const chips = useConsulta<{ numero_id: string; status: string }[]>(
    clinicaId
      ? () => supabase.from('vw_saude_chips').select('numero_id, status').eq('clinica_id', clinicaId)
      : null,
    [clinicaId],
  );

  const conectados = (chips.dados ?? []).filter((c) => c.status === 'conectado').length;

  // Agrupa por ordem da régua (1º, 2º e 3º retorno).
  const porOrdem = new Map<number, LinhaFollowup[]>();
  for (const f of followups.dados ?? []) {
    const chave = f.etapas_regua_followup?.ordem ?? 1;
    porOrdem.set(chave, [...(porOrdem.get(chave) ?? []), f]);
  }

  const icones = [MessageCircle, Clock3, Sparkles];
  const cores = ['green', 'orange', 'yellow'];

  return (
    <article className="panel followup-panel">
      <div className="panel-title">
        <div>
          <h2>Follow-ups de hoje</h2>
          <p>A IA cuidará de todos automaticamente</p>
        </div>
        <span className="auto">
          <Bot size={14} /> AUTOMÁTICO
        </span>
      </div>

      <Conteudo
        consulta={followups}
        linhas={3}
        vazio={
          <EstadoVazio
            icone={Clock3}
            titulo="Nenhum retorno para hoje"
            texto="A régua de follow-up agenda as retomadas de quem não respondeu."
          />
        }
      >
        {() => (
          <div className="followup-list">
            {[...porOrdem.entries()]
              .sort((a, b) => a[0] - b[0])
              .map(([ordem, itens]) => {
                const Icone = icones[(ordem - 1) % icones.length];
                return (
                  <div key={ordem}>
                    <span className={`follow-icon ${cores[(ordem - 1) % cores.length]}`}>
                      <Icone size={17} />
                    </span>
                    <p>
                      <b>
                        {itens.length} {itens.length === 1 ? 'contato' : 'contatos'}
                      </b>
                      <small>{ordem}º retorno</small>
                    </p>
                    <strong>{hora(itens[0].agendado_para)}</strong>
                  </div>
                );
              })}
          </div>
        )}
      </Conteudo>

      <div className="chips">
        <span>
          <i className={conectados ? 'chip-on' : 'chip-off'} /> {conectados} chip(s) conectado(s)
        </span>
        <span>{conectados ? 'Rotação saudável' : 'Cadastre um número'}</span>
      </div>
    </article>
  );
}


/* ------------------------------------------------------- aviso do WhatsApp */

/**
 * Sem um número pareado o sistema não envia nem recebe nada, e a tela de
 * a tela de ajustes é o último lugar onde alguém procuraria por isso. O aviso some
 * sozinho assim que houver um número conectado.
 */
function AvisoWhatsapp({ ir }: { ir: (v: Vista) => void }) {
  const { clinicaId } = useClinica();

  const numeros = useConsulta<{ id: string; status: string }[]>(
    clinicaId
      ? () =>
          supabase
            .from('numeros_whatsapp')
            .select('id, status')
            .eq('clinica_id', clinicaId)
            .eq('ativo', true)
      : null,
    [clinicaId],
  );

  if (numeros.carregando || numeros.erro) return null;

  const lista = numeros.dados ?? [];
  if (lista.some((n) => n.status === 'conectado')) return null;

  return (
    <div className="chamada">
      <span className="chamada-icone">
        <QrCode size={19} />
      </span>
      <div>
        <b>Conecte seu WhatsApp</b>
        <span>
          {lista.length
            ? 'Você já tem um número cadastrado. Falta ler o QR Code com o celular para começar a atender.'
            : 'Sem um número conectado o sistema não envia nem recebe mensagens.'}
        </span>
      </div>
      <button className="primary-btn" onClick={() => ir('Minha clínica')}>
        <QrCode size={15} /> Conectar agora
      </button>
    </div>
  );
}
