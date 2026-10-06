'use client';

import { useMemo, useState } from 'react';
import { Contact, Download, MessageCircle, Plus, Search, Upload } from 'lucide-react';
import { supabase } from '@/lib/supabase/cliente';
import { useConsulta } from '@/lib/dados/consulta';
import { buscarTodas } from '@/lib/dados/paginar';
import { useClinica } from '@/lib/dados/sessao';
import { garantirPaciente, useProcedimentos } from '@/lib/dados/catalogo';
import {
  dataCurta,
  ROTULO_ORIGEM,
  telefoneDigitos,
  telefoneVisivel,
  tempoRelativo,
} from '@/lib/dados/formato';
import { Cabecalho, Campo, Conteudo, EstadoVazio, Modal, useAcao } from './base';
import { baixarCsv } from '@/lib/dados/exportar';
import { Avatar } from './avatar';
import { ImportarContatos } from './importar-contatos';
import type { Vista } from './navegacao';

/** Linhas desenhadas de uma vez: milhares de linhas travam a tela; a busca e a exportação usam todas. */
const LINHAS_POR_VEZ = 300;

type Contato = {
  id: string;
  nome_completo: string;
  telefone: string;
  email: string | null;
  origem: string;
  situacao: string;
  interesse_principal: string | null;
  foto_url: string | null;
  ultimo_contato_em: string | null;
  ultima_visita_em: string | null;
  criado_em: string;
};

const SITUACAO: Record<string, string> = {
  lead: 'Lead',
  paciente: 'Paciente',
  inativo: 'Inativo',
  arquivado: 'Arquivado',
};

