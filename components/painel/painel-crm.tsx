'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase/cliente';
import { useConsulta } from '@/lib/dados/consulta';
import { useClinica } from '@/lib/dados/sessao';
import {
  garantirPaciente,
  useEtapasFunil,
  useProcedimentos,
  type EtapaFunil,
} from '@/lib/dados/catalogo';
import {
  iniciais,
  moeda,
  ROTULO_ORIGEM,
  telefoneDigitos,
  tempoRelativo,
} from '@/lib/dados/formato';
import { Cabecalho, Campo, Conteudo, EstadoVazio, Modal, useAcao } from './base';

type Oportunidade = {
  id: string;
  titulo: string | null;
  valor_estimado: number | null;
  etapa_id: string;
  origem: string;
  entrou_na_etapa_em: string;
  pacientes: { nome_completo: string } | null;
  procedimentos: { nome: string } | null;
};

/**
 * Funil de vendas (kanban das oportunidades abertas).
 *
 * Vive dentro da Lista de Leads como segunda aba; `embutido` tira o cabeçalho
 * da página, que a lista já desenha.
 */
export function PainelCRM({ embutido = false }: { embutido?: boolean } = {}) {
  const { clinicaId } = useClinica();
  const { executar, ocupado } = useAcao();
  const etapas = useEtapasFunil(clinicaId);
  const [modalAberto, setModalAberto] = useState(false);
  const [pulso, setPulso] = useState(0);

  const oportunidades = useConsulta<Oportunidade[]>(
    clinicaId
      ? () =>
          supabase
            .from('oportunidades')
            .select(
              'id, titulo, valor_estimado, etapa_id, origem, entrou_na_etapa_em, pacientes(nome_completo), procedimentos(nome)',
            )
            .eq('clinica_id', clinicaId)
            .eq('status', 'aberta')
            .order('entrou_na_etapa_em', { ascending: false })
            .limit(300)
      : null,
    [clinicaId], [pulso],
  );

  const colunas = etapas.dados ?? [];

  /** O trigger do banco registra a movimentação e o tempo em cada etapa. */
  async function mover(oportunidade: Oportunidade, destino: EtapaFunil) {
    await executar(
      () =>
        supabase
          .from('oportunidades')
          .update({
            etapa_id: destino.id,
            entrou_na_etapa_em: new Date().toISOString(),
            ...(destino.tipo === 'ganha'
              ? { status: 'ganha' as const, fechada_em: new Date().toISOString() }
              : destino.tipo === 'perdida'
                ? { status: 'perdida' as const, fechada_em: new Date().toISOString() }
                : {}),
          })
          .eq('id', oportunidade.id),
      `${oportunidade.pacientes?.nome_completo ?? 'Lead'} → ${destino.nome}`,
      () => setPulso((n) => n + 1),
    );
  }

  const botaoAdicionar = (
    <button className="primary-btn" onClick={() => setModalAberto(true)}>
      <Plus size={15} /> Adicionar ao funil
    </button>
  );

  return (
    <>
      {embutido ? (
        <div className="funil-acoes">{botaoAdicionar}</div>
      ) : (
        <Cabecalho
          titulo="Funil de vendas"
          texto="Mova o lead entre as etapas com as setas do cartão."
          acao={botaoAdicionar}
        />
      )}

      <Conteudo
        consulta={etapas}
        linhas={4}
        vazio={
          <div className="panel">
            <EstadoVazio
              icone={Users}
              titulo="Funil não configurado"
              texto="As etapas padrão são criadas junto com a clínica."
            />
          </div>
        }
      >
        {() =>
          oportunidades.carregando ? (
            <div className="panel">
              <EstadoVazio icone={Users} titulo="Carregando funil" texto="Um instante." />
            </div>
          ) : (oportunidades.dados ?? []).length === 0 ? (
            <div className="panel">
              <EstadoVazio
                icone={Users}
                titulo="Nenhum lead no funil"
                texto="Adicione o primeiro lead para acompanhar a negociação até o agendamento."
                acao={botaoAdicionar}
              />
            </div>
          ) : (
            <div className="kanban">
              {colunas.map((coluna, indice) => {
                const cartoes = (oportunidades.dados ?? []).filter((o) => o.etapa_id === coluna.id);
                return (
                  <section key={coluna.id} className="kanban-col">
                    <header>
                      <span className="dot" style={{ background: coluna.cor }} />
                      <b>{coluna.nome}</b>
                      <em>{cartoes.length}</em>
                    </header>

                    {cartoes.length === 0 && <p className="coluna-vazia">Vazio</p>}

                    {cartoes.map((cartao) => (
                      <article className="lead-card" key={cartao.id}>
                        <div>
                          <span className="patient-avatar sage">
                            {iniciais(cartao.pacientes?.nome_completo)}
                          </span>
                          <b>{cartao.pacientes?.nome_completo ?? 'Sem nome'}</b>
                        </div>
                        <p>
                          {cartao.procedimentos?.nome ?? cartao.titulo ?? 'Sem interesse definido'}
                          {cartao.valor_estimado ? ` • ${moeda(cartao.valor_estimado)}` : ''}
                        </p>
                        <small>
                          {tempoRelativo(cartao.entrou_na_etapa_em)} nesta etapa •{' '}
                          {ROTULO_ORIGEM[cartao.origem] ?? cartao.origem}
                        </small>
                        <div className="lead-acoes">
                          {indice > 0 && (
                            <button
                              disabled={ocupado}
                              onClick={() => mover(cartao, colunas[indice - 1])}
                              aria-label={`Voltar para ${colunas[indice - 1].nome}`}
                            >
                              <ChevronLeft size={14} />
                            </button>
                          )}
                          {indice < colunas.length - 1 && (
                            <button
                              disabled={ocupado}
                              onClick={() => mover(cartao, colunas[indice + 1])}
                            >
                              {colunas[indice + 1].nome} <ChevronRight size={14} />
                            </button>
                          )}
                        </div>
                      </article>
                    ))}
                  </section>
                );
              })}
            </div>
          )
        }
      </Conteudo>

      <ModalLead
        aberto={modalAberto}
        etapas={colunas}
        aoFechar={() => setModalAberto(false)}
        aoCriar={() => setPulso((n) => n + 1)}
      />
    </>
  );
}

