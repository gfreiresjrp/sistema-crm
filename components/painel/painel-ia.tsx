'use client';

import { useState } from 'react';
import { BookOpen, Bot, Loader2, MessageCircleMore, RotateCcw } from 'lucide-react';
import { supabase } from '@/lib/supabase/cliente';
import { useConsulta } from '@/lib/dados/consulta';
import { useClinica } from '@/lib/dados/sessao';
import type { ConfiguracaoIA } from '@/lib/dados/catalogo';
import { Cabecalho, Conteudo, EstadoVazio, useAcao } from './base';
import { ConhecimentoIA, FollowUpIA } from './conhecimento-ia';

type Guia = 'assistente' | 'conhecimento' | 'followup';

const GUIAS: Array<[Guia, string, React.ElementType]> = [
  ['assistente', 'Assistente', Bot],
  ['conhecimento', 'Conhecimento', BookOpen],
  ['followup', 'Follow-up', MessageCircleMore],
];

/**
 * Os marcadores que o servidor troca por dados vivos antes de chamar a OpenAI.
 * Ficam visíveis na tela porque, sem eles, a clínica escreveria preço à mão no
 * prompt e ele envelheceria em silêncio.
 */
const MARCADORES: Array<[string, string]> = [
  ['{{assistente}}', 'nome da assistente'],
  ['{{clinica}}', 'nome da clínica'],
  ['{{tom}}', 'tom de voz escolhido acima'],
  ['{{apresentacao}}', 'mensagem de apresentação'],
  ['{{procedimentos}}', 'catálogo com preços e duração'],
  ['{{limites}}', 'desconto, entrada e parcelas'],
  ['{{conhecimento}}', 'tudo o que foi cadastrado na aba Conhecimento'],
  ['{{paciente}}', 'nome, interesse e situação de quem escreveu'],
  ['{{instrucoes}}', 'instruções adicionais deste formulário'],
];

const MODELOS: Array<[string, string]> = [
  ['gpt-4o-mini', 'GPT-4o mini — rápido e barato (recomendado)'],
  ['gpt-4o', 'GPT-4o — mais caro, responde melhor em casos difíceis'],
  ['gpt-4.1-mini', 'GPT-4.1 mini'],
  ['gpt-4.1', 'GPT-4.1'],
];

const AUTOMACOES = [
  ['atendimento_24h', 'Atendimento automático 24h', 'Responder novas mensagens com linguagem natural.'],
  ['quebra_objecoes', 'Quebra de objeções', 'Negociar valores dentro do limite autorizado.'],
  ['confirmacao_agenda', 'Confirmação de agenda', 'Confirmar automaticamente no dia anterior.'],
  ['followup_inteligente', 'Follow-up inteligente', 'Retomar em 1, 3 e 7 dias para quem não respondeu.'],
  ['transcreve_audio', 'Transcrição de áudio', 'Entender áudios enviados pelo paciente.'],
  [
    'oferece_horarios',
    'Oferecer horários da agenda',
    'Sugerir dias e horários livres. Desligado, a IA pergunta a data que a pessoa prefere e passa para a equipe marcar.',
  ],
] as const;

type ChaveAutomacao = (typeof AUTOMACOES)[number][0];

