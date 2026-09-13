'use client';

import { useEffect, useState } from 'react';
import {
  Bell,
  Check,
  ChevronDown,
  LogOut,
  Menu,
  MoonStar,
  Search,
  Sun,
  TriangleAlert,
} from 'lucide-react';
import { CONFIGURADO, supabase } from '@/lib/supabase/cliente';
import { useConsulta } from '@/lib/dados/consulta';
import { useSessao } from '@/lib/dados/sessao';
import { iniciais } from '@/lib/dados/formato';
import { Entrar, Onboarding } from '@/components/painel/acesso';
import { Esqueleto, useAviso } from '@/components/painel/base';
import { NAVEGACAO, type Vista } from '@/components/painel/navegacao';
import { PainelDashboard } from '@/components/painel/painel-dashboard';
import { PainelConversas } from '@/components/painel/painel-conversas';
import { PainelAgenda } from '@/components/painel/painel-agenda';
import { PainelContatos } from '@/components/painel/painel-contatos';
import { PainelListas } from '@/components/painel/painel-listas';
import { PainelReativacao } from '@/components/painel/painel-reativacao';
import { PainelCampanhas } from '@/components/painel/painel-campanhas';
import { PainelRelatorios } from '@/components/painel/painel-relatorios';
import { PainelCadastros } from '@/components/painel/painel-cadastros';
import { PainelIA } from '@/components/painel/painel-ia';

export default function Home() {
  const { situacao } = useSessao();

  // Build sem as variáveis do Supabase: sem isto a página inteira falharia
  // com 500 e ninguém saberia por quê.
  if (!CONFIGURADO) return <ConfiguracaoAusente />;

  if (situacao === 'carregando') {
    return (
      <main className="portal">
        <div className="portal-cartao">
          <Esqueleto linhas={3} altura={48} />
        </div>
      </main>
    );
  }

  if (situacao === 'deslogado') return <Entrar />;
  if (situacao === 'sem-clinica') return <Onboarding />;

  return <Painel />;
}

function ConfiguracaoAusente() {
  return (
    <main className="portal">
      <div className="portal-cartao portal-confirmacao">
        <TriangleAlert size={28} />
        <h1>Configuração incompleta</h1>
        <p>
          Este build não recebeu <code>VITE_SUPABASE_URL</code> e{' '}
          <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>. Elas são embutidas no
          momento da compilação, então precisam existir como variáveis de{' '}
          <b>build</b> da hospedagem — definir apenas em tempo de execução não
          resolve.
        </p>
      </div>
    </main>
  );
}