export function PainelContatos({ ir }: { ir: (v: Vista) => void }) {
  const { clinicaId, unidadeId } = useClinica();
  const { executar, ocupado } = useAcao();

  const [busca, setBusca] = useState('');
  const [situacao, setSituacao] = useState('todas');
  const [origem, setOrigem] = useState('todas');
  const [modalAberto, setModalAberto] = useState(false);
  const [importAberto, setImportAberto] = useState(false);
  const [pulso, setPulso] = useState(0);
  const [mostrando, setMostrando] = useState(LINHAS_POR_VEZ);

  const contatos = useConsulta<Contato[]>(
    clinicaId
      ? () =>
          buscarTodas((de, ate) =>
            supabase
              .from('pacientes')
              .select(
                'id, nome_completo, telefone, email, origem, situacao, interesse_principal, foto_url, ultimo_contato_em, ultima_visita_em, criado_em',
              )
              .eq('clinica_id', clinicaId)
              .is('excluido_em', null)
              .order('criado_em', { ascending: false })
              .order('id')
              .range(de, ate),
          )
      : null,
    [clinicaId], [pulso],
  );

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (contatos.dados ?? []).filter((c) => {
      if (situacao !== 'todas' && c.situacao !== situacao) return false;
      if (origem !== 'todas' && c.origem !== origem) return false;
      if (!termo) return true;
      return `${c.nome_completo} ${c.telefone} ${c.email ?? ''} ${c.interesse_principal ?? ''}`
        .toLowerCase()
        .includes(termo);
    });
  }, [contatos.dados, busca, situacao, origem]);

  const total = contatos.dados?.length ?? 0;
  const porSituacao = (chave: string) =>
    (contatos.dados ?? []).filter((c) => c.situacao === chave).length;

  function exportar() {
    baixarCsv(
      `contatos-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Nome', 'Telefone', 'E-mail', 'Origem', 'Situação', 'Interesse', 'Último contato'],
      lista.map((c) => [
        c.nome_completo,
        telefoneVisivel(c.telefone),
        c.email ?? '',
        ROTULO_ORIGEM[c.origem] ?? c.origem,
        SITUACAO[c.situacao] ?? c.situacao,
        c.interesse_principal ?? '',
        c.ultimo_contato_em ? dataCurta(c.ultimo_contato_em) : '',
      ]),
    );
  }

  /** Abre (ou reaproveita) a conversa de WhatsApp deste contato. */
  async function abrirConversa(contato: Contato) {
    await executar(
      async () => {
        const { data: existente } = await supabase
          .from('conversas')
          .select('id')
          .eq('clinica_id', clinicaId)
          .eq('paciente_id', contato.id)
          .eq('canal', 'whatsapp')
          .maybeSingle();

        if (!existente) {
          const { error } = await supabase.from('conversas').insert({
            clinica_id: clinicaId,
            unidade_id: unidadeId,
            paciente_id: contato.id,
            canal: 'whatsapp',
          });
          if (error) return { error };
        }
        return { error: null };
      },
      `Conversa de ${contato.nome_completo.split(' ')[0]} aberta`,
      () => ir('Conversas'),
    );
  }

  return (
    <>
      <Cabecalho
        titulo="Contatos"
        texto="Todo mundo que já falou com a clínica, em um lugar só."
        acao={
          <div className="acoes-cabecalho">
            <button className="secondary-btn" onClick={() => setImportAberto(true)}>
              <Upload size={15} /> Importar
            </button>
            <button className="secondary-btn" onClick={exportar} disabled={!lista.length}>
              <Download size={15} /> Exportar
            </button>
            <button className="primary-btn" onClick={() => setModalAberto(true)}>
              <Plus size={15} /> Novo contato
            </button>
          </div>
        }
      />

      <div className="resumo-contatos">
        {[
          ['Todos', 'todas', total],
          ['Leads', 'lead', porSituacao('lead')],
          ['Pacientes', 'paciente', porSituacao('paciente')],
          ['Inativos', 'inativo', porSituacao('inativo')],
        ].map(([rotulo, chave, quantidade]) => (
          <button
            key={chave as string}
            className={`resumo-item ${situacao === chave ? 'ativo' : ''}`}
            onClick={() => setSituacao(chave as string)}
          >
            <b>{quantidade as number}</b>
            <span>{rotulo as string}</span>
          </button>
        ))}
      </div>

      <div className="filtros">
        <label className="busca busca-larga">
          <Search size={16} />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, telefone, e-mail ou interesse..."
          />
        </label>

        <select value={origem} onChange={(e) => setOrigem(e.target.value)} className="select">
          <option value="todas">Todas as origens</option>
          {Object.entries(ROTULO_ORIGEM).map(([valor, rotulo]) => (
            <option key={valor} value={valor}>
              {rotulo}
            </option>
          ))}
        </select>
      </div>

      <article className="panel table-panel">
        <Conteudo
          consulta={contatos}
          linhas={5}
          vazio={
            <EstadoVazio
              icone={Contact}
              titulo="Nenhum contato ainda"
              texto="Quem mandar mensagem pelo WhatsApp entra aqui sozinho. Você também pode cadastrar à mão."
              acao={
                <button className="primary-btn" onClick={() => setModalAberto(true)}>
                  <Plus size={15} /> Cadastrar contato
                </button>
              }
            />
          }
        >
          {() =>
            lista.length === 0 ? (
              <p className="lista-vazia">Nenhum contato com esses filtros.</p>
            ) : (
              <>
                <p className="contagem">
                  {lista.length === total
                    ? `${total} contato(s)`
                    : `${lista.length} de ${total} contato(s)`}
                </p>
                <div className="tabela-contatos">
                  <header>
                    <span>CONTATO</span>
                    <span>TELEFONE</span>
                    <span>ORIGEM</span>
                    <span>SITUAÇÃO</span>
                    <span>INTERESSE</span>
                    <span>ÚLTIMO CONTATO</span>
                    <span />
                  </header>
                  {lista.slice(0, mostrando).map((contato) => (
                    <div key={contato.id}>
                      <span className="celula-nome">
                        <Avatar nome={contato.nome_completo} foto={contato.foto_url} />
                        <b>{contato.nome_completo}</b>
                      </span>
                      <span>{telefoneVisivel(contato.telefone)}</span>
                      <span>
                        <em className="selo">{ROTULO_ORIGEM[contato.origem] ?? contato.origem}</em>
                      </span>
                      <span>
                        <em className={`situacao situacao-${contato.situacao}`}>
                          {SITUACAO[contato.situacao] ?? contato.situacao}
                        </em>
                      </span>
                      <span>{contato.interesse_principal ?? '—'}</span>
                      <span>
                        {contato.ultimo_contato_em
                          ? tempoRelativo(contato.ultimo_contato_em)
                          : tempoRelativo(contato.criado_em)}
                      </span>
                      <button
                        className="secondary-btn"
                        disabled={ocupado}
                        onClick={() => abrirConversa(contato)}
                        title="Abrir conversa no WhatsApp"
                      >
                        <MessageCircle size={14} />
                      </button>
                    </div>
                  ))}
                </div>
                {lista.length > mostrando && (
                  <button
                    className="secondary-btn"
                    onClick={() => setMostrando((n) => n + LINHAS_POR_VEZ)}
                  >
                    Mostrar mais ({lista.length - mostrando} restantes)
                  </button>
                )}
              </>
            )
          }
        </Conteudo>
      </article>

      <ImportarContatos
        aberto={importAberto}
        aoFechar={() => setImportAberto(false)}
        aoImportar={() => setPulso((n) => n + 1)}
      />

      <ModalContato
        aberto={modalAberto}
        aoFechar={() => setModalAberto(false)}
        aoCriar={() => setPulso((n) => n + 1)}
      />
    </>
  );
}

function ModalContato({
  aberto,
  aoFechar,
  aoCriar,
}: {
  aberto: boolean;
  aoFechar: () => void;
  aoCriar: () => void;
}) {
  const { clinicaId, unidadeId } = useClinica();
  const { executar, ocupado } = useAcao();
  const procedimentos = useProcedimentos(clinicaId);

  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState('');
  const [origem, setOrigem] = useState('instagram');
  const [interesse, setInteresse] = useState('');

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
          interesse: interesse || null,
        });
        if (error || !id) return { error };
        if (email.trim()) {
          return supabase.from('pacientes').update({ email: email.trim() }).eq('id', id);
        }
        return { error: null };
      },
      'Contato cadastrado',
      () => {
        setNome('');
        setTelefone('');
        setEmail('');
        setInteresse('');
        aoCriar();
        aoFechar();
      },
    );
  }

  return (
    <Modal
      titulo="Novo contato"
      descricao="O telefone identifica a pessoa — se já existir, o cadastro é reaproveitado."
      aberto={aberto}
      aoFechar={aoFechar}
      aoConfirmar={salvar}
      rotuloConfirmar="Cadastrar"
      salvando={ocupado}
    >
      <div className="modal-grade">
        <Campo rotulo="Nome completo" largo>
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
        <Campo rotulo="E-mail">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
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
          <select value={interesse} onChange={(e) => setInteresse(e.target.value)}>
            <option value="">— A definir —</option>
            {(procedimentos.dados ?? []).map((p) => (
              <option key={p.id} value={p.nome}>
                {p.nome}
              </option>
            ))}
          </select>
        </Campo>
      </div>
    </Modal>
  );
}
