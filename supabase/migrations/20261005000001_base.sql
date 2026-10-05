-- Esquema base do CliniIA: tipos, tabelas e índices.
--
-- Reconstruído em 2026-10-05 a partir de lib/supabase/tipos-banco.ts e do uso
-- no código, depois que o projeto Supabase original foi perdido sem migrations.

create extension if not exists pgcrypto with schema extensions;

/* ------------------------------------------------------------------ tipos */

create type public.acao_auditoria as enum ('insercao', 'atualizacao', 'exclusao');
create type public.autor_mensagem as enum ('paciente', 'ia', 'humano', 'sistema');
create type public.canal_atendimento as enum ('whatsapp', 'instagram', 'facebook', 'site', 'telefone', 'presencial');
create type public.direcao_mensagem as enum ('entrada', 'saida');
create type public.forma_pagamento as enum ('dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'boleto', 'transferencia', 'link_pagamento');
create type public.origem_contato as enum ('instagram', 'whatsapp', 'facebook', 'google', 'site', 'indicacao', 'reativacao', 'presencial', 'telefone', 'outro');
create type public.papel_usuario as enum ('proprietario', 'administrador', 'gerente', 'atendente', 'profissional');
create type public.sexo_biologico as enum ('feminino', 'masculino', 'outro', 'nao_informado');
create type public.situacao_paciente as enum ('lead', 'paciente', 'inativo', 'arquivado');
create type public.status_agendamento as enum ('aguardando_confirmacao', 'confirmado', 'remarcado', 'em_atendimento', 'concluido', 'compareceu', 'faltou', 'cancelado');
create type public.status_campanha as enum ('rascunho', 'agendada', 'em_andamento', 'pausada', 'concluida', 'cancelada');
create type public.status_conversa as enum ('aberta', 'pendente', 'resolvida', 'arquivada');
create type public.status_envio as enum ('pendente', 'enviado', 'entregue', 'lido', 'respondido', 'falhou', 'cancelado');
create type public.status_followup as enum ('pendente', 'enviado', 'respondido', 'cancelado', 'falhou');
create type public.status_lembrete as enum ('pendente', 'enviado', 'falhou', 'cancelado');
create type public.status_mensagem as enum ('pendente', 'enviada', 'entregue', 'lida', 'falhou');
create type public.status_numero_whatsapp as enum ('desconectado', 'conectando', 'conectado', 'aquecendo', 'pausado', 'banido');
create type public.status_oportunidade as enum ('aberta', 'ganha', 'perdida');
create type public.status_pagamento as enum ('pendente', 'pago', 'parcial', 'estornado', 'cancelado');
create type public.tema_painel as enum ('claro', 'escuro', 'sistema');
create type public.tipo_conteudo_mensagem as enum ('texto', 'imagem', 'audio', 'video', 'documento', 'localizacao', 'contato', 'figurinha');
create type public.tipo_etapa_funil as enum ('aberta', 'ganha', 'perdida');
create type public.tipo_lembrete as enum ('confirmacao', 'lembrete_vespera', 'lembrete_hora', 'pos_atendimento', 'aniversario', 'retorno_procedimento');
create type public.tom_voz_ia as enum ('acolhedor', 'direto', 'descontraido', 'formal');

/* ------------------------------------------------------- utilitário: data */

create or replace function public.tocar_atualizado_em()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

/* ---------------------------------------------------- pessoas e empresas */

create table public.perfis (
  id uuid primary key references auth.users (id) on delete cascade,
  nome_completo text not null default '',
  email text,
  telefone text,
  avatar_url text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table public.clinicas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  nome_exibicao text,
  razao_social text,
  cnpj text,
  email text,
  telefone text,
  site text,
  logo_url text,
  favicon_url text,
  cor_primaria text,
  cor_secundaria text,
  cor_destaque text,
  dominio_proprio text unique,
  tema_padrao public.tema_painel not null default 'sistema',
  fuso_horario text not null default 'America/Sao_Paulo',
  plano text not null default 'essencial',
  ativa boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table public.unidades (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas (id) on delete cascade,
  nome text not null,
  telefone text,
  email text,
  cep text,
  logradouro text,
  numero text,
  complemento text,
  bairro text,
  cidade text,
  uf text,
  ativa boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index on public.unidades (clinica_id);

create table public.membros_clinica (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas (id) on delete cascade,
  perfil_id uuid not null references public.perfis (id) on delete cascade,
  unidade_id uuid references public.unidades (id) on delete set null,
  papel public.papel_usuario not null default 'atendente',
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (clinica_id, perfil_id)
);
create index on public.membros_clinica (perfil_id);

create table public.horarios_funcionamento (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas (id) on delete cascade,
  unidade_id uuid not null references public.unidades (id) on delete cascade,
  dia_semana smallint not null check (dia_semana between 0 and 6),
  abre time not null,
  fecha time not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (fecha > abre)
);
create index on public.horarios_funcionamento (clinica_id);

/* -------------------------------------------------------------- catálogo */

create table public.categorias_procedimento (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas (id) on delete cascade,
  nome text not null,
  ordem integer not null default 0,
  ativa boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index on public.categorias_procedimento (clinica_id);

create table public.procedimentos (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas (id) on delete cascade,
  categoria_id uuid references public.categorias_procedimento (id) on delete set null,
  nome text not null,
  descricao text,
  duracao_minutos integer not null default 60 check (duracao_minutos > 0),
  valor numeric(12, 2) not null default 0,
  valor_promocional numeric(12, 2),
  intervalo_retorno_dias integer,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index on public.procedimentos (clinica_id);

create table public.profissionais (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas (id) on delete cascade,
  unidade_id uuid references public.unidades (id) on delete set null,
  membro_id uuid references public.membros_clinica (id) on delete set null,
  nome text not null,
  especialidade text,
  registro_conselho text,
  cor_agenda text not null default '#8b5cf6',
  aceita_agendamento boolean not null default true,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index on public.profissionais (clinica_id);

/* --------------------------------------------------------------- contatos */

create table public.pacientes (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas (id) on delete cascade,
  unidade_id uuid references public.unidades (id) on delete set null,
  responsavel_id uuid references public.membros_clinica (id) on delete set null,
  nome_completo text not null,
  telefone text not null,
  email text,
  cpf text,
  data_nascimento date,
  sexo public.sexo_biologico not null default 'nao_informado',
  endereco jsonb not null default '{}'::jsonb,
  etiquetas text[] not null default '{}',
  interesse_principal text,
  observacoes text,
  origem public.origem_contato not null default 'whatsapp',
  situacao public.situacao_paciente not null default 'lead',
  aceita_marketing boolean not null default true,
  foto_url text,
  foto_origem text,
  primeiro_contato_em timestamptz not null default now(),
  ultimo_contato_em timestamptz,
  ultima_visita_em timestamptz,
  excluido_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index on public.pacientes (clinica_id, telefone);
create index on public.pacientes (clinica_id, criado_em desc);

create table public.listas_leads (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas (id) on delete cascade,
  nome text not null,
  descricao text,
  criado_por uuid references public.membros_clinica (id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (clinica_id, nome)
);

create table public.listas_leads_itens (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas (id) on delete cascade,
  lista_id uuid not null references public.listas_leads (id) on delete cascade,
  paciente_id uuid not null references public.pacientes (id) on delete cascade,
  criado_em timestamptz not null default now(),
  unique (lista_id, paciente_id)
);
create index on public.listas_leads_itens (paciente_id);

/* ------------------------------------------------------------------- CRM */

create table public.etapas_funil (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas (id) on delete cascade,
  nome text not null,
  ordem integer not null default 0,
  cor text not null default '#64748b',
  tipo public.tipo_etapa_funil not null default 'aberta',
  ativa boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index on public.etapas_funil (clinica_id, ordem);

create table public.oportunidades (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas (id) on delete cascade,
  unidade_id uuid references public.unidades (id) on delete set null,
  paciente_id uuid not null references public.pacientes (id) on delete cascade,
  etapa_id uuid not null references public.etapas_funil (id),
  procedimento_id uuid references public.procedimentos (id) on delete set null,
  responsavel_id uuid references public.membros_clinica (id) on delete set null,
  titulo text,
  valor_estimado numeric(12, 2),
  origem public.origem_contato not null default 'whatsapp',
  status public.status_oportunidade not null default 'aberta',
  motivo_perda text,
  previsao_fechamento date,
  entrou_na_etapa_em timestamptz not null default now(),
  fechada_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index on public.oportunidades (clinica_id, etapa_id);
create index on public.oportunidades (paciente_id);

create table public.movimentacoes_oportunidade (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas (id) on delete cascade,
  oportunidade_id uuid not null references public.oportunidades (id) on delete cascade,
  etapa_origem_id uuid references public.etapas_funil (id) on delete set null,
  etapa_destino_id uuid not null references public.etapas_funil (id) on delete cascade,
  movido_por uuid references public.membros_clinica (id) on delete set null,
  movido_pela_ia boolean not null default false,
  observacao text,
  criado_em timestamptz not null default now()
);
create index on public.movimentacoes_oportunidade (oportunidade_id);

/* ---------------------------------------------------------------- agenda */

create table public.agendamentos (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas (id) on delete cascade,
  unidade_id uuid not null references public.unidades (id),
  paciente_id uuid not null references public.pacientes (id) on delete cascade,
  procedimento_id uuid references public.procedimentos (id) on delete set null,
  profissional_id uuid references public.profissionais (id) on delete set null,
  oportunidade_id uuid references public.oportunidades (id) on delete set null,
  criado_por uuid references public.membros_clinica (id) on delete set null,
  inicio timestamptz not null,
  fim timestamptz not null,
  status public.status_agendamento not null default 'aguardando_confirmacao',
  origem public.origem_contato not null default 'whatsapp',
  agendado_pela_ia boolean not null default false,
  valor numeric(12, 2),
  observacoes text,
  confirmado_em timestamptz,
  cancelado_em timestamptz,
  motivo_cancelamento text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (fim > inicio)
);
create index on public.agendamentos (clinica_id, inicio);
create index on public.agendamentos (paciente_id);

create table public.bloqueios_agenda (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas (id) on delete cascade,
  unidade_id uuid references public.unidades (id) on delete cascade,
  profissional_id uuid references public.profissionais (id) on delete cascade,
  inicio timestamptz not null,
  fim timestamptz not null,
  motivo text,
  criado_por uuid references public.membros_clinica (id) on delete set null,
  criado_em timestamptz not null default now(),
  check (fim > inicio)
);
create index on public.bloqueios_agenda (clinica_id, inicio);

create table public.lembretes_agendamento (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas (id) on delete cascade,
  agendamento_id uuid not null references public.agendamentos (id) on delete cascade,
  tipo public.tipo_lembrete not null default 'lembrete_vespera',
  canal public.canal_atendimento not null default 'whatsapp',
  enviar_em timestamptz not null,
  mensagem text,
  status public.status_lembrete not null default 'pendente',
  enviado_em timestamptz,
  erro text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (agendamento_id, tipo)
);
create index on public.lembretes_agendamento (status, enviar_em);

create table public.pagamentos (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas (id) on delete cascade,
  paciente_id uuid not null references public.pacientes (id) on delete cascade,
  agendamento_id uuid references public.agendamentos (id) on delete set null,
  registrado_por uuid references public.membros_clinica (id) on delete set null,
  valor numeric(12, 2) not null,
  desconto numeric(12, 2) not null default 0,
  forma public.forma_pagamento not null default 'pix',
  parcelas integer not null default 1 check (parcelas >= 1),
  status public.status_pagamento not null default 'pago',
  pago_em timestamptz default now(),
  observacoes text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index on public.pagamentos (clinica_id, pago_em);

/* -------------------------------------------------------------- WhatsApp */

create table public.numeros_whatsapp (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas (id) on delete cascade,
  unidade_id uuid references public.unidades (id) on delete set null,
  apelido text not null,
  numero text,
  provedor text not null default 'uazapi',
  instancia_externa text unique,
  status public.status_numero_whatsapp not null default 'desconectado',
  ativo boolean not null default true,
  -- 0 marca o chip principal: fica fora da rotação de campanhas.
  peso_rotacao integer not null default 1 check (peso_rotacao >= 0),
  limite_diario integer not null default 300,
  enviados_hoje integer not null default 0,
  contador_zerado_em timestamptz not null default now(),
  aquecimento_iniciado_em timestamptz,
  ultima_atividade_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index on public.numeros_whatsapp (clinica_id);

create table public.conversas (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas (id) on delete cascade,
  unidade_id uuid references public.unidades (id) on delete set null,
  paciente_id uuid not null references public.pacientes (id) on delete cascade,
  numero_whatsapp_id uuid references public.numeros_whatsapp (id) on delete set null,
  canal public.canal_atendimento not null default 'whatsapp',
  identificador_externo text,
  status public.status_conversa not null default 'aberta',
  ia_ativa boolean not null default true,
  assumida_por uuid references public.membros_clinica (id) on delete set null,
  assumida_em timestamptz,
  nao_lidas integer not null default 0,
  ultima_mensagem_em timestamptz,
  ultima_mensagem_previa text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index on public.conversas (clinica_id, ultima_mensagem_em desc);
create index on public.conversas (paciente_id);

create table public.mensagens (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas (id) on delete cascade,
  conversa_id uuid not null references public.conversas (id) on delete cascade,
  numero_whatsapp_id uuid references public.numeros_whatsapp (id) on delete set null,
  enviada_por uuid references public.membros_clinica (id) on delete set null,
  autor public.autor_mensagem not null,
  direcao public.direcao_mensagem not null,
  tipo_conteudo public.tipo_conteudo_mensagem not null default 'texto',
  conteudo text,
  midia_url text,
  transcricao text,
  identificador_externo text,
  status public.status_mensagem not null default 'enviada',
  erro text,
  metadados jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now(),
  check (conteudo is not null or midia_url is not null)
);
create index on public.mensagens (conversa_id, criado_em);
-- O eco do webhook de uma mensagem enviada por nós cai aqui em vez de duplicar.
create unique index mensagens_identificador_externo_unico
  on public.mensagens (clinica_id, identificador_externo)
  where identificador_externo is not null;

/* ---------------------------------------------------------------- campanhas */

create table public.campanhas (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas (id) on delete cascade,
  unidade_id uuid references public.unidades (id) on delete set null,
  criado_por uuid references public.membros_clinica (id) on delete set null,
  nome text not null,
  descricao text,
  objetivo text,
  canal public.canal_atendimento not null default 'whatsapp',
  modelo_mensagem text not null default '',
  -- Lista escolhida, anexo e modo da IA: { lista_id, anexo, ia: { modo, instrucoes } }.
  filtro_publico jsonb not null default '{}'::jsonb,
  envios_por_hora integer not null default 240 check (envios_por_hora > 0),
  investimento numeric(12, 2) not null default 0,
  status public.status_campanha not null default 'rascunho',
  pasta_externa text,
  inicia_em timestamptz,
  encerra_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index on public.campanhas (clinica_id);

create table public.campanha_numeros (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas (id) on delete cascade,
  campanha_id uuid not null references public.campanhas (id) on delete cascade,
  numero_whatsapp_id uuid not null references public.numeros_whatsapp (id) on delete cascade,
  criado_em timestamptz not null default now(),
  unique (campanha_id, numero_whatsapp_id)
);

create table public.envios_campanha (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas (id) on delete cascade,
  campanha_id uuid not null references public.campanhas (id) on delete cascade,
  paciente_id uuid not null references public.pacientes (id) on delete cascade,
  numero_whatsapp_id uuid references public.numeros_whatsapp (id) on delete set null,
  conversa_id uuid references public.conversas (id) on delete set null,
  agendamento_id uuid references public.agendamentos (id) on delete set null,
  status public.status_envio not null default 'pendente',
  mensagem_enviada text,
  agendado_para timestamptz,
  enviado_em timestamptz,
  entregue_em timestamptz,
  respondido_em timestamptz,
  erro text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index on public.envios_campanha (campanha_id, status);
create index on public.envios_campanha (paciente_id, criado_em desc);

/* ------------------------------------------------------------ follow-up */

create table public.reguas_followup (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas (id) on delete cascade,
  nome text not null,
  descricao text,
  ativa boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table public.etapas_regua_followup (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas (id) on delete cascade,
  regua_id uuid not null references public.reguas_followup (id) on delete cascade,
  ordem integer not null,
  atraso_horas integer not null check (atraso_horas > 0),
  horario_preferencial time,
  modelo_mensagem text not null default '',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (regua_id, ordem)
);

create table public.followups (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas (id) on delete cascade,
  paciente_id uuid not null references public.pacientes (id) on delete cascade,
  conversa_id uuid references public.conversas (id) on delete cascade,
  oportunidade_id uuid references public.oportunidades (id) on delete set null,
  regua_id uuid references public.reguas_followup (id) on delete set null,
  etapa_regua_id uuid references public.etapas_regua_followup (id) on delete set null,
  agendado_para timestamptz not null,
  status public.status_followup not null default 'pendente',
  mensagem_enviada text,
  enviado_em timestamptz,
  respondido_em timestamptz,
  erro text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index on public.followups (status, agendado_para);
create index on public.followups (conversa_id);

/* ---------------------------------------------------------------- IA */

create table public.configuracoes_ia (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas (id) on delete cascade,
  unidade_id uuid references public.unidades (id) on delete cascade,
  nome_assistente text not null default 'Sofia',
  tom_voz public.tom_voz_ia not null default 'acolhedor',
  mensagem_apresentacao text not null default 'Oi! Aqui é a Sofia, assistente virtual da clínica. Como posso te ajudar?',
  instrucoes_adicionais text,
  prompt_sistema text,
  modelo_ia text not null default 'gpt-4o-mini',
  atendimento_24h boolean not null default true,
  quebra_objecoes boolean not null default true,
  confirmacao_agenda boolean not null default true,
  followup_inteligente boolean not null default true,
  transcreve_audio boolean not null default true,
  desconto_maximo_percentual numeric(5, 2) not null default 10,
  valor_minimo_entrada numeric(12, 2) not null default 0,
  maximo_parcelas integer not null default 10,
  escalar_para_humano_apos integer not null default 3,
  silencio_inicio time not null default '21:00',
  silencio_fim time not null default '08:00',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index configuracoes_ia_clinica_unica
  on public.configuracoes_ia (clinica_id) where unidade_id is null;

create table public.base_conhecimento_ia (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas (id) on delete cascade,
  categoria text,
  pergunta text not null,
  resposta text not null,
  etiquetas text[] not null default '{}',
  ativa boolean not null default true,
  criado_por uuid references public.membros_clinica (id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index on public.base_conhecimento_ia (clinica_id);

/* -------------------------------------------------------------- auditoria */

create table public.eventos_auditoria (
  id bigint generated always as identity primary key,
  clinica_id uuid references public.clinicas (id) on delete cascade,
  perfil_id uuid references public.perfis (id) on delete set null,
  tabela text not null,
  registro_id uuid,
  acao public.acao_auditoria not null,
  dados_antes jsonb,
  dados_depois jsonb,
  criado_em timestamptz not null default now()
);
create index on public.eventos_auditoria (clinica_id, criado_em desc);

/* ------------------------------------------------- atualizado_em em tudo */

do $$
declare
  t text;
begin
  for t in
    select c.table_name
    from information_schema.columns c
    where c.table_schema = 'public' and c.column_name = 'atualizado_em'
  loop
    execute format(
      'create trigger tocar_atualizado_em before update on public.%I
         for each row execute function public.tocar_atualizado_em()', t);
  end loop;
end;
$$;
