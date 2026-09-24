'use client';

import { useState } from 'react';
import { useEffect, useRef } from 'react';
import {
  Building2,
  Copy,
  KeyRound,
  Loader2,
  Plus,
  QrCode,
  RefreshCw,
  Smartphone,
  Sparkles,
  Trash2,
  Unplug,
  UserCog,
  Users,
} from 'lucide-react';
import { whatsapp, type RespostaConexao } from '@/lib/dados/api';
import { supabase } from '@/lib/supabase/cliente';
import { useConsulta } from '@/lib/dados/consulta';
import { useClinica } from '@/lib/dados/sessao';
import {
  useProfissionais,
  type NumeroWhatsapp,
  type Procedimento,
} from '@/lib/dados/catalogo';
import type { Database } from '@/lib/supabase/tipos-banco';

type Papel = Database['public']['Enums']['papel_usuario'];
import { moeda, numero, ROTULO_STATUS_CHIP, telefoneDigitos, telefoneVisivel } from '@/lib/dados/formato';
import { Cabecalho, Campo, Conteudo, EstadoVazio, Falha, Modal, useAcao, useAviso } from './base';
import { MarcaClinica } from './marca-clinica';

type Guia = 'clinica' | 'procedimentos' | 'profissionais' | 'numeros';

const GUIAS: Array<[Guia, string, React.ElementType]> = [
  ['clinica', 'Identidade', Building2],
  ['numeros', 'Números de WhatsApp', Smartphone],
  ['procedimentos', 'Procedimentos', Sparkles],
  ['profissionais', 'Profissionais', UserCog],
];

export function PainelCadastros({ guiaInicial }: { guiaInicial?: Guia } = {}) {
  const [guia, setGuia] = useState<Guia>(guiaInicial ?? 'procedimentos');

  return (
    <>
      <Cabecalho
        titulo="Minha clínica"
        texto="Identidade, equipe, números e o catálogo que alimenta a agenda e a assistente."
      />

      <div className="guias">
        {GUIAS.map(([chave, rotulo, Icone]) => (
          <button
            key={chave}
            className={guia === chave ? 'active' : ''}
            onClick={() => setGuia(chave)}
          >
            <Icone size={15} /> {rotulo}
          </button>
        ))}
      </div>

      {guia === 'procedimentos' && <Procedimentos />}
      {guia === 'profissionais' && (
        <>
          <Profissionais />
          <Equipe />
        </>
      )}
      {guia === 'clinica' && <MarcaClinica />}
      {guia === 'numeros' && <Numeros />}
    </>
  );
}

/* ------------------------------------------------------------ procedimentos */

