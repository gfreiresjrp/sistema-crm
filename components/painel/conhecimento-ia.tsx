'use client';

import { useState } from 'react';
import { BookOpen, MessageCircleMore, Pencil, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/cliente';
import { useConsulta } from '@/lib/dados/consulta';
import { useClinica } from '@/lib/dados/sessao';
import type { Database } from '@/lib/supabase/tipos-banco';
import { Campo, Conteudo, EstadoVazio, Modal, useAcao } from './base';

type Item = Database['public']['Tables']['base_conhecimento_ia']['Row'];
type EtapaFollowUp = Database['public']['Tables']['etapas_regua_followup']['Row'];

/**
 * Sugestões de categoria; a equipe pode digitar outra. Servem para a
 * assistente entender de que tipo é cada informação e para a lista ficar
 * agrupada.
 */
const CATEGORIAS = [
  'Procedimentos',
  'Valores e condições',
  'Regras de atendimento',
  'Promoções',
  'Informações da clínica',
  'Perguntas frequentes',
];

/* ------------------------------------------------------------- conhecimento */

/**
 * Tudo o que a equipe quer que a assistente saiba, em texto livre.
 *
 * Cada item entra inteiro no contexto da IA a cada resposta (marcador
 * {{conhecimento}} da instrução), então mudar aqui vale na próxima mensagem —
 * sem mexer no texto da instrução.
 */
export function ConhecimentoIA() {
  const { clinicaId, membroId } = useClinica();
  const { executar, ocupado } = useAcao();
  const [pulso, setPulso] = useState(0);
  const [editando, setEditando] = useState<Item | 'novo' | null>(null);
  const [titulo, setTitulo] = useState('');
  const [conteudo, setConteudo] = useState('');
  const [categoria, setCategoria] = useState('');

  const lista = useConsulta<Item[]>(
    clinicaId
      ? () =>
          supabase
            .from('base_conhecimento_ia')
            .select('*')
            .eq('clinica_id', clinicaId)
            .order('categoria', { nullsFirst: false })
            .order('criado_em')
      : null,
    [clinicaId], [pulso],
  );

  function abrir(item: Item | 'novo') {
    setEditando(item);
    setTitulo(item === 'novo' ? '' : item.pergunta);
    setConteudo(item === 'novo' ? '' : item.resposta);
    setCategoria(item === 'novo' ? '' : (item.categoria ?? ''));
  }

  async function salvar() {
    if (!editando || !titulo.trim() || !conteudo.trim()) return;
    const dados = {
      pergunta: titulo.trim(),
      resposta: conteudo.trim(),
      categoria: categoria.trim() || null,
    };
    await executar(
      () =>
        editando === 'novo'
          ? supabase
              .from('base_conhecimento_ia')
              .insert({ ...dados, clinica_id: clinicaId, criado_por: membroId })
          : supabase.from('base_conhecimento_ia').update(dados).eq('id', editando.id),
      editando === 'novo' ? 'A IA já aprendeu isso' : 'Informação atualizada',
      () => {
        setEditando(null);
        setPulso((n) => n + 1);
      },
    );
  }

  async function alternar(item: Item) {
    await executar(
      () => supabase.from('base_conhecimento_ia').update({ ativa: !item.ativa }).eq('id', item.id),
      item.ativa ? 'A IA deixou de usar esta informação' : 'A IA voltou a usar esta informação',
      () => setPulso((n) => n + 1),
    );
  }

  async function apagar(item: Item) {
    if (!window.confirm(`Apagar "${item.pergunta}"? A IA deixa de saber isso.`)) return;
    await executar(
      () => supabase.from('base_conhecimento_ia').delete().eq('id', item.id),
      'Informação apagada',
      () => setPulso((n) => n + 1),
    );
  }

  return (
    <article className="panel table-panel">
      <div className="panel-title">
        <div>
          <h2>Conhecimento da IA</h2>
          <p>
            Escreva aqui qualquer coisa que a assistente deve saber ou seguir: detalhes dos
            procedimentos, regras de atendimento, promoções, respostas prontas. Vale a partir da
            próxima mensagem.
          </p>
        </div>
        <button className="primary-btn" onClick={() => abrir('novo')}>
          <Plus size={15} /> Ensinar algo novo
        </button>
      </div>

      <Conteudo
        consulta={lista}
        vazio={
          <EstadoVazio
            icone={BookOpen}
            titulo="A IA ainda não aprendeu nada aqui"
            texto='Exemplos: "Como funciona o botox", "Não falamos preço pelo WhatsApp", "Endereço e estacionamento".'
            acao={
              <button className="primary-btn" onClick={() => abrir('novo')}>
                <Plus size={15} /> Ensinar algo novo
              </button>
            }
          />
        }
      >
        {(itens) => (
          <div className="lista-conhecimento">
            {itens.map((item) => (
              <div key={item.id} className={`item-conhecimento ${item.ativa ? '' : 'pausado'}`}>
                <header>
                  <div>
                    {item.categoria && <span className="selo">{item.categoria}</span>}
                    <b>{item.pergunta}</b>
                  </div>
                  <div className="acoes-conhecimento">
                    <button
                      type="button"
                      className={`switch ${item.ativa ? 'on' : ''}`}
                      disabled={ocupado}
                      onClick={() => alternar(item)}
                      aria-label={item.ativa ? 'Pausar' : 'Reativar'}
                      title={item.ativa ? 'Em uso pela IA — clique para pausar' : 'Pausado — clique para reativar'}
                    >
                      <i />
                    </button>
                    <button
                      type="button"
                      className="icone-acao"
                      onClick={() => abrir(item)}
                      aria-label={`Editar ${item.pergunta}`}
                      title="Editar"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      className="icone-perigo"
                      disabled={ocupado}
                      onClick={() => apagar(item)}
                      aria-label={`Apagar ${item.pergunta}`}
                      title="Apagar"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </header>
                <p>{item.resposta}</p>
              </div>
            ))}
          </div>
        )}
      </Conteudo>

      <Modal
        titulo={editando === 'novo' ? 'Ensinar algo novo à IA' : 'Editar informação'}
        descricao="Escreva como explicaria para uma atendente nova. A IA usa o texto exatamente como está."
        aberto={editando !== null}
        aoFechar={() => setEditando(null)}
        aoConfirmar={salvar}
        rotuloConfirmar="Salvar"
        salvando={ocupado}
      >
        <div className="modal-grade">
          <Campo rotulo="Assunto" dica='Ex.: "Botox", "Grupo VIP", "Formas de pagamento".' largo>
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} autoFocus />
          </Campo>
          <Campo rotulo="Categoria (opcional)" largo>
            <input
              list="categorias-conhecimento"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              placeholder="Escolha ou digite"
            />
            <datalist id="categorias-conhecimento">
              {CATEGORIAS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Campo>
          <Campo rotulo="O que a IA deve saber" largo>
            <textarea
              value={conteudo}
              onChange={(e) => setConteudo(e.target.value)}
              rows={9}
              placeholder="Ex.: O botox dura de 4 a 6 meses. Sempre convide para uma avaliação antes de falar em valores."
            />
          </Campo>
        </div>
      </Modal>
    </article>
  );
}

/* ---------------------------------------------------------------- follow-up */

/**
 * As mensagens que saem sozinhas para quem parou de responder. O atraso conta
 * a partir da primeira mensagem nossa sem resposta. {{primeiro_nome}} vira o
 * nome do contato (ou some, se não houver nome).
 */
export function FollowUpIA() {
  const { clinicaId } = useClinica();
  const { executar, ocupado } = useAcao();
  const [pulso, setPulso] = useState(0);
  const [edicoes, setEdicoes] = useState<Record<string, { texto?: string; dias?: number }>>({});

  const etapas = useConsulta<EtapaFollowUp[]>(
    clinicaId
      ? () =>
          supabase
            .from('etapas_regua_followup')
            .select('*')
            .eq('clinica_id', clinicaId)
            .order('ordem')
      : null,
    [clinicaId], [pulso],
  );

  async function salvar(etapa: EtapaFollowUp) {
    const edicao = edicoes[etapa.id];
    if (!edicao) return;
    const texto = (edicao.texto ?? etapa.modelo_mensagem).trim();
    const dias = edicao.dias ?? etapa.atraso_horas / 24;
    if (!texto || !(dias > 0)) return;
    await executar(
      () =>
        supabase
          .from('etapas_regua_followup')
          .update({ modelo_mensagem: texto, atraso_horas: Math.round(dias * 24) })
          .eq('id', etapa.id),
      `${etapa.ordem}ª mensagem salva`,
      () => {
        setEdicoes((atual) => {
          const { [etapa.id]: _, ...resto } = atual;
          return resto;
        });
        setPulso((n) => n + 1);
      },
    );
  }

  return (
    <article className="panel table-panel">
      <div className="panel-title">
        <div>
          <h2>Follow-up de quem parou de responder</h2>
          <p>
            Se a pessoa não responder, a IA manda estas mensagens na ordem. Use{' '}
            <code>{'{{primeiro_nome}}'}</code> para o nome do contato. Liga e desliga em
            Assistente › Automações › Follow-up inteligente.
          </p>
        </div>
      </div>

      <Conteudo
        consulta={etapas}
        vazio={
          <EstadoVazio
            icone={MessageCircleMore}
            titulo="Nenhuma mensagem de follow-up"
            texto="A régua padrão é criada junto com a clínica."
          />
        }
      >
        {(itens) => (
          <div className="lista-conhecimento">
            {itens.map((etapa) => {
              const edicao = edicoes[etapa.id];
              const texto = edicao?.texto ?? etapa.modelo_mensagem;
              const dias = edicao?.dias ?? etapa.atraso_horas / 24;
              return (
                <div key={etapa.id} className="item-conhecimento">
                  <header>
                    <div>
                      <span className="selo selo-ouro">{etapa.ordem}ª mensagem</span>
                      <label className="dias-followup">
                        enviar
                        <input
                          type="number"
                          min={1}
                          value={dias}
                          onChange={(e) =>
                            setEdicoes((a) => ({
                              ...a,
                              [etapa.id]: { ...a[etapa.id], dias: Number(e.target.value) },
                            }))
                          }
                        />
                        {dias === 1 ? 'dia' : 'dias'} sem resposta
                      </label>
                    </div>
                    <button
                      type="button"
                      className="primary-btn"
                      disabled={!edicao || ocupado}
                      onClick={() => salvar(etapa)}
                    >
                      Salvar
                    </button>
                  </header>
                  <textarea
                    className="texto-followup"
                    value={texto}
                    rows={3}
                    onChange={(e) =>
                      setEdicoes((a) => ({
                        ...a,
                        [etapa.id]: { ...a[etapa.id], texto: e.target.value },
                      }))
                    }
                  />
                </div>
              );
            })}
          </div>
        )}
      </Conteudo>
    </article>
  );
}
