-- Integração WhatsApp (UazApi), IA e tarefas de fundo.
--
-- O projeto não usa service_role. O que roda sem usuário logado (webhook,
-- agendador) chama as funções wa_*, SECURITY DEFINER, que exigem o segredo da
-- integração (INTEGRACAO_SEGREDO em .dev.vars). O banco guarda só o sha256
-- dele. Credenciais e segredo ficam em tabelas com RLS e nenhuma policy:
-- invisíveis à API.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

/* ------------------------------------------------- segredo e credenciais */

create table public.segredos_integracao (
  id smallint primary key default 1 check (id = 1),
  hash text not null,
  atualizado_em timestamptz not null default now()
);
alter table public.segredos_integracao enable row level security;

create table public.credenciais_whatsapp (
  numero_id uuid primary key references public.numeros_whatsapp (id) on delete cascade,
  instancia text not null unique,
  token text not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
alter table public.credenciais_whatsapp enable row level security;

create trigger tocar_atualizado_em before update on public.credenciais_whatsapp
  for each row execute function public.tocar_atualizado_em();

revoke all on public.segredos_integracao, public.credenciais_whatsapp from anon, authenticated;

create or replace function public.wa_validar(p_segredo text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_segredo is null or not exists (
    select 1 from public.segredos_integracao
    where hash = encode(extensions.digest(p_segredo, 'sha256'), 'hex')
  ) then
    raise exception 'segredo da integração inválido' using errcode = '28000';
  end if;
end;
$$;

-- Só pelo SQL editor (dono do banco): select public.wa_definir_segredo('...');
create or replace function public.wa_definir_segredo(p_segredo text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.segredos_integracao (id, hash)
  values (1, encode(extensions.digest(p_segredo, 'sha256'), 'hex'))
  on conflict (id) do update set hash = excluded.hash, atualizado_em = now();
$$;

/* ------------------------------------------------------- credenciais */

create or replace function public.wa_guardar_credencial(
  p_segredo text, p_numero_id uuid, p_instancia text, p_token text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.wa_validar(p_segredo);
  insert into public.credenciais_whatsapp (numero_id, instancia, token)
  values (p_numero_id, p_instancia, p_token)
  on conflict (numero_id) do update set instancia = excluded.instancia, token = excluded.token;
  update public.numeros_whatsapp set instancia_externa = p_instancia where id = p_numero_id;
end;
$$;

create or replace function public.wa_ler_credencial(p_segredo text, p_numero_id uuid)
returns table (instancia text, token text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.wa_validar(p_segredo);
  return query
    select c.instancia, c.token from public.credenciais_whatsapp c where c.numero_id = p_numero_id;
end;
$$;

create or replace function public.wa_credencial_por_instancia(p_segredo text, p_instancia text)
returns table (numero_id uuid, token text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.wa_validar(p_segredo);
  return query
    select c.numero_id, c.token from public.credenciais_whatsapp c where c.instancia = p_instancia;
end;
$$;

create or replace function public.wa_atualizar_conexao(
  p_segredo text,
  p_instancia text,
  p_status public.status_numero_whatsapp,
  p_numero text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.wa_validar(p_segredo);
  update public.numeros_whatsapp n
  set status = p_status,
      numero = coalesce(nullif(regexp_replace(split_part(coalesce(p_numero, ''), '@', 1), '\D', '', 'g'), ''), n.numero),
      aquecimento_iniciado_em = case
        when p_status = 'conectado' then coalesce(n.aquecimento_iniciado_em, now())
        else n.aquecimento_iniciado_em
      end,
      ultima_atividade_em = now()
  from public.credenciais_whatsapp c
  where c.instancia = p_instancia and n.id = c.numero_id;
end;
$$;

/* ------------------------------------------------------ mensagens */

/**
 * Grava uma mensagem que chegou (ou saiu) por um chip.
 *
 * Encontra ou cria o contato e a conversa. Evento reentregue pela UazApi, ou o
 * eco de uma mensagem que nós mesmos enviamos, cai no índice de unicidade do
 * identificador externo e volta como "duplicada".
 */
create or replace function public.wa_registrar_mensagem(
  p_segredo text,
  p_instancia text,
  p_telefone text,
  p_nome text default null,
  p_conteudo text default null,
  p_de_mim boolean default false,
  p_id_externo text default null,
  p_tipo public.tipo_conteudo_mensagem default 'texto',
  p_midia_url text default null,
  p_enviada_pela_api boolean default false,
  p_foto text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_numero public.numeros_whatsapp;
  v_telefone text := public.telefone_normalizado(p_telefone);
  v_nome text := nullif(trim(p_nome), '');
  v_paciente public.pacientes;
  v_conversa uuid;
  v_mensagem uuid;
  v_conteudo text := nullif(trim(p_conteudo), '');
begin
  perform public.wa_validar(p_segredo);

  select n.* into v_numero
  from public.credenciais_whatsapp c
  join public.numeros_whatsapp n on n.id = c.numero_id
  where c.instancia = p_instancia;
  if v_numero.id is null then
    raise exception 'instância não pertence a nenhuma clínica';
  end if;
  if v_telefone = '' then
    raise exception 'telefone vazio';
  end if;

  if p_id_externo is not null then
    select m.id, m.conversa_id into v_mensagem, v_conversa
    from public.mensagens m
    where m.clinica_id = v_numero.clinica_id and m.identificador_externo = p_id_externo;
    if v_mensagem is not null then
      return jsonb_build_object(
        'mensagem_id', v_mensagem,
        'conversa_id', v_conversa,
        'paciente_id', (select paciente_id from public.conversas where id = v_conversa),
        'foto_pendente', false,
        'duplicada', true
      );
    end if;
  end if;

  select p.* into v_paciente
  from public.pacientes p
  where p.clinica_id = v_numero.clinica_id
    and p.excluido_em is null
    and p.telefone = any (public.grafias_telefone(v_telefone))
  order by p.criado_em
  limit 1;

  if v_paciente.id is null then
    insert into public.pacientes (clinica_id, unidade_id, nome_completo, telefone, origem)
    values (v_numero.clinica_id, v_numero.unidade_id, coalesce(v_nome, v_telefone), v_telefone, 'whatsapp')
    returning * into v_paciente;
  elsif v_nome is not null and v_paciente.nome_completo ~ '^[\d\s()+-]*$' then
    -- Contato que entrou só com o número ganha o nome do WhatsApp.
    update public.pacientes set nome_completo = v_nome where id = v_paciente.id;
  end if;

  select cv.id into v_conversa
  from public.conversas cv
  where cv.clinica_id = v_numero.clinica_id
    and cv.paciente_id = v_paciente.id
    and cv.canal = 'whatsapp'
  order by cv.ultima_mensagem_em desc nulls last, cv.criado_em desc
  limit 1;

  if v_conversa is null then
    insert into public.conversas (clinica_id, unidade_id, paciente_id, numero_whatsapp_id, canal)
    values (
      v_numero.clinica_id,
      coalesce(v_numero.unidade_id, v_paciente.unidade_id),
      v_paciente.id,
      v_numero.id,
      'whatsapp'
    )
    returning id into v_conversa;
  end if;

  if v_conteudo is null and p_midia_url is null then
    v_conteudo := 'Mensagem sem texto';
  end if;

  insert into public.mensagens (
    clinica_id, conversa_id, numero_whatsapp_id, autor, direcao, tipo_conteudo,
    conteudo, midia_url, identificador_externo, status
  ) values (
    v_numero.clinica_id,
    v_conversa,
    v_numero.id,
    case
      when not p_de_mim then 'paciente'
      when p_enviada_pela_api then 'sistema'
      else 'humano'
    end::public.autor_mensagem,
    case when p_de_mim then 'saida' else 'entrada' end::public.direcao_mensagem,
    coalesce(p_tipo, 'texto'),
    v_conteudo,
    p_midia_url,
    p_id_externo,
    case when p_de_mim then 'enviada' else 'entregue' end::public.status_mensagem
  )
  on conflict (clinica_id, identificador_externo) where identificador_externo is not null
  do nothing
  returning id into v_mensagem;

  update public.numeros_whatsapp
  set ultima_atividade_em = now(),
      status = case when status in ('desconectado', 'conectando') then 'conectado' else status end
  where id = v_numero.id;

  return jsonb_build_object(
    'mensagem_id', v_mensagem,
    'conversa_id', v_conversa,
    'paciente_id', v_paciente.id,
    'foto_pendente', p_foto is not null and v_paciente.foto_origem is distinct from p_foto,
    'duplicada', v_mensagem is null
  );
end;
$$;

create or replace function public.wa_guardar_foto(
  p_segredo text, p_paciente_id uuid, p_foto text, p_origem text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.wa_validar(p_segredo);
  update public.pacientes set foto_url = p_foto, foto_origem = p_origem where id = p_paciente_id;
end;
$$;

/* ------------------------------------------------------------- IA */

create or replace function public.wa_contexto_assistente(p_segredo text, p_conversa_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_conversa public.conversas;
  v_clinica public.clinicas;
  v_paciente public.pacientes;
  v_config jsonb;
begin
  perform public.wa_validar(p_segredo);

  select * into v_conversa from public.conversas where id = p_conversa_id;
  if v_conversa.id is null then
    raise exception 'conversa não encontrada';
  end if;
  select * into v_clinica from public.clinicas where id = v_conversa.clinica_id;
  select * into v_paciente from public.pacientes where id = v_conversa.paciente_id;

  select to_jsonb(c) - 'id' - 'clinica_id' - 'unidade_id' - 'criado_em' - 'atualizado_em'
  into v_config
  from public.configuracoes_ia c
  where c.clinica_id = v_conversa.clinica_id
  order by (c.unidade_id is not distinct from v_conversa.unidade_id) desc, (c.unidade_id is null) desc
  limit 1;

  return jsonb_build_object(
    'ia_ativa', v_conversa.ia_ativa,
    'clinica', coalesce(nullif(trim(v_clinica.nome_exibicao), ''), v_clinica.nome),
    'fuso', v_clinica.fuso_horario,
    'config', v_config,
    'paciente', case when v_paciente.id is null then null else jsonb_build_object(
      'nome', v_paciente.nome_completo,
      'telefone', v_paciente.telefone,
      'interesse', v_paciente.interesse_principal,
      'situacao', v_paciente.situacao
    ) end,
    'procedimentos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'nome', p.nome,
        'descricao', p.descricao,
        'duracao_minutos', p.duracao_minutos,
        'valor', coalesce(p.valor_promocional, p.valor)
      ) order by p.nome)
      from public.procedimentos p
      where p.clinica_id = v_conversa.clinica_id and p.ativo
    ), '[]'::jsonb),
    'conhecimento', coalesce((
      select jsonb_agg(jsonb_build_object('pergunta', k.pergunta, 'resposta', k.resposta))
      from public.base_conhecimento_ia k
      where k.clinica_id = v_conversa.clinica_id and k.ativa
    ), '[]'::jsonb),
    'mensagens', coalesce((
      select jsonb_agg(jsonb_build_object('autor', ult.autor, 'conteudo', ult.conteudo) order by ult.criado_em)
      from (
        select m.autor, coalesce(m.conteudo, m.transcricao) as conteudo, m.criado_em
        from public.mensagens m
        where m.conversa_id = p_conversa_id and coalesce(m.conteudo, m.transcricao) is not null
        order by m.criado_em desc
        limit 30
      ) ult
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.wa_registrar_resposta_ia(
  p_segredo text, p_conversa_id uuid, p_conteudo text, p_id_externo text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversa public.conversas;
  v_mensagem uuid;
begin
  perform public.wa_validar(p_segredo);
  select * into v_conversa from public.conversas where id = p_conversa_id;
  if v_conversa.id is null then
    raise exception 'conversa não encontrada';
  end if;

  insert into public.mensagens (
    clinica_id, conversa_id, numero_whatsapp_id, autor, direcao, conteudo, identificador_externo, status
  ) values (
    v_conversa.clinica_id, v_conversa.id, v_conversa.numero_whatsapp_id, 'ia', 'saida',
    p_conteudo, p_id_externo, 'enviada'
  )
  on conflict (clinica_id, identificador_externo) where identificador_externo is not null
  do nothing
  returning id into v_mensagem;

  return v_mensagem;
end;
$$;

/* -------------------------------------------- follow-ups e lembretes */

/**
 * Cria o que venceu. Idempotente: rodar duas vezes não duplica nada.
 *
 * Follow-up: conversa com a IA ativa em que a última palavra foi nossa. O
 * silêncio começa na primeira mensagem nossa depois da última do paciente; a
 * régua dispara cada etapa quando o atraso dela passa.
 *
 * Lembrete: véspera do agendamento, para clínicas com confirmação ligada.
 */
create or replace function public.wa_gerar_pendencias(p_segredo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_etapa public.etapas_regua_followup;
  v_followups integer := 0;
  v_lembretes integer := 0;
begin
  perform public.wa_validar(p_segredo);

  for r in
    select cv.id as conversa_id, cv.clinica_id, cv.paciente_id, p.nome_completo, rg.id as regua_id,
           (
             select min(m.criado_em) from public.mensagens m
             where m.conversa_id = cv.id
               and m.direcao = 'saida'
               and m.criado_em > coalesce((
                 select max(m2.criado_em) from public.mensagens m2
                 where m2.conversa_id = cv.id and m2.autor = 'paciente'
               ), '-infinity'::timestamptz)
           ) as silencio
    from public.conversas cv
    join public.pacientes p on p.id = cv.paciente_id and p.excluido_em is null
    join public.configuracoes_ia cfg
      on cfg.clinica_id = cv.clinica_id and cfg.unidade_id is null and cfg.followup_inteligente
    join lateral (
      select g.id from public.reguas_followup g
      where g.clinica_id = cv.clinica_id and g.ativa
      order by g.criado_em
      limit 1
    ) rg on true
    where cv.ia_ativa
      and cv.canal = 'whatsapp'
      and cv.status in ('aberta', 'pendente')
      and cv.ultima_mensagem_em > now() - interval '30 days'
      and not exists (
        select 1 from public.followups f where f.conversa_id = cv.id and f.status = 'pendente'
      )
  loop
    continue when r.silencio is null;

    select e.* into v_etapa
    from public.etapas_regua_followup e
    where e.regua_id = r.regua_id
      and not exists (
        select 1 from public.followups f
        where f.conversa_id = r.conversa_id and f.etapa_regua_id = e.id and f.criado_em >= r.silencio
      )
    order by e.ordem
    limit 1;

    continue when v_etapa.id is null;
    continue when r.silencio + make_interval(hours => v_etapa.atraso_horas) > now();
    continue when coalesce(trim(v_etapa.modelo_mensagem), '') = '';

    insert into public.followups (
      clinica_id, paciente_id, conversa_id, regua_id, etapa_regua_id, agendado_para, mensagem_enviada
    ) values (
      r.clinica_id, r.paciente_id, r.conversa_id, r.regua_id, v_etapa.id, now(),
      public.personalizar(v_etapa.modelo_mensagem, r.nome_completo)
    );
    v_followups := v_followups + 1;
  end loop;

  insert into public.lembretes_agendamento (clinica_id, agendamento_id, tipo, enviar_em, mensagem)
  select
    a.clinica_id,
    a.id,
    'lembrete_vespera',
    now(),
    public.personalizar(
      format(
        'Oi {{primeiro_nome}}! Passando para lembrar do seu horário amanhã, %s às %s, na %s. Posso confirmar sua presença? 💛',
        to_char(a.inicio at time zone c.fuso_horario, 'DD/MM'),
        to_char(a.inicio at time zone c.fuso_horario, 'HH24"h"MI'),
        coalesce(nullif(trim(c.nome_exibicao), ''), c.nome)
      ),
      p.nome_completo
    )
  from public.agendamentos a
  join public.clinicas c on c.id = a.clinica_id
  join public.pacientes p on p.id = a.paciente_id and p.excluido_em is null
  join public.configuracoes_ia cfg
    on cfg.clinica_id = a.clinica_id and cfg.unidade_id is null and cfg.confirmacao_agenda
  where a.status in ('aguardando_confirmacao', 'confirmado', 'remarcado')
    and (a.inicio at time zone c.fuso_horario)::date = (now() at time zone c.fuso_horario)::date + 1
    -- Manda a partir das 10h locais, nunca de madrugada.
    and extract(hour from now() at time zone c.fuso_horario) between 10 and 19
  on conflict (agendamento_id, tipo) do nothing;
  get diagnostics v_lembretes = row_count;

  return jsonb_build_object('followups_criados', v_followups, 'lembretes_criados', v_lembretes);
end;
$$;

/**
 * O que está pronto para sair, com o chip de cada item. Usa o chip da
 * conversa; se ele estiver fora do ar, devolve uma linha por chip conectado
 * da clínica e o servidor escolhe (o principal só como último recurso).
 */
create or replace function public.wa_fila_de_envio(p_segredo text, p_limite integer default 40)
returns table (tipo text, id uuid, instancia text, token text, telefone text, texto text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.wa_validar(p_segredo);
  return query
  with itens as (
    select * from (
      select 'followup'::text as tipo, f.id, f.clinica_id, f.conversa_id, f.paciente_id,
             f.mensagem_enviada as texto, f.agendado_para as quando
      from public.followups f
      where f.status = 'pendente' and f.agendado_para <= now()
      union all
      select 'lembrete', l.id, l.clinica_id,
             (select cv.id from public.conversas cv
              where cv.paciente_id = a.paciente_id and cv.canal = 'whatsapp'
              order by cv.ultima_mensagem_em desc nulls last limit 1),
             a.paciente_id, l.mensagem, l.enviar_em
      from public.lembretes_agendamento l
      join public.agendamentos a on a.id = l.agendamento_id
      where l.status = 'pendente' and l.enviar_em <= now() and l.canal = 'whatsapp'
    ) todos
    where coalesce(trim(todos.texto), '') <> ''
    order by todos.quando
    limit greatest(p_limite, 1)
  )
  select i.tipo, i.id, cr.instancia, cr.token, public.telefone_normalizado(p.telefone), i.texto
  from itens i
  join public.pacientes p on p.id = i.paciente_id
  left join public.conversas cv on cv.id = i.conversa_id
  left join public.numeros_whatsapp proprio
    on proprio.id = cv.numero_whatsapp_id and proprio.ativo and proprio.status = 'conectado'
  join public.numeros_whatsapp n
    on n.ativo and n.status = 'conectado'
   and (n.id = proprio.id or (proprio.id is null and n.clinica_id = i.clinica_id))
  join public.credenciais_whatsapp cr on cr.numero_id = n.id;
end;
$$;

create or replace function public.wa_concluir_envio(
  p_segredo text, p_tipo text, p_id uuid, p_ok boolean, p_erro text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clinica uuid;
  v_conversa uuid;
  v_texto text;
begin
  perform public.wa_validar(p_segredo);

  if p_tipo = 'followup' then
    update public.followups
    set status = case when p_ok then 'enviado' else 'falhou' end::public.status_followup,
        enviado_em = case when p_ok then now() end,
        erro = case when p_ok then null else p_erro end
    where id = p_id and status = 'pendente'
    returning clinica_id, conversa_id, mensagem_enviada into v_clinica, v_conversa, v_texto;
  elsif p_tipo = 'lembrete' then
    update public.lembretes_agendamento l
    set status = case when p_ok then 'enviado' else 'falhou' end::public.status_lembrete,
        enviado_em = case when p_ok then now() end,
        erro = case when p_ok then null else p_erro end
    where l.id = p_id and l.status = 'pendente'
    returning l.clinica_id, l.mensagem into v_clinica, v_texto;

    select cv.id into v_conversa
    from public.lembretes_agendamento l
    join public.agendamentos a on a.id = l.agendamento_id
    join public.conversas cv on cv.paciente_id = a.paciente_id and cv.canal = 'whatsapp'
    where l.id = p_id
    order by cv.ultima_mensagem_em desc nulls last
    limit 1;
  else
    raise exception 'tipo de envio desconhecido: %', p_tipo;
  end if;

  -- O que saiu aparece na conversa, como qualquer mensagem.
  if p_ok and v_conversa is not null and v_texto is not null then
    insert into public.mensagens (clinica_id, conversa_id, numero_whatsapp_id, autor, direcao, conteudo, status)
    select v_clinica, v_conversa, cv.numero_whatsapp_id, 'sistema', 'saida', v_texto, 'enviada'
    from public.conversas cv where cv.id = v_conversa;
  end if;
end;
$$;

/* --------------------------------------------------------- campanhas */

create or replace function public.wa_campanhas_em_disparo(p_segredo text)
returns table (campanha_id uuid, pasta_externa text, instancia text, token text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.wa_validar(p_segredo);
  return query
  select c.id, c.pasta_externa, cr.instancia, cr.token
  from public.campanhas c
  join lateral (
    select e.numero_whatsapp_id from public.envios_campanha e
    where e.campanha_id = c.id and e.numero_whatsapp_id is not null
    order by e.criado_em desc
    limit 1
  ) chip on true
  join public.credenciais_whatsapp cr on cr.numero_id = chip.numero_whatsapp_id
  where c.status in ('em_andamento', 'pausada')
    and c.pasta_externa is not null
    and exists (
      select 1 from public.envios_campanha e
      where e.campanha_id = c.id and e.status in ('pendente', 'enviado')
    );
end;
$$;

create or replace function public.wa_atualizar_envios(
  p_segredo text, p_campanha_id uuid, p_entregues text[], p_falhados text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entregues integer;
  v_falhados integer;
begin
  perform public.wa_validar(p_segredo);

  update public.envios_campanha e
  set status = 'entregue',
      enviado_em = coalesce(e.enviado_em, now()),
      entregue_em = coalesce(e.entregue_em, now())
  from public.pacientes p
  where p.id = e.paciente_id
    and e.campanha_id = p_campanha_id
    and e.status in ('pendente', 'enviado')
    and public.telefone_normalizado(p.telefone) = any (coalesce(p_entregues, '{}'));
  get diagnostics v_entregues = row_count;

  update public.envios_campanha e
  set status = 'falhou', erro = coalesce(e.erro, 'não entregue pela UazApi')
  from public.pacientes p
  where p.id = e.paciente_id
    and e.campanha_id = p_campanha_id
    and e.status = 'pendente'
    and public.telefone_normalizado(p.telefone) = any (coalesce(p_falhados, '{}'));
  get diagnostics v_falhados = row_count;

  -- A mensagem da campanha na conversa acompanha o status do envio.
  update public.mensagens m
  set status = case when e.status = 'falhou' then 'falhou' else 'entregue' end::public.status_mensagem
  from public.envios_campanha e
  join public.conversas cv on cv.paciente_id = e.paciente_id and cv.canal = 'whatsapp'
  where e.campanha_id = p_campanha_id
    and e.status in ('entregue', 'respondido', 'falhou')
    and m.conversa_id = cv.id
    and m.autor = 'sistema'
    and m.status = 'pendente'
    and m.criado_em >= e.criado_em - interval '5 minutes';

  update public.campanhas c
  set status = 'concluida'
  where c.id = p_campanha_id
    and c.status = 'em_andamento'
    and not exists (
      select 1 from public.envios_campanha e
      where e.campanha_id = c.id and e.status in ('pendente', 'enviado')
    );

  return jsonb_build_object('entregues', v_entregues, 'falhados', v_falhados);
end;
$$;

/* ------------------------------------------------------- agendador */

/**
 * Liga as tarefas de fundo (pg_cron + pg_net chamando a aplicação a cada
 * minuto). Só pelo SQL editor, depois de publicar:
 *   select public.wa_ligar_agendador('https://SEU-DOMINIO/api/whatsapp/tarefas?k=CHAVE');
 */
create or replace function public.wa_ligar_agendador(p_url text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'cliniia-tarefas';
  perform cron.schedule(
    'cliniia-tarefas',
    '* * * * *',
    format(
      $job$select net.http_post(url := %L, body := '{}'::jsonb, timeout_milliseconds := 5000)$job$,
      p_url
    )
  );
end;
$$;

-- Contadores de envio dos chips zeram todo dia (03:05 UTC = 00:05 em Brasília).
select cron.schedule('cliniia-zerar-chips', '5 3 * * *', 'select public.zerar_contadores_chips()');

/* ---------------------------------------------------------- acesso */

-- O padrão do Supabase dá EXECUTE a anon/authenticated em toda função nova
-- do schema public. Aqui ele fica só onde precisa.
revoke execute on function
  public.wa_validar(text),
  public.wa_definir_segredo(text),
  public.wa_ligar_agendador(text),
  public.zerar_contadores_chips(),
  public.membro_atual(uuid)
from public, anon, authenticated;

revoke execute on function
  public.wa_guardar_credencial(text, uuid, text, text),
  public.wa_ler_credencial(text, uuid),
  public.wa_credencial_por_instancia(text, text),
  public.wa_atualizar_conexao(text, text, public.status_numero_whatsapp, text),
  public.wa_registrar_mensagem(text, text, text, text, text, boolean, text, public.tipo_conteudo_mensagem, text, boolean, text),
  public.wa_guardar_foto(text, uuid, text, text),
  public.wa_contexto_assistente(text, uuid),
  public.wa_registrar_resposta_ia(text, uuid, text, text),
  public.wa_gerar_pendencias(text),
  public.wa_fila_de_envio(text, integer),
  public.wa_concluir_envio(text, text, uuid, boolean, text),
  public.wa_campanhas_em_disparo(text),
  public.wa_atualizar_envios(text, uuid, text[], text[])
from public;

-- O servidor chama com a chave publicável (anon) e o segredo.
grant execute on function
  public.wa_guardar_credencial(text, uuid, text, text),
  public.wa_ler_credencial(text, uuid),
  public.wa_credencial_por_instancia(text, text),
  public.wa_atualizar_conexao(text, text, public.status_numero_whatsapp, text),
  public.wa_registrar_mensagem(text, text, text, text, text, boolean, text, public.tipo_conteudo_mensagem, text, boolean, text),
  public.wa_guardar_foto(text, uuid, text, text),
  public.wa_contexto_assistente(text, uuid),
  public.wa_registrar_resposta_ia(text, uuid, text, text),
  public.wa_gerar_pendencias(text),
  public.wa_fila_de_envio(text, integer),
  public.wa_concluir_envio(text, text, uuid, boolean, text),
  public.wa_campanhas_em_disparo(text),
  public.wa_atualizar_envios(text, uuid, text[], text[])
to anon, authenticated;