function ModalLead({
  aberto,
  etapas,
  aoFechar,
  aoCriar,
}: {
  aberto: boolean;
  etapas: EtapaFunil[];
  aoFechar: () => void;
  aoCriar: () => void;
}) {
  const { clinicaId, unidadeId, membroId } = useClinica();
  const { executar, ocupado } = useAcao();
  const procedimentos = useProcedimentos(clinicaId);

  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [origem, setOrigem] = useState('instagram');
  const [procedimentoId, setProcedimentoId] = useState('');
  const [valor, setValor] = useState('');

  async function salvar() {
    const digitos = telefoneDigitos(telefone);
    const primeiraEtapa = etapas[0];
    if (!nome.trim() || digitos.length < 12 || !primeiraEtapa) return;

    const procedimento = procedimentos.dados?.find((p) => p.id === procedimentoId);

    await executar(
      async () => {
        const { id: pacienteId, error } = await garantirPaciente({
          clinicaId,
          unidadeId,
          nome: nome.trim(),
          telefone: digitos,
          origem: origem as never,
          interesse: procedimento?.nome ?? null,
        });
        if (error || !pacienteId) return { error };

        return supabase.from('oportunidades').insert({
          clinica_id: clinicaId,
          unidade_id: unidadeId,
          paciente_id: pacienteId,
          etapa_id: primeiraEtapa.id,
          procedimento_id: procedimentoId || null,
          titulo: procedimento?.nome ?? null,
          valor_estimado: valor ? Number(valor) : (procedimento?.valor ?? null),
          origem: origem as never,
          responsavel_id: membroId,
        });
      },
      'Lead adicionado ao funil',
      () => {
        setNome('');
        setTelefone('');
        setValor('');
        aoCriar();
        aoFechar();
      },
    );
  }

  return (
    <Modal
      titulo="Adicionar lead"
      descricao={`Ele entra na etapa "${etapas[0]?.nome ?? 'inicial'}".`}
      aberto={aberto}
      aoFechar={aoFechar}
      aoConfirmar={salvar}
      rotuloConfirmar="Adicionar"
      salvando={ocupado}
    >
      <div className="modal-grade">
        <Campo rotulo="Nome">
          <input value={nome} onChange={(e) => setNome(e.target.value)} required autoFocus />
        </Campo>
        <Campo rotulo="Telefone">
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
        <Campo rotulo="Interesse">
          <select value={procedimentoId} onChange={(e) => setProcedimentoId(e.target.value)}>
            <option value="">— A definir —</option>
            {(procedimentos.dados ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Valor estimado (R$)" largo>
          <input
            type="number"
            min={0}
            step="0.01"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="Deixe em branco para usar o preço do procedimento"
          />
        </Campo>
      </div>
    </Modal>
  );
}
