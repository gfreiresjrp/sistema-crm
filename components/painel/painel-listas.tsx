'use client';

import { useMemo, useState } from 'react';
import { KanbanSquare, ListChecks, Plus, Search, Trash2, UserPlus, X } from 'lucide-react';
import { supabase } from '@/lib/supabase/cliente';
import { useConsulta } from '@/lib/dados/consulta';
import { useClinica } from '@/lib/dados/sessao';
import { dataCurta, ROTULO_ORIGEM, telefoneVisivel } from '@/lib/dados/formato';
import { Avatar } from './avatar';
import { Cabecalho, Campo, Conteudo, EstadoVazio, Modal, useAcao } from './base';
import { PainelCRM } from './painel-crm';

/**
 * Listas de leads.
 *
 * Uma lista é um grupo nomeado de contatos ("Inativos 2025", "Botox — abril").
 * Ela nasce aqui ou na importação, recebe contatos que já existem e é o
 * público que uma campanha de disparo escolhe. O funil de vendas continua
 * disponível na segunda aba.
 */

export type ListaLeads = {
  id: string;
  nome: string;
  descricao: string | null;
  criado_em: string;
  listas_leads_itens: Array<{ count: number }>;
};

type Item = {
  id: string;
  criado_em: string;
  pacientes: {
    id: string;
    nome_completo: string;
    telefone: string;
    origem: string;
    situacao: string;
    foto_url: string | null;
  } | null;
};

type Candidato = {
  id: string;
  nome_completo: string;
  telefone: string;
  origem: string;
  foto_url: string | null;
};

const SITUACAO: Record<string, string> = {
  lead: 'Lead',
  paciente: 'Paciente',
  inativo: 'Inativo',
  arquivado: 'Arquivado',
};

export function useListasLeads(clinicaId: string, pulso = 0) {
  return useConsulta<ListaLeads[]>(
    clinicaId
      ? () =>
          supabase
            .from('listas_leads')
            .select('id, nome, descricao, criado_em, listas_leads_itens(count)')
            .eq('clinica_id', clinicaId)
            .order('nome')
      : null,
    [clinicaId], [pulso],
  );
}

export function contagem(lista: ListaLeads): number {
  return lista.listas_leads_itens?.[0]?.count ?? 0;
}

