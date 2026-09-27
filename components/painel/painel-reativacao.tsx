'use client';

import { useState } from 'react';
import { MessageCircle, Send, WandSparkles } from 'lucide-react';
import { supabase } from '@/lib/supabase/cliente';
import { useConsulta } from '@/lib/dados/consulta';
import { useClinica } from '@/lib/dados/sessao';
import { moeda, numero, percentual, tempoRelativo } from '@/lib/dados/formato';
import { Cabecalho, Conteudo, EstadoVazio } from './base';
import { funilDaCampanha, resumoCampanha, useDesempenhoCampanhas } from './painel-campanhas';

type Envio = {
  id: string;
  status: string;
  enviado_em: string | null;
  respondido_em: string | null;
  criado_em: string;
  pacientes: { nome_completo: string } | null;
};

/**
 * O que aconteceu de fato com cada envio. "Pendente" era o status cru do
 * banco e parecia envio feito; aqui fica explícito que ainda está na fila.
 */
const SITUACAO_ENVIO: Record<string, string> = {
  pendente: 'na fila, ainda não saiu',
  enviado: 'mensagem enviada',
  entregue: 'mensagem entregue',
  lido: 'leu a mensagem',
  respondido: 'respondeu',
  falhou: 'envio falhou',
  cancelado: 'envio cancelado',
};

export function PainelReativacao({ ir }: { ir: (v: 'Campanhas') => void }) {
  const { clinicaId } = useClinica();
  const campanhas = useDesempenhoCampanhas(clinicaId);
  const [campanhaId, setCampanhaId] = useState<string>('');

  const lista = campanhas.dados ?? [];

  // Sem escolha explícita, vale a campanha de maior receita (a primeira da
  // consulta). Derivado, não sincronizado por efeito.
  const atual = lista.find((c) => c.campanha_id === campanhaId) ?? lista[0] ?? null;

  const envios = useConsulta<Envio[]>(
    atual
      ? () =>
          supabase
            .from('envios_campanha')
            .select('id, status, enviado_em, respondido_em, criado_em, pacientes(nome_completo)')
            .eq('campanha_id', atual.campanha_id)
            .order('atualizado_em', { ascending: false })
            .limit(8)
      : null,
    [atual?.campanha_id],
  );

  return (
    <>
      <Cabecalho
        titulo="Reativação de contatos"
        texto="Cada etapa e o retorno financeiro da campanha escolhida."
      />

      <Conteudo
        consulta={campanhas}
        linhas={3}
        vazio={
          <div className="panel">
            <EstadoVazio
              icone={WandSparkles}
              titulo="Nenhuma reativação em andamento"
              texto="As campanhas de reativação alimentam este funil."
              acao={
                <button className="primary-btn" onClick={() => ir('Campanhas')}>
                  Criar campanha
                </button>
              }
            />
          </div>
        }
      >
        {() =>
          !atual ? null : (
            <>
              <label className="select-label">
                Campanha
                <select value={atual.campanha_id} onChange={(e) => setCampanhaId(e.target.value)}>
                  {lista.map((c) => (
                    <option key={c.campanha_id} value={c.campanha_id}>
                      {c.campanha}
                    </option>
                  ))}
                </select>
              </label>

              <div className="main-grid react-grid">
                <FunilCampanha campanha={atual} />

                <article className="panel reactivation-live">
                  <span className="online-dark">
                    <i /> ÚLTIMAS MOVIMENTAÇÕES
                  </span>
                  <h2>Atividade da campanha</h2>

                  <Conteudo
                    consulta={envios}
                    linhas={3}
                    vazio={
                      <EstadoVazio
                        icone={Send}
                        titulo="Nada enviado ainda"
                        texto="Assim que o disparo começar, cada envio aparece aqui."
                      />
                    }
                  >
                    {(itens) =>
                      itens.map((envio) => (
                        <div key={envio.id}>
                          <span>
                            {envio.respondido_em ? <MessageCircle /> : <Send />}
                          </span>
                          <p>
                            <b>
                              {envio.pacientes?.nome_completo ?? 'Contato'}
                              {envio.respondido_em
                                ? ' respondeu'
                                : ` — ${SITUACAO_ENVIO[envio.status] ?? envio.status}`}
                            </b>
                            <small>
                              {tempoRelativo(envio.respondido_em ?? envio.enviado_em ?? envio.criado_em)}
                            </small>
                          </p>
                        </div>
                      ))
                    }
                  </Conteudo>
                </article>
              </div>

              <div className="metrics mini-metrics">
                <article className="metric">
                  <span>Taxa de resposta</span>
                  <strong>{percentual(atual.taxa_resposta_percentual)}</strong>
                </article>
                <article className="metric">
                  <span>Conversão em agenda</span>
                  <strong>
                    {percentual(
                      atual.responderam ? (Number(atual.agendaram) / Number(atual.responderam)) * 100 : 0,
                    )}
                  </strong>
                </article>
                <article className="metric">
                  <span>Comparecimento</span>
                  <strong>
                    {percentual(
                      atual.agendaram
                        ? (Number(atual.compareceram) / Number(atual.agendaram)) * 100
                        : 0,
                    )}
                  </strong>
                </article>
                <article className="metric">
                  <span>ROI</span>
                  <strong>{resumoCampanha(atual).roi}</strong>
                </article>
              </div>
            </>
          )
        }
      </Conteudo>
    </>
  );
}

function FunilCampanha({ campanha }: { campanha: Parameters<typeof funilDaCampanha>[0] }) {
  const etapas = funilDaCampanha(campanha);
  const resumo = resumoCampanha(campanha);
  const maior = Math.max(1, ...etapas.map((e) => e.valor));

  return (
    <article className="panel funnel-panel">
      <div className="panel-title">
        <div>
          <h2>Funil de reativação</h2>
          <p>
            Campanha <b>{campanha.campanha}</b>
          </p>
        </div>
      </div>

      <div className="funnel-content">
        <div className="funnel-bars">
          {etapas.map((etapa) => (
            <div className="funnel-row" key={etapa.rotulo}>
              <div
                className="bar"
                style={{
                  width: `${Math.max(8, (etapa.valor / maior) * 100)}%`,
                  background: etapa.cor,
                }}
              >
                <span>{numero(etapa.valor)}</span>
              </div>
              <label>{etapa.rotulo}</label>
            </div>
          ))}
        </div>

        <div className="campaign-return">
          <span>RETORNO DA CAMPANHA</span>
          <strong>{resumo.receita}</strong>
          <p>
            <b>{resumo.roi}</b> retorno sobre investimento
          </p>
          <hr />
          <div>
            <span>
              Investido <b>{resumo.investido}</b>
            </span>
            <span>
              Ticket médio{' '}
              <b>
                {campanha.compareceram
                  ? moeda(Number(campanha.receita) / Number(campanha.compareceram))
                  : '—'}
              </b>
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}