function Procedimentos() {
  const { clinicaId } = useClinica();
  const { executar, ocupado } = useAcao();
  const [aberto, setAberto] = useState(false);
  const [pulso, setPulso] = useState(0);

  const lista = useConsulta<Procedimento[]>(
    clinicaId
      ? () =>
          supabase
            .from('procedimentos')
            .select('*')
            .eq('clinica_id', clinicaId)
            .eq('ativo', true)
            .order('nome')
      : null,
    [clinicaId], [pulso],
  );

  const [nome, setNome] = useState('');
  const [duracao, setDuracao] = useState(60);
  const [valor, setValor] = useState('');
  const [retorno, setRetorno] = useState('');

  async function salvar() {
    if (!nome.trim()) return;
    await executar(
      () =>
        supabase.from('procedimentos').insert({
          clinica_id: clinicaId,
          nome: nome.trim(),
          duracao_minutos: duracao,
          valor: valor ? Number(valor) : 0,
          intervalo_retorno_dias: retorno ? Number(retorno) : null,
        }),
      'Procedimento cadastrado',
      () => {
        setNome('');
        setValor('');
        setRetorno('');
        setPulso((n) => n + 1);
        setAberto(false);
      },
    );
  }

  async function desativar(id: string, rotulo: string) {
    await executar(
      () => supabase.from('procedimentos').update({ ativo: false }).eq('id', id),
      `${rotulo} removido do catálogo`,
      () => setPulso((n) => n + 1),
    );
  }

  return (
    <article className="panel table-panel">
      <div className="panel-title">
        <div>
          <h2>Procedimentos</h2>
          <p>Duração e preço entram sozinhos ao marcar um atendimento</p>
        </div>
        <button className="primary-btn" onClick={() => setAberto(true)}>
          <Plus size={15} /> Novo
        </button>
      </div>

      <Conteudo
        consulta={lista}
        vazio={
          <EstadoVazio
            icone={Sparkles}
            titulo="Nenhum procedimento"
            texto="Cadastre o que sua clínica oferece — é a base da agenda e do funil."
            acao={
              <button className="primary-btn" onClick={() => setAberto(true)}>
                <Plus size={15} /> Cadastrar procedimento
              </button>
            }
          />
        }
      >
        {(itens) => (
          <div className="data-table">
            <header>
              <span>NOME</span>
              <span>DURAÇÃO</span>
              <span>VALOR</span>
              <span>RETORNO</span>
              <span />
            </header>
            {itens.map((item) => (
              <div key={item.id}>
                <span>{item.nome}</span>
                <span>{item.duracao_minutos} min</span>
                <span>{moeda(item.valor)}</span>
                <span>
                  {item.intervalo_retorno_dias ? `${item.intervalo_retorno_dias} dias` : '—'}
                </span>
                <button
                  className="icone-perigo"
                  disabled={ocupado}
                  onClick={() => desativar(item.id, item.nome)}
                  aria-label={`Remover ${item.nome}`}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Conteudo>

      <Modal
        titulo="Novo procedimento"
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        aoConfirmar={salvar}
        salvando={ocupado}
      >
        <div className="modal-grade">
          <Campo rotulo="Nome" largo>
            <input value={nome} onChange={(e) => setNome(e.target.value)} required autoFocus />
          </Campo>
          <Campo rotulo="Duração (min)">
            <input
              type="number"
              min={15}
              step={15}
              value={duracao}
              onChange={(e) => setDuracao(Number(e.target.value))}
            />
          </Campo>
          <Campo rotulo="Valor (R$)">
            <input
              type="number"
              min={0}
              step="0.01"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
            />
          </Campo>
          <Campo rotulo="Retorno em (dias)" dica="Usado para lembrar o paciente de voltar." largo>
            <input
              type="number"
              min={0}
              value={retorno}
              onChange={(e) => setRetorno(e.target.value)}
            />
          </Campo>
        </div>
      </Modal>
    </article>
  );
}

/* ------------------------------------------------------------ profissionais */

function Profissionais() {
  const { clinicaId, unidadeId } = useClinica();
  const { executar, ocupado } = useAcao();
  const [aberto, setAberto] = useState(false);
  const lista = useProfissionais(clinicaId);

  const [nome, setNome] = useState('');
  const [especialidade, setEspecialidade] = useState('');
  const [registro, setRegistro] = useState('');

  async function salvar() {
    if (!nome.trim()) return;
    await executar(
      () =>
        supabase.from('profissionais').insert({
          clinica_id: clinicaId,
          unidade_id: unidadeId,
          nome: nome.trim(),
          especialidade: especialidade.trim() || null,
          registro_conselho: registro.trim() || null,
        }),
      'Profissional cadastrado',
      () => {
        setNome('');
        setEspecialidade('');
        setRegistro('');
        setAberto(false);
        lista.recarregar();
      },
    );
  }

  return (
    <article className="panel table-panel">
      <div className="panel-title">
        <div>
          <h2>Profissionais</h2>
          <p>Quem executa os procedimentos na agenda</p>
        </div>
        <button className="primary-btn" onClick={() => setAberto(true)}>
          <Plus size={15} /> Novo
        </button>
      </div>

      <Conteudo
        consulta={lista}
        vazio={
          <EstadoVazio
            icone={UserCog}
            titulo="Nenhum profissional"
            texto="Sem profissional a agenda não bloqueia conflitos de horário."
            acao={
              <button className="primary-btn" onClick={() => setAberto(true)}>
                <Plus size={15} /> Cadastrar profissional
              </button>
            }
          />
        }
      >
        {(itens) => (
          <div className="data-table">
            <header>
              <span>NOME</span>
              <span>ESPECIALIDADE</span>
              <span>REGISTRO</span>
            </header>
            {itens.map((item) => (
              <div key={item.id}>
                <span>{item.nome}</span>
                <span>{item.especialidade ?? '—'}</span>
                <span>{item.registro_conselho ?? '—'}</span>
              </div>
            ))}
          </div>
        )}
      </Conteudo>

      <Modal
        titulo="Novo profissional"
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        aoConfirmar={salvar}
        salvando={ocupado}
      >
        <Campo rotulo="Nome">
          <input value={nome} onChange={(e) => setNome(e.target.value)} required autoFocus />
        </Campo>
        <Campo rotulo="Especialidade">
          <input
            value={especialidade}
            onChange={(e) => setEspecialidade(e.target.value)}
            placeholder="Biomedicina estética"
          />
        </Campo>
        <Campo rotulo="Registro no conselho">
          <input value={registro} onChange={(e) => setRegistro(e.target.value)} />
        </Campo>
      </Modal>
    </article>
  );
}

/* ------------------------------------------------------------------- equipe */

const ROTULO_PAPEL: Record<Papel, string> = {
  proprietario: 'Proprietário',
  administrador: 'Administrador',
  gerente: 'Gerente',
  atendente: 'Atendente',
  profissional: 'Profissional',
};

/** Papéis que um gestor pode atribuir. Proprietário só nasce com a clínica. */
const PAPEIS_ATRIBUIVEIS: Papel[] = ['atendente', 'profissional', 'gerente', 'administrador'];

type Membro = {
  id: string;
  papel: Papel;
  ativo: boolean;
  unidade_id: string | null;
  criado_em: string;
  perfis: { nome_completo: string; email: string | null } | null;
};

/**
 * Senha legível para ditar por telefone: sem 0/O, 1/l/I, e com um separador
 * no meio para a pessoa não perder o lugar.
 */
function gerarSenha(): string {
  const alfabeto = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  const letras = [...bytes].map((b) => alfabeto[b % alfabeto.length]);
  return `${letras.slice(0, 5).join('')}-${letras.slice(5).join('')}`;
}

type Credencial = { nome: string; email: string; senha: string };

function Equipe() {
  const { clinicaId, unidadeId, ehGestor, perfil } = useClinica();
  const { executar, ocupado } = useAcao();
  const { avisar, alertar } = useAviso();
  const [pulso, setPulso] = useState(0);
  const [modalNovo, setModalNovo] = useState(false);
  const [redefinindo, setRedefinindo] = useState<Membro | null>(null);
  const [credencial, setCredencial] = useState<Credencial | null>(null);

  const lista = useConsulta<Membro[]>(
    clinicaId
      ? () =>
          supabase
            .from('membros_clinica')
            .select('id, papel, ativo, unidade_id, criado_em, perfis(nome_completo, email)')
            .eq('clinica_id', clinicaId)
            .order('criado_em')
      : null,
    [clinicaId], [pulso],
  );

  // Formulário do novo usuário.
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [papel, setPapel] = useState<Papel>('atendente');
  const [naAgenda, setNaAgenda] = useState(false);
  const [especialidade, setEspecialidade] = useState('');
  const [registro, setRegistro] = useState('');
  const [senha, setSenha] = useState(gerarSenha);

  // Senha nova para alguém que já existe.
  const [novaSenha, setNovaSenha] = useState('');

  function abrirNovo() {
    setNome('');
    setEmail('');
    setPapel('atendente');
    setNaAgenda(false);
    setEspecialidade('');
    setRegistro('');
    setSenha(gerarSenha());
    setModalNovo(true);
  }

  function escolherPapel(novo: Papel) {
    setPapel(novo);
    // Profissional quase sempre atende na agenda; os demais raramente.
    if (novo === 'profissional') setNaAgenda(true);
  }

  async function criar() {
    if (!nome.trim() || !email.trim() || senha.length < 8) return;
    const dados = { nome: nome.trim(), email: email.trim().toLowerCase(), senha };
    await executar(
      () =>
        supabase.rpc('criar_usuario_da_clinica', {
          p_clinica_id: clinicaId,
          p_email: dados.email,
          p_senha: dados.senha,
          p_nome: dados.nome,
          p_papel: papel,
          p_unidade_id: unidadeId,
          p_profissional: naAgenda,
          p_especialidade: especialidade.trim() || null,
          p_registro: registro.trim() || null,
        }),
      'Usuário criado',
      () => {
        setModalNovo(false);
        setPulso((n) => n + 1);
        setCredencial(dados);
      },
    );
  }

  function abrirRedefinir(membro: Membro) {
    setNovaSenha(gerarSenha());
    setRedefinindo(membro);
  }

  async function redefinir() {
    if (!redefinindo || novaSenha.length < 8) return;
    const alvo = redefinindo;
    await executar(
      () => supabase.rpc('redefinir_senha_membro', { p_membro_id: alvo.id, p_senha: novaSenha }),
      'Senha redefinida',
      () => {
        setRedefinindo(null);
        setCredencial({
          nome: alvo.perfis?.nome_completo ?? '',
          email: alvo.perfis?.email ?? '',
          senha: novaSenha,
        });
      },
    );
  }

  async function alternarAtivo(membro: Membro) {
    await executar(
      () => supabase.from('membros_clinica').update({ ativo: !membro.ativo }).eq('id', membro.id),
      membro.ativo ? 'Acesso desativado' : 'Acesso reativado',
      () => setPulso((n) => n + 1),
    );
  }

  async function copiar(texto: string, rotulo: string) {
    try {
      await navigator.clipboard.writeText(texto);
      avisar(`${rotulo} copiado`);
    } catch {
      alertar('Não deu para copiar. Selecione o texto e copie manualmente.');
    }
  }

  if (!ehGestor) return null;

  const podeMexer = (membro: Membro) =>
    membro.papel !== 'proprietario' || membro.perfis?.email === perfil?.email;

  return (
    <article className="panel table-panel" style={{ marginTop: 18 }}>
      <div className="panel-title">
        <div>
          <h2>Usuários com acesso</h2>
          <p>Quem entra no sistema com e-mail e senha</p>
        </div>
        <button className="primary-btn" onClick={abrirNovo}>
          <Plus size={15} /> Novo usuário
        </button>
      </div>

      <Conteudo
        consulta={lista}
        vazio={
          <EstadoVazio
            icone={Users}
            titulo="Só você tem acesso"
            texto="Crie logins para a equipe e cada pessoa entra com a própria senha."
            acao={
              <button className="primary-btn" onClick={abrirNovo}>
                <Plus size={15} /> Criar usuário
              </button>
            }
          />
        }
      >
        {(itens) => (
          <div className="data-table">
            <header>
              <span>NOME</span>
              <span>E-MAIL</span>
              <span>PAPEL</span>
              <span>ACESSO</span>
              <span />
            </header>
            {itens.map((membro) => (
              <div key={membro.id}>
                <span>{membro.perfis?.nome_completo || '—'}</span>
                <span>{membro.perfis?.email ?? '—'}</span>
                <span>{ROTULO_PAPEL[membro.papel]}</span>
                <span>{membro.ativo ? 'Ativo' : 'Desativado'}</span>
                <div className="acoes-evento">
                  {podeMexer(membro) && (
                    <button
                      className="secondary-btn"
                      disabled={ocupado}
                      onClick={() => abrirRedefinir(membro)}
                      title="Gera uma senha nova para esta pessoa"
                    >
                      <KeyRound size={14} /> Nova senha
                    </button>
                  )}
                  {membro.papel !== 'proprietario' && (
                    <button
                      className={`switch ${membro.ativo ? 'on' : ''}`}
                      disabled={ocupado}
                      onClick={() => alternarAtivo(membro)}
                      aria-label={membro.ativo ? 'Desativar acesso' : 'Reativar acesso'}
                      title={membro.ativo ? 'Desativar acesso' : 'Reativar acesso'}
                    >
                      <i />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Conteudo>

      <Modal
        titulo="Novo usuário"
        descricao="A senha aparece uma única vez depois de criar — copie e entregue para a pessoa."
        aberto={modalNovo}
        aoFechar={() => setModalNovo(false)}
        aoConfirmar={criar}
        rotuloConfirmar="Criar acesso"
        salvando={ocupado}
      >
        <div className="modal-grade">
          <Campo rotulo="Nome">
            <input value={nome} onChange={(e) => setNome(e.target.value)} required autoFocus />
          </Campo>
          <Campo rotulo="E-mail de login">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
              required
            />
          </Campo>
          <Campo rotulo="Papel">
            <select value={papel} onChange={(e) => escolherPapel(e.target.value as Papel)}>
              {PAPEIS_ATRIBUIVEIS.map((p) => (
                <option key={p} value={p}>
                  {ROTULO_PAPEL[p]}
                </option>
              ))}
            </select>
          </Campo>
          <span />
          <Campo rotulo="Senha inicial" dica="Mínimo de 8 caracteres." largo>
            <div className="campo-com-botao">
              <input
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
              <button
                type="button"
                className="secondary-btn"
                onClick={() => setSenha(gerarSenha())}
                title="Gerar outra senha"
              >
                <RefreshCw size={14} /> Gerar
              </button>
            </div>
          </Campo>
          <label className="campo-largo campo-marcado">
            <input
              type="checkbox"
              checked={naAgenda}
              onChange={(e) => setNaAgenda(e.target.checked)}
            />
            Aparece na agenda como profissional
          </label>
          {naAgenda && (
            <>
              <Campo rotulo="Especialidade">
                <input
                  value={especialidade}
                  onChange={(e) => setEspecialidade(e.target.value)}
                  placeholder="Biomedicina estética"
                />
              </Campo>
              <Campo rotulo="Registro no conselho">
                <input value={registro} onChange={(e) => setRegistro(e.target.value)} />
              </Campo>
            </>
          )}
        </div>
      </Modal>

      <Modal
        titulo="Nova senha"
        descricao={`Para ${redefinindo?.perfis?.nome_completo ?? 'esta pessoa'}. A senha antiga deixa de valer na hora.`}
        aberto={redefinindo !== null}
        aoFechar={() => setRedefinindo(null)}
        aoConfirmar={redefinir}
        rotuloConfirmar="Redefinir"
        salvando={ocupado}
      >
        <Campo rotulo="Senha nova" dica="Mínimo de 8 caracteres.">
          <div className="campo-com-botao">
            <input
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
              autoFocus
            />
            <button
              type="button"
              className="secondary-btn"
              onClick={() => setNovaSenha(gerarSenha())}
              title="Gerar outra senha"
            >
              <RefreshCw size={14} /> Gerar
            </button>
          </div>
        </Campo>
      </Modal>

      <Modal
        titulo="Dados de acesso"
        descricao="Entregue para a pessoa. Depois de fechar, a senha não aparece mais."
        aberto={credencial !== null}
        aoFechar={() => setCredencial(null)}
      >
        {credencial && (
          <div className="credenciais">
            <div>
              <small>Nome</small>
              <b>{credencial.nome}</b>
            </div>
            <div>
              <small>E-mail</small>
              <b>{credencial.email}</b>
              <button
                type="button"
                className="botao-icone"
                onClick={() => copiar(credencial.email, 'E-mail')}
                aria-label="Copiar e-mail"
              >
                <Copy size={14} />
              </button>
            </div>
            <div>
              <small>Senha</small>
              <b>{credencial.senha}</b>
              <button
                type="button"
                className="botao-icone"
                onClick={() => copiar(credencial.senha, 'Senha')}
                aria-label="Copiar senha"
              >
                <Copy size={14} />
              </button>
            </div>
            <button
              type="button"
              className="primary-btn"
              onClick={() =>
                copiar(
                  `Acesso ao sistema\nE-mail: ${credencial.email}\nSenha: ${credencial.senha}`,
                  'Acesso',
                )
              }
            >
              <Copy size={14} /> Copiar tudo
            </button>
          </div>
        )}
      </Modal>
    </article>
  );
}

/* ------------------------------------------------------------------ números */

function Numeros() {
  const { clinicaId, unidadeId } = useClinica();
  const { executar, ocupado } = useAcao();
  const [aberto, setAberto] = useState(false);
  const [pulso, setPulso] = useState(0);
  const [conectando, setConectando] = useState<NumeroWhatsapp | null>(null);
  const [excluindo, setExcluindo] = useState<NumeroWhatsapp | null>(null);

  const lista = useConsulta<NumeroWhatsapp[]>(
    clinicaId
      ? () =>
          supabase
            .from('numeros_whatsapp')
            .select('*')
            .eq('clinica_id', clinicaId)
            .eq('ativo', true)
            .order('apelido')
      : null,
    [clinicaId], [pulso],
  );

  const [apelido, setApelido] = useState('');
  const [numeroTexto, setNumeroTexto] = useState('');
  const [limite, setLimite] = useState(300);

  async function salvar() {
    if (!apelido.trim()) return;
    await executar(
      () =>
        supabase.from('numeros_whatsapp').insert({
          clinica_id: clinicaId,
          unidade_id: unidadeId,
          apelido: apelido.trim(),
          // Fica nulo até o pareamento: quem informa o número é o WhatsApp.
          numero: telefoneDigitos(numeroTexto) || null,
          limite_diario: limite,
        }),
      'Número cadastrado — agora conecte o WhatsApp',
      () => {
        setApelido('');
        setNumeroTexto('');
        setPulso((n) => n + 1);
        setAberto(false);
      },
    );
  }

  async function desconectar(numero: NumeroWhatsapp) {
    await executar(
      () => whatsapp.desconectar(numero.id).then(() => ({ error: null })),
      `${numero.apelido} desconectado`,
      () => setPulso((n) => n + 1),
    );
  }

  async function excluir() {
    if (!excluindo) return;
    await executar(
      () => whatsapp.excluir(excluindo.id).then(() => ({ error: null })),
      `${excluindo.apelido} excluído`,
      () => {
        setExcluindo(null);
        setPulso((n) => n + 1);
      },
    );
  }

  return (
    <article className="panel table-panel">
      <div className="panel-title">
        <div>
          <h2>Números de WhatsApp</h2>
          <p>Conecte o aparelho lendo o QR Code — é o que liga o sistema ao WhatsApp</p>
        </div>
        <button className="primary-btn" onClick={() => setAberto(true)}>
          <Plus size={15} /> Novo
        </button>
      </div>

      <Conteudo
        consulta={lista}
        vazio={
          <EstadoVazio
            icone={Smartphone}
            titulo="Nenhum número cadastrado"
            texto="Sem um número conectado, o sistema não envia nem recebe mensagem."
            acao={
              <button className="primary-btn" onClick={() => setAberto(true)}>
                <Plus size={15} /> Cadastrar número
              </button>
            }
          />
        }
      >
        {(itens) => (
          <div className="data-table">
            <header>
              <span>APELIDO</span>
              <span>NÚMERO</span>
              <span>STATUS</span>
              <span>HOJE</span>
              <span>LIMITE</span>
              <span />
            </header>
            {itens.map((item) => {
              const conectado = item.status === 'conectado';
              return (
                <div key={item.id}>
                  <span>{item.apelido}</span>
                  <span>{item.numero ? telefoneVisivel(item.numero) : '—'}</span>
                  <span className={`status ${conectado ? 'confirmed' : 'waiting'}`}>
                    <i />
                    {ROTULO_STATUS_CHIP[item.status] ?? item.status}
                  </span>
                  <span>{numero(item.enviados_hoje)}</span>
                  <span>{numero(item.limite_diario)}</span>
                  <div className="acoes-evento">
                    {conectado ? (
                      <button
                        className="secondary-btn"
                        disabled={ocupado}
                        onClick={() => desconectar(item)}
                      >
                        <Unplug size={14} /> Desconectar
                      </button>
                    ) : (
                      <button className="primary-btn" onClick={() => setConectando(item)}>
                        <QrCode size={14} /> Conectar
                      </button>
                    )}
                    <button
                      className="icone-perigo"
                      disabled={ocupado}
                      onClick={() => setExcluindo(item)}
                      aria-label={`Excluir ${item.apelido}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Conteudo>

      <Modal
        titulo="Novo número"
        descricao="Cadastre o apelido; o número em si vem do aparelho ao parear."
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        aoConfirmar={salvar}
        salvando={ocupado}
      >
        <Campo rotulo="Apelido">
          <input
            value={apelido}
            onChange={(e) => setApelido(e.target.value)}
            placeholder="Chip principal"
            required
            autoFocus
          />
        </Campo>
        <Campo rotulo="Número (opcional)" dica="Deixe em branco para preencher no pareamento.">
          <input
            value={numeroTexto}
            onChange={(e) => setNumeroTexto(e.target.value)}
            placeholder="(11) 99845-2031"
          />
        </Campo>
        <Campo rotulo="Limite diário de envios">
          <input
            type="number"
            min={1}
            value={limite}
            onChange={(e) => setLimite(Number(e.target.value))}
          />
        </Campo>
      </Modal>

      <Modal
        titulo={`Excluir ${excluindo?.apelido ?? 'número'}?`}
        descricao="O aparelho é desconectado e o número sai da lista. Conversas e campanhas antigas continuam no histórico."
        aberto={Boolean(excluindo)}
        aoFechar={() => setExcluindo(null)}
        aoConfirmar={excluir}
        rotuloConfirmar="Excluir"
        salvando={ocupado}
      >
        <p>Para usar este número de novo, cadastre e conecte pelo QR Code outra vez.</p>
      </Modal>

      {conectando && (
        <ModalConexao
          numero={conectando}
          aoFechar={() => {
            setConectando(null);
            setPulso((n) => n + 1);
          }}
        />
      )}
    </article>
  );
}

/**
 * Pareamento do aparelho.
 *
 * O QR Code do WhatsApp expira em segundos, então a tela consulta o estado a
 * cada 4 segundos: renova o código enquanto ninguém leu e fecha sozinha assim
 * que a conexão é confirmada.
 */
function ModalConexao({ numero, aoFechar }: { numero: NumeroWhatsapp; aoFechar: () => void }) {
  const { avisar, alertar } = useAviso();
  const [conexao, setConexao] = useState<RespostaConexao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [conectado, setConectado] = useState(false);
  const encerrado = useRef(false);

  useEffect(() => {
    encerrado.current = false;

    whatsapp
      .conectar(numero.id)
      .then((resposta) => {
        if (encerrado.current) return;
        setConexao(resposta);
        if (resposta.conectado) setConectado(true);
      })
      .catch((e: Error) => !encerrado.current && setErro(e.message));

    const relogio = setInterval(async () => {
      if (encerrado.current) return;
      try {
        const estado = await whatsapp.estado(numero.id);
        if (encerrado.current) return;

        if (estado.conectado) {
          setConectado(true);
          clearInterval(relogio);
          avisar(`${numero.apelido} conectado`);
          setTimeout(aoFechar, 1200);
          return;
        }
        // QR novo a cada rodada, porque o anterior já expirou.
        if (estado.qrcode) {
          setConexao((atual) => (atual ? { ...atual, qrcode: estado.qrcode ?? null } : atual));
        }
      } catch (e) {
        if (!encerrado.current) alertar((e as Error).message);
      }
    }, 4000);

    return () => {
      encerrado.current = true;
      clearInterval(relogio);
    };
  }, [numero.id, numero.apelido, aoFechar, avisar, alertar]);

  return (
    <Modal
      titulo={`Conectar ${numero.apelido}`}
      descricao="No celular: WhatsApp › Aparelhos conectados › Conectar um aparelho."
      aberto
      aoFechar={aoFechar}
    >
      {erro && <Falha erro={erro} />}

      {!erro && conectado && (
        <div className="pareamento pareamento-ok">
          <Smartphone size={26} />
          <b>Conectado!</b>
          <span>Este número já envia e recebe mensagens pelo sistema.</span>
        </div>
      )}

      {!erro && !conectado && (
        <div className="pareamento">
          {conexao?.qrcode ? (
            // oxlint-disable-next-line no-img-element -- data URI gerado pela
            // UazApi e trocado a cada 4s: não há o que o next/image otimizar.
            <img src={conexao.qrcode} alt="QR Code para conectar o WhatsApp" width={232} height={232} />
          ) : (
            <div className="pareamento-espera">
              <Loader2 size={22} className="girando" />
              <span>Gerando o código...</span>
            </div>
          )}
          <b>Leia o código com o celular</b>
          <span>O código se renova sozinho a cada poucos segundos.</span>
          {conexao?.paircode && (
            <p className="modal-nota">
              Ou digite este código no aparelho: <b>{conexao.paircode}</b>
            </p>
          )}
        </div>
      )}

      {conexao?.avisoWebhook && (
        <p className="modal-nota alerta">
          O aparelho vai conectar, mas as mensagens recebidas não chegarão até o
          sistema enquanto o webhook não apontar para um endereço público.
        </p>
      )}
    </Modal>
  );
}