export function PainelListas() {
  const { clinicaId, ehGestor } = useClinica();
  const { executar, ocupado } = useAcao();
  const [aba, setAba] = useState<'listas' | 'funil'>('listas');
  const [pulso, setPulso] = useState(0);
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [modalNova, setModalNova] = useState(false);
  const [modalAdicionar, setModalAdicionar] = useState(false);
  const [busca, setBusca] = useState('');

  const listas = useListasLeads(clinicaId, pulso);

  // Sem escolha explícita, abre a primeira lista.
  const atual =
    (listas.dados ?? []).find((l) => l.id === selecionada) ?? listas.dados?.[0] ?? null;

  const itens = useConsulta<Item[]>(
    clinicaId && atual
      ? () =>
          supabase
            .from('listas_leads_itens')
            .select('id, criado_em, pacientes(id, nome_completo, telefone, origem, situacao, foto_url)')
            .eq('lista_id', atual.id)
            .order('criado_em', { ascending: false })
            .limit(2000)
      : null,
    [clinicaId, atual?.id], [pulso],
  );

  const termo = busca.trim().toLowerCase();
  const digitos = termo.replace(/\D/g, '');
  const visiveis = (itens.dados ?? []).filter((item) => {
    if (!termo || !item.pacientes) return true;
    return (
      item.pacientes.nome_completo.toLowerCase().includes(termo) ||
      (digitos.length > 0 && item.pacientes.telefone.includes(digitos))
    );
  });

  async function remover(item: Item) {
    await executar(
      () => supabase.from('listas_leads_itens').delete().eq('id', item.id),
      `${item.pacientes?.nome_completo ?? 'Contato'} saiu da lista`,
      () => setPulso((n) => n + 1),
    );
  }

  async function excluirLista() {
    if (!atual) return;
    if (!window.confirm(`Excluir a lista "${atual.nome}"? Os contatos continuam cadastrados.`)) return;
    await executar(
      () => supabase.from('listas_leads').delete().eq('id', atual.id),
      'Lista excluída',
      () => {
        setSelecionada(null);
        setPulso((n) => n + 1);
      },
    );
  }

  return (
    <>
      <Cabecalho
        titulo="Lista de leads"
        texto="Agrupe contatos em listas para organizar o público das campanhas."
        acao={
          aba === 'listas' ? (
            <button className="primary-btn" onClick={() => setModalNova(true)}>
              <Plus size={15} /> Nova lista
            </button>
          ) : undefined
        }
      />

      <div className="guias">
        <button className={aba === 'listas' ? 'active' : ''} onClick={() => setAba('listas')}>
          <ListChecks size={15} /> Listas
        </button>
        <button className={aba === 'funil' ? 'active' : ''} onClick={() => setAba('funil')}>
          <KanbanSquare size={15} /> Funil de vendas
        </button>
      </div>

      {aba === 'funil' ? (
        <PainelCRM embutido />
      ) : (
        <Conteudo
          consulta={listas}
          linhas={3}
          vazio={
            <div className="panel">
              <EstadoVazio
                icone={ListChecks}
                titulo="Nenhuma lista ainda"
                texto="Crie a primeira lista e adicione contatos que já existem, ou importe um CSV direto para ela."
                acao={
                  <button className="primary-btn" onClick={() => setModalNova(true)}>
                    <Plus size={15} /> Criar lista
                  </button>
                }
              />
            </div>
          }
        >
          {(todas) => (
            <>
              <div className="resumo-contatos">
                {todas.map((lista) => (
                  <button
                    key={lista.id}
                    className={`resumo-item ${atual?.id === lista.id ? 'ativo' : ''}`}
                    onClick={() => setSelecionada(lista.id)}
                  >
                    <b>{contagem(lista)}</b>
                    <span>{lista.nome}</span>
                  </button>
                ))}
              </div>

              {atual && (
                <article className="panel table-panel">
                  <div className="panel-title">
                    <div>
                      <h2>{atual.nome}</h2>
                      <p>
                        {atual.descricao ||
                          `${contagem(atual)} contato(s) • criada em ${dataCurta(atual.criado_em)}`}
                      </p>
                    </div>
                    <div className="acoes-lista">
                      <label className="busca-leads">
                        <Search size={14} />
                        <input
                          value={busca}
                          onChange={(e) => setBusca(e.target.value)}
                          placeholder="Nome ou telefone"
                          aria-label="Buscar na lista"
                        />
                      </label>
                      <button className="primary-btn" onClick={() => setModalAdicionar(true)}>
                        <UserPlus size={15} /> Adicionar leads
                      </button>
                      {ehGestor && (
                        <button
                          className="botao-icone"
                          onClick={excluirLista}
                          disabled={ocupado}
                          title="Excluir lista"
                          aria-label="Excluir lista"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>

                  <Conteudo
                    consulta={itens}
                    linhas={4}
                    vazio={
                      <EstadoVazio
                        icone={UserPlus}
                        titulo="Lista vazia"
                        texto="Adicione contatos que já existem ou importe um CSV escolhendo esta lista."
                        acao={
                          <button className="primary-btn" onClick={() => setModalAdicionar(true)}>
                            <UserPlus size={15} /> Adicionar leads
                          </button>
                        }
                      />
                    }
                  >
                    {() =>
                      visiveis.length === 0 ? (
                        <p className="lista-vazia">Nenhum contato neste filtro.</p>
                      ) : (
                        <div className="data-table">
                          <header>
                            <span>CONTATO</span>
                            <span>TELEFONE</span>
                            <span>ORIGEM</span>
                            <span>SITUAÇÃO</span>
                            <span>NA LISTA DESDE</span>
                            <span />
                          </header>
                          {visiveis.map((item) => (
                            <div key={item.id}>
                              <span className="celula-contato">
                                <Avatar
                                  nome={item.pacientes?.nome_completo}
                                  foto={item.pacientes?.foto_url}
                                />
                                {item.pacientes?.nome_completo ?? 'Contato removido'}
                              </span>
                              <span>{telefoneVisivel(item.pacientes?.telefone)}</span>
                              <span>
                                {ROTULO_ORIGEM[item.pacientes?.origem ?? ''] ??
                                  item.pacientes?.origem ??
                                  '—'}
                              </span>
                              <span>{SITUACAO[item.pacientes?.situacao ?? ''] ?? '—'}</span>
                              <span>{dataCurta(item.criado_em)}</span>
                              <div className="acoes-evento">
                                <button
                                  className="botao-icone"
                                  disabled={ocupado}
                                  onClick={() => remover(item)}
                                  title="Tirar da lista"
                                  aria-label="Tirar da lista"
                                >
                                  <X size={15} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )
                    }
                  </Conteudo>
                </article>
              )}
            </>
          )}
        </Conteudo>
      )}

      <ModalNovaLista
        aberto={modalNova}
        aoFechar={() => setModalNova(false)}
        aoCriar={(id) => {
          setSelecionada(id);
          setPulso((n) => n + 1);
        }}
      />

      {atual && (
        <ModalAdicionarLeads
          aberto={modalAdicionar}
          lista={atual}
          jaNaLista={new Set((itens.dados ?? []).map((i) => i.pacientes?.id ?? ''))}
          aoFechar={() => setModalAdicionar(false)}
          aoAdicionar={() => setPulso((n) => n + 1)}
        />
      )}
    </>
  );
}

/* ---------------------------------------------------------------- nova lista */

export function ModalNovaLista({
  aberto,
  aoFechar,
  aoCriar,
}: {
  aberto: boolean;
  aoFechar: () => void;
  aoCriar: (id: string) => void;
}) {
  const { clinicaId, membroId } = useClinica();
  const { executar, ocupado } = useAcao();
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');

  async function salvar() {
    if (!nome.trim()) return;
    let criadaId = '';
    await executar(
      async () => {
        const { data, error } = await supabase
          .from('listas_leads')
          .insert({
            clinica_id: clinicaId,
            nome: nome.trim(),
            descricao: descricao.trim() || null,
            criado_por: membroId,
          })
          .select('id')
          .single();
        if (data) criadaId = data.id;
        return { error };
      },
      'Lista criada',
      () => {
        setNome('');
        setDescricao('');
        aoCriar(criadaId);
        aoFechar();
      },
    );
  }

  return (
    <Modal
      titulo="Nova lista"
      descricao="Um nome que diga quem está nela: origem, campanha ou momento."
      aberto={aberto}
      aoFechar={aoFechar}
      aoConfirmar={salvar}
      rotuloConfirmar="Criar"
      salvando={ocupado}
    >
      <Campo rotulo="Nome">
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Inativos há 6 meses"
          required
          autoFocus
        />
      </Campo>
      <Campo rotulo="Descrição (opcional)">
        <input
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Quem fez procedimento em 2025 e não voltou"
        />
      </Campo>
    </Modal>
  );
}

/* ------------------------------------------------------------ adicionar leads */

function ModalAdicionarLeads({
  aberto,
  lista,
  jaNaLista,
  aoFechar,
  aoAdicionar,
}: {
  aberto: boolean;
  lista: ListaLeads;
  jaNaLista: Set<string>;
  aoFechar: () => void;
  aoAdicionar: () => void;
}) {
  const { clinicaId } = useClinica();
  const { executar, ocupado } = useAcao();
  const [busca, setBusca] = useState('');
  const [marcados, setMarcados] = useState<Set<string>>(new Set());

  const candidatos = useConsulta<Candidato[]>(
    clinicaId && aberto
      ? () =>
          supabase
            .from('pacientes')
            .select('id, nome_completo, telefone, origem, foto_url')
            .eq('clinica_id', clinicaId)
            .is('excluido_em', null)
            .order('nome_completo')
            .limit(2000)
      : null,
    [clinicaId, aberto],
  );

  const disponiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const digitos = termo.replace(/\D/g, '');
    return (candidatos.dados ?? []).filter((c) => {
      if (jaNaLista.has(c.id)) return false;
      if (!termo) return true;
      return (
        c.nome_completo.toLowerCase().includes(termo) ||
        (digitos.length > 0 && c.telefone.includes(digitos))
      );
    });
  }, [candidatos.dados, jaNaLista, busca]);

  function alternar(id: string) {
    setMarcados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function marcarVisiveis() {
    setMarcados((atual) => {
      const novo = new Set(atual);
      disponiveis.forEach((c) => novo.add(c.id));
      return novo;
    });
  }

  async function adicionar() {
    if (marcados.size === 0) return;
    const ids = [...marcados];
    await executar(
      () =>
        supabase.from('listas_leads_itens').upsert(
          ids.map((pacienteId) => ({
            clinica_id: clinicaId,
            lista_id: lista.id,
            paciente_id: pacienteId,
          })),
          { onConflict: 'lista_id,paciente_id', ignoreDuplicates: true },
        ),
      `${ids.length} contato(s) na lista "${lista.nome}"`,
      () => {
        setMarcados(new Set());
        setBusca('');
        aoAdicionar();
        aoFechar();
      },
    );
  }

  return (
    <Modal
      titulo={`Adicionar a "${lista.nome}"`}
      descricao="Contatos que já estão na lista não aparecem aqui."
      aberto={aberto}
      aoFechar={aoFechar}
      aoConfirmar={adicionar}
      rotuloConfirmar={marcados.size ? `Adicionar ${marcados.size}` : 'Adicionar'}
      salvando={ocupado}
    >
      <div className="selecao-cabecalho">
        <label className="busca-leads">
          <Search size={14} />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Nome ou telefone"
            aria-label="Buscar contato"
            autoFocus
          />
        </label>
        <button
          type="button"
          className="link-btn"
          onClick={marcarVisiveis}
          disabled={disponiveis.length === 0}
        >
          Marcar todos ({disponiveis.length})
        </button>
      </div>

      <div className="selecao-contatos">
        {candidatos.carregando ? (
          <p className="lista-vazia">Carregando contatos…</p>
        ) : disponiveis.length === 0 ? (
          <p className="lista-vazia">
            {jaNaLista.size > 0 && !busca
              ? 'Todos os contatos já estão na lista.'
              : 'Nenhum contato encontrado.'}
          </p>
        ) : (
          disponiveis.slice(0, 300).map((c) => (
            <label key={c.id} className={marcados.has(c.id) ? 'marcado' : ''}>
              <input type="checkbox" checked={marcados.has(c.id)} onChange={() => alternar(c.id)} />
              <Avatar nome={c.nome_completo} foto={c.foto_url} />
              <span>
                <b>{c.nome_completo}</b>
                <small>
                  {telefoneVisivel(c.telefone)} • {ROTULO_ORIGEM[c.origem] ?? c.origem}
                </small>
              </span>
            </label>
          ))
        )}
        {disponiveis.length > 300 && (
          <p className="lista-vazia">Mostrando 300 de {disponiveis.length}. Refine a busca.</p>
        )}
      </div>
    </Modal>
  );
}