function Painel() {
  const { clinica, perfil, unidades, unidade, trocarUnidade, sair } = useSessao();
  const { avisar } = useAviso();

  const [vista, setVista] = useState<Vista>('Dashboard');
  const [busca, setBusca] = useState('');
  const [tema, setTema] = useState<'claro' | 'escuro'>('claro');
  const [menuUnidade, setMenuUnidade] = useState(false);
  const [menuPerfil, setMenuPerfil] = useState(false);

  /**
   * No celular a trilha de ícones não cabe ao lado do conteúdo, então ela vira
   * uma gaveta. No desktop este estado é ignorado — o CSS mantém a trilha fixa.
   */
  const [gaveta, setGaveta] = useState(false);

  /**
   * O título da aba é o nome do próprio negócio.
   *
   * O sistema atende vários clientes, então nenhum nome fixo serviria: quem
   * abre o painel precisa reconhecer a aba como sua, não como a de outro.
   */
  useEffect(() => {
    const nome = clinica?.nome_exibicao ?? clinica?.nome;
    if (nome) document.title = nome;
  }, [clinica]);

  // O tema fica no dispositivo. O padrão agora é o claro.
  useEffect(() => {
    const salvo = localStorage.getItem('cliniia:tema');
    const inicial = salvo === 'escuro' ? 'escuro' : 'claro';
    setTema(inicial);
    document.documentElement.dataset.tema = inicial;
  }, []);

  function alternarTema() {
    const proximo = tema === 'claro' ? 'escuro' : 'claro';
    setTema(proximo);
    document.documentElement.dataset.tema = proximo;
    try {
      localStorage.setItem('cliniia:tema', proximo);
    } catch {
      // Navegação privada: o tema volta ao padrão no próximo acesso.
    }
  }

  const [pulsoPendencias, setPulsoPendencias] = useState(0);

  // O contador do menu precisa acompanhar a chegada de mensagem, e não só a
  // troca de tela — senão o aviso de não lida aparece com minutos de atraso.
  useEffect(() => {
    if (!clinica) return;

    const recarregar = () => setPulsoPendencias((n) => n + 1);

    const canal = supabase
      .channel(`pendencias:${clinica.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversas', filter: `clinica_id=eq.${clinica.id}` },
        recarregar,
      )
      .subscribe();

    const sondagem = setInterval(recarregar, 30000);
    const aoVoltar = () => document.visibilityState === 'visible' && recarregar();
    document.addEventListener('visibilitychange', aoVoltar);

    return () => {
      clearInterval(sondagem);
      document.removeEventListener('visibilitychange', aoVoltar);
      void supabase.removeChannel(canal);
    };
  }, [clinica]);

  // Contadores do menu: conversas não lidas e agendamentos a confirmar.
  const pendencias = useConsulta<{ naoLidas: number; aConfirmar: number }>(
    clinica
      ? async () => {
          const [conversas, agendamentos] = await Promise.all([
            supabase
              .from('conversas')
              .select('id', { count: 'exact', head: true })
              .eq('clinica_id', clinica.id)
              .gt('nao_lidas', 0),
            supabase
              .from('agendamentos')
              .select('id', { count: 'exact', head: true })
              .eq('clinica_id', clinica.id)
              .eq('status', 'aguardando_confirmacao')
              .gte('inicio', new Date().toISOString()),
          ]);
          return {
            data: { naoLidas: conversas.count ?? 0, aConfirmar: agendamentos.count ?? 0 },
            error: conversas.error ?? agendamentos.error,
          };
        }
      : null,
    [clinica?.id, vista], [pulsoPendencias],
  );

  const naoLidas = pendencias.dados?.naoLidas ?? 0;
  const aConfirmar = pendencias.dados?.aConfirmar ?? 0;

  // Conversas ocupa a área inteira, como um cliente de mensagens.
  const cheio = vista === 'Conversas';

  return (
    <main className="app">
      <nav className={`menu ${gaveta ? 'menu-aberto' : ''}`} aria-label="Navegação principal">
        <span className={`menu-selo ${clinica?.logo_url ? 'com-logo' : ''}`}>
          {clinica?.logo_url ? (
            <img src={clinica.logo_url} alt={clinica.nome} />
          ) : (
            <b aria-hidden="true">{iniciais(clinica?.nome)}</b>
          )}
        </span>

        <div className="menu-itens">
          {NAVEGACAO.map(([grupo, rotulo, Icone], indice) => (
            <div key={rotulo} className="menu-bloco">
              {grupo && indice > 0 && <hr />}
              <button
                type="button"
                className={`menu-item ${vista === rotulo ? 'ativo' : ''}`}
                onClick={() => {
                  setVista(rotulo);
                  setGaveta(false);
                }}
                aria-current={vista === rotulo ? 'page' : undefined}
                aria-label={rotulo}
                data-dica={rotulo}
              >
                <Icone size={20} />
                {/* Só aparece na gaveta do celular: no desktop o nome vem do balão. */}
                <span className="menu-rotulo">{rotulo}</span>
                {rotulo === 'Conversas' && naoLidas > 0 && <em>{naoLidas}</em>}
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          className="menu-item menu-tema"
          onClick={alternarTema}
          aria-label={tema === 'claro' ? 'Tema escuro' : 'Tema claro'}
          data-dica={tema === 'claro' ? 'Tema escuro' : 'Tema claro'}
        >
          {tema === 'claro' ? <MoonStar size={19} /> : <Sun size={19} />}
        </button>
      </nav>

      {/* Fecha a gaveta ao tocar fora dela. Só existe enquanto ela está aberta. */}
      {gaveta && (
        <button
          type="button"
          className="menu-veu"
          aria-label="Fechar menu"
          onClick={() => setGaveta(false)}
        />
      )}

      <section className="area">
        <header className="barra">
          <button
            type="button"
            className="botao-icone menu-abrir"
            onClick={() => setGaveta((v) => !v)}
            aria-label="Abrir menu"
            aria-expanded={gaveta}
          >
            <Menu size={18} />
          </button>

          <label className="busca">
            <Search size={16} />
            <input
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                if (e.target.value && vista !== 'Conversas') setVista('Conversas');
              }}
              placeholder="Buscar conversa por nome ou telefone..."
            />
          </label>

          <div className="barra-acoes">
            <div className="menu-ancora">
              <button
                type="button"
                className="seletor-unidade"
                onClick={() => setMenuUnidade((v) => !v)}
                disabled={unidades.length <= 1}
              >
                <span className={`clinic-avatar ${clinica?.logo_url ? 'com-logo' : ''}`}>
                  {clinica?.logo_url ? (
                    <img src={clinica.logo_url} alt="" />
                  ) : (
                    iniciais(clinica?.nome)
                  )}
                </span>
                <span className="seletor-texto">
                  <strong>{clinica?.nome_exibicao ?? clinica?.nome}</strong>
                  <small>{unidade?.nome ?? 'Sem unidade'}</small>
                </span>
                {unidades.length > 1 && <ChevronDown size={15} />}
              </button>

              {menuUnidade && (
                <div className="menu-suspenso direita">
                  {unidades.map((u) => (
                    <button
                      type="button"
                      key={u.id}
                      onClick={() => {
                        trocarUnidade(u.id);
                        setMenuUnidade(false);
                        avisar(`Unidade: ${u.nome}`);
                      }}
                    >
                      {u.nome}
                      {u.id === unidade?.id && <Check size={14} />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              className="botao-icone notificacao"
              aria-label="Pendências"
              onClick={() => {
                if (naoLidas) setVista('Conversas');
                else if (aConfirmar) setVista('Agenda');
                else avisar('Nada pendente por aqui.');
              }}
            >
              <Bell size={18} />
              {(naoLidas > 0 || aConfirmar > 0) && <i />}
            </button>

            <div className="menu-ancora">
              <button
                type="button"
                className="user-avatar"
                onClick={() => setMenuPerfil((v) => !v)}
                aria-label="Sua conta"
              >
                {iniciais(perfil?.nome_completo || perfil?.email)}
              </button>
              {menuPerfil && (
                <div className="menu-suspenso direita">
                  <p className="menu-titulo">
                    {perfil?.nome_completo || perfil?.email}
                    <small>{perfil?.email}</small>
                  </p>
                  <button type="button" onClick={() => void sair()}>
                    <LogOut size={14} /> Sair
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className={`conteudo ${cheio ? 'conteudo-cheio' : ''}`}>
          {vista === 'Dashboard' && <PainelDashboard ir={setVista} />}
          {vista === 'Conversas' && <PainelConversas busca={busca} />}
          {vista === 'Agenda' && <PainelAgenda />}
          {vista === 'Contatos' && <PainelContatos ir={setVista} />}
          {vista === 'Lista de Leads' && <PainelListas />}
          {vista === 'Reativação' && <PainelReativacao ir={setVista} />}
          {vista === 'Campanhas' && <PainelCampanhas />}
          {vista === 'Relatórios' && <PainelRelatorios />}
          {vista === 'Minha clínica' && <PainelCadastros guiaInicial="numeros" />}
          {vista === 'Configurar IA' && <PainelIA />}
        </div>
      </section>
    </main>
  );
}