export function PainelIA() {
  const { clinicaId, ehGestor } = useClinica();
  const [guia, setGuia] = useState<Guia>('assistente');

  // O texto padrão é o mesmo que o banco usa ao provisionar uma clínica nova;
  // buscá-lo de lá evita duas versões do prompt em lugares diferentes.
  const padrao = useConsulta<string>(() => supabase.rpc('prompt_assistente_padrao'), []);
  const PROMPT_PADRAO = padrao.dados ?? '';
  const { executar, ocupado } = useAcao();

  const consulta = useConsulta<ConfiguracaoIA | null>(
    clinicaId
      ? () =>
          supabase
            .from('configuracoes_ia')
            .select('*')
            .eq('clinica_id', clinicaId)
            .is('unidade_id', null)
            .maybeSingle()
      : null,
    [clinicaId],
  );

  // O rascunho existe só a partir da primeira edição; antes disso vale o que
  // veio do banco. Assim a tela não precisa de um efeito para se sincronizar,
  // e uma recarga nunca descarta o que a pessoa acabou de digitar sem querer.
  const [edicoes, setEdicoes] = useState<Partial<ConfiguracaoIA> | null>(null);
  const rascunho = consulta.dados ? { ...consulta.dados, ...edicoes } : null;

  const alterado =
    rascunho && consulta.dados
      ? JSON.stringify(rascunho) !== JSON.stringify(consulta.dados)
      : false;

  function editar<C extends keyof ConfiguracaoIA>(campo: C, valor: ConfiguracaoIA[C]) {
    setEdicoes((atual) => ({ ...atual, [campo]: valor }));
  }

  async function salvar() {
    if (!rascunho) return;
    await executar(
      () =>
        supabase
          .from('configuracoes_ia')
          .update({
            nome_assistente: rascunho.nome_assistente,
            tom_voz: rascunho.tom_voz,
            mensagem_apresentacao: rascunho.mensagem_apresentacao,
            instrucoes_adicionais: rascunho.instrucoes_adicionais,
            atendimento_24h: rascunho.atendimento_24h,
            quebra_objecoes: rascunho.quebra_objecoes,
            confirmacao_agenda: rascunho.confirmacao_agenda,
            followup_inteligente: rascunho.followup_inteligente,
            transcreve_audio: rascunho.transcreve_audio,
            oferece_horarios: rascunho.oferece_horarios,
            desconto_maximo_percentual: rascunho.desconto_maximo_percentual,
            valor_minimo_entrada: rascunho.valor_minimo_entrada,
            maximo_parcelas: rascunho.maximo_parcelas,
            prompt_sistema: rascunho.prompt_sistema,
            modelo_ia: rascunho.modelo_ia,
          })
          .eq('id', rascunho.id),
      'Configurações salvas',
      () => {
        setEdicoes(null);
        consulta.recarregar();
      },
    );
  }

  return (
    <>
      <Cabecalho
        titulo="Configurar IA"
        texto="Como sua assistente conversa, negocia e acompanha cada cliente."
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

      {guia === 'conhecimento' && <ConhecimentoIA />}
      {guia === 'followup' && <FollowUpIA />}

      {guia === 'assistente' && (
      <Conteudo
        consulta={consulta}
        linhas={3}
        vazio={
          <div className="panel">
            <EstadoVazio
              icone={Bot}
              titulo="Configuração não encontrada"
              texto="A configuração padrão é criada junto com a clínica."
            />
          </div>
        }
      >
        {() =>
          !rascunho ? null : (
            <>
              <div className="settings-grid grade-ia">
                <article className="panel settings-card">
                  <h2>Assistente virtual</h2>
                  <label>
                    Nome da assistente
                    <input
                      value={rascunho.nome_assistente}
                      onChange={(e) => editar('nome_assistente', e.target.value)}
                      disabled={!ehGestor}
                    />
                  </label>
                  <label>
                    Tom de voz
                    <select
                      value={rascunho.tom_voz}
                      onChange={(e) => editar('tom_voz', e.target.value as never)}
                      disabled={!ehGestor}
                    >
                      <option value="acolhedor">Acolhedor e profissional</option>
                      <option value="direto">Direto e objetivo</option>
                      <option value="descontraido">Leve e descontraído</option>
                      <option value="formal">Formal</option>
                    </select>
                  </label>
                  <label>
                    Mensagem de apresentação
                    <textarea
                      value={rascunho.mensagem_apresentacao ?? ''}
                      onChange={(e) => editar('mensagem_apresentacao', e.target.value)}
                      disabled={!ehGestor}
                      rows={4}
                    />
                  </label>
                  <label>
                    Instruções adicionais
                    <textarea
                      value={rascunho.instrucoes_adicionais ?? ''}
                      onChange={(e) => editar('instrucoes_adicionais', e.target.value)}
                      placeholder="O que ela nunca deve prometer, como falar de preços..."
                      disabled={!ehGestor}
                      rows={3}
                    />
                  </label>
                </article>

                <article className="panel settings-card">
                  <h2>Automações</h2>
                  {AUTOMACOES.map(([chave, titulo, descricao]) => (
                    <div className="setting-row" key={chave}>
                      <div>
                        <b>{titulo}</b>
                        <span>{descricao}</span>
                      </div>
                      <button
                        type="button"
                        className={`switch ${rascunho[chave as ChaveAutomacao] ? 'on' : ''}`}
                        disabled={!ehGestor}
                        aria-label={titulo}
                        onClick={() =>
                          editar(chave as ChaveAutomacao, !rascunho[chave as ChaveAutomacao])
                        }
                      >
                        <i />
                      </button>
                    </div>
                  ))}
                </article>

                <article className="panel settings-card full">
                  <div className="cartao-titulo">
                    <h2>Instrução da assistente</h2>
                    <button
                      type="button"
                      className="secondary-btn"
                      disabled={!ehGestor || ocupado}
                      onClick={() => editar('prompt_sistema', PROMPT_PADRAO)}
                    >
                      <RotateCcw size={14} /> Restaurar padrão
                    </button>
                  </div>

                  <p className="cartao-nota">
                    Este é o texto que orienta a assistente em cada resposta. Os marcadores abaixo
                    são trocados por dados do sistema na hora do atendimento — mantenha-os no texto
                    para que preço, agenda e limites nunca fiquem desatualizados.
                  </p>

                  <div className="marcadores">
                    {MARCADORES.map(([marcador, oQueE]) => (
                      <button
                        type="button"
                        key={marcador}
                        title={`Inserir ${marcador}`}
                        onClick={() =>
                          editar(
                            'prompt_sistema',
                            `${rascunho.prompt_sistema ?? ''}${marcador}`,
                          )
                        }
                        disabled={!ehGestor}
                      >
                        <code>{marcador}</code>
                        <span>{oQueE}</span>
                      </button>
                    ))}
                  </div>

                  <label>
                    Texto da instrução
                    <textarea
                      className="prompt"
                      value={rascunho.prompt_sistema ?? ''}
                      onChange={(e) => editar('prompt_sistema', e.target.value)}
                      disabled={!ehGestor}
                      rows={18}
                      spellCheck
                    />
                  </label>

                  <label>
                    Modelo da OpenAI
                    <select
                      value={rascunho.modelo_ia}
                      onChange={(e) => editar('modelo_ia', e.target.value)}
                      disabled={!ehGestor}
                    >
                      {MODELOS.map(([valor, rotulo]) => (
                        <option key={valor} value={valor}>
                          {rotulo}
                        </option>
                      ))}
                    </select>
                  </label>
                </article>

                <article className="panel settings-card full">
                  <h2>Limites de negociação</h2>
                  <div className="limit-grid">
                    <label>
                      Desconto máximo permitido
                      <div className="input-suffix">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={rascunho.desconto_maximo_percentual ?? 0}
                          onChange={(e) =>
                            editar('desconto_maximo_percentual', Number(e.target.value))
                          }
                          disabled={!ehGestor}
                        />
                        <span>%</span>
                      </div>
                    </label>
                    <label>
                      Valor mínimo de entrada
                      <div className="input-suffix">
                        <span>R$</span>
                        <input
                          type="number"
                          min={0}
                          value={rascunho.valor_minimo_entrada ?? 0}
                          onChange={(e) => editar('valor_minimo_entrada', Number(e.target.value))}
                          disabled={!ehGestor}
                        />
                      </div>
                    </label>
                    <label>
                      Máximo de parcelas
                      <select
                        value={String(rascunho.maximo_parcelas ?? 6)}
                        onChange={(e) => editar('maximo_parcelas', Number(e.target.value))}
                        disabled={!ehGestor}
                      >
                        {[1, 3, 6, 10, 12].map((n) => (
                          <option key={n} value={n}>
                            {n}x
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </article>
              </div>

              <div className="save-bar">
                <span>
                  {!ehGestor
                    ? 'Somente gestores podem alterar a assistente.'
                    : alterado
                      ? 'Há alterações não salvas.'
                      : 'Tudo salvo.'}
                </span>
                <button
                  className="primary-btn"
                  onClick={salvar}
                  disabled={!ehGestor || !alterado || ocupado}
                >
                  {ocupado && <Loader2 size={15} className="girando" />}
                  Salvar configurações
                </button>
              </div>
            </>
          )
        }
      </Conteudo>
      )}
    </>
  );
}
