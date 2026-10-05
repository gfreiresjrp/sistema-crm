-- Revisão de 2026-10-05: o que podia derrubar chip ou travar recurso.
--
-- 1. Follow-up só para quem escreveu. Antes, todo contato que recebeu uma
--    campanha e não respondeu ganhava 3 follow-ups (1, 3 e 7 dias): uma
--    campanha de 300 virava ~900 mensagens extras para quem não pediu nada —
--    exatamente o padrão que faz o WhatsApp desconectar o chip. A clínica
--    pediu follow-up para "quem escreveu algo e depois não falou mais".
-- 2. Follow-up só em horário comercial (seg–sáb, 9h–19h no fuso da clínica)
--    e no máximo 3 por chip a cada passada do agendador (1 min), sem passar
--    do limite diário do chip.
-- 3. A conversa passa a usar o chip pelo qual o contato falou por último:
--    é dele que a resposta da equipe precisa sair.
-- 4. "Enviar lembrete" da Agenda: gravava sem texto (e a fila ignora item sem
--    texto) e um segundo clique dava erro de duplicidade.

/* --------------------------------------------- 3. chip da última mensagem */

create or replace function public.mensagem_registrada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previa text;
  v_paciente uuid;
begin
  v_previa := left(coalesce(
    nullif(trim(new.conteudo), ''),
    case new.tipo_conteudo
      when 'imagem' then '📷 Foto'
      when 'audio' then '🎤 Áudio'
      when 'video' then '🎬 Vídeo'
      when 'documento' then '📄 Documento'
      when 'figurinha' then 'Figurinha'
      when 'localizacao' then '📍 Localização'
      when 'contato' then '👤 Contato'
      else 'Mensagem'
    end
  ), 160);

  update public.conversas c
  set ultima_mensagem_em = new.criado_em,
      ultima_mensagem_previa = v_previa,
      nao_lidas = case when new.direcao = 'entrada' then c.nao_lidas + 1 else c.nao_lidas end,
      status = case
        when new.direcao = 'entrada' and c.status in ('resolvida', 'arquivada') then 'aberta'
        else c.status
      end,
      numero_whatsapp_id = case
        when new.direcao = 'entrada' and new.numero_whatsapp_id is not null then new.numero_whatsapp_id
        else coalesce(c.numero_whatsapp_id, new.numero_whatsapp_id)
      end
  where c.id = new.conversa_id
  returning c.paciente_id into v_paciente;

  update public.pacientes set ultimo_contato_em = new.criado_em where id = v_paciente;

  if new.autor = 'paciente' then
    update public.envios_campanha e
    set status = 'respondido', respondido_em = new.criado_em
    where e.id = (
      select e2.id from public.envios_campanha e2
      where e2.paciente_id = v_paciente
        and e2.status in ('pendente', 'enviado', 'entregue', 'lido')
        and e2.criado_em > now() - interval '30 days'
      order by e2.criado_em desc
      limit 1
    );

    update public.followups
    set status = case when status = 'enviado' then 'respondido' else 'cancelado' end::public.status_followup,
        respondido_em = case when status = 'enviado' then new.criado_em else respondido_em end
    where paciente_id = v_paciente and status in ('pendente', 'enviado');
  end if;

  if new.direcao = 'saida' and new.numero_whatsapp_id is not null then
    update public.numeros_whatsapp
    set enviados_hoje = enviados_hoje + 1, ultima_atividade_em = new.criado_em
    where id = new.numero_whatsapp_id;
  end if;

  return new;
end;
$$;

/* ------------------------------------------------- 4. lembrete manual */

alter table public.lembretes_agendamento
  drop constraint lembretes_agendamento_agendamento_id_tipo_key;

-- A véspera é automática e só pode existir uma; a confirmação pedida pela
-- equipe na Agenda pode ser reenviada.
create unique index lembretes_automaticos_unicos
  on public.lembretes_agendamento (agendamento_id, tipo)
  where tipo <> 'confirmacao';

create or replace function public.lembrete_texto()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
begin
  if coalesce(trim(new.mensagem), '') <> '' then
    return new;
  end if;

  select a.inicio, c.fuso_horario,
         coalesce(nullif(trim(c.nome_exibicao), ''), c.nome) as clinica,
         p.nome_completo
  into v
  from public.agendamentos a
  join public.clinicas c on c.id = a.clinica_id
  join public.pacientes p on p.id = a.paciente_id
  where a.id = new.agendamento_id;

  new.mensagem := public.personalizar(
    format(
      'Oi {{primeiro_nome}}! Passando para confirmar seu horário %s às %s, na %s. Podemos confirmar sua presença? 💛',
      to_char(v.inicio at time zone v.fuso_horario, 'DD/MM'),
      to_char(v.inicio at time zone v.fuso_horario, 'HH24"h"MI'),
      v.clinica
    ),
    v.nome_completo
  );
  return new;
end;
$$;

create trigger lembrete_texto
  before insert on public.lembretes_agendamento
  for each row execute function public.lembrete_texto();

revoke execute on function public.lembrete_texto() from public, anon, authenticated;

/* ------------------------------------------ horário comercial da clínica */

create or replace function public.em_horario_comercial(p_fuso text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select extract(isodow from now() at time zone p_fuso) between 1 and 6
     and extract(hour from now() at time zone p_fuso) between 9 and 18;
$$;

/* -------------------------------------------------- 1 e 2. follow-up */

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
           ult.ultima_do_paciente,
           (
             select min(m.criado_em) from public.mensagens m
             where m.conversa_id = cv.id
               and m.direcao = 'saida'
               and m.criado_em > ult.ultima_do_paciente
           ) as silencio
    from public.conversas cv
    join public.clinicas cl on cl.id = cv.clinica_id
    join public.pacientes p on p.id = cv.paciente_id and p.excluido_em is null
    join public.configuracoes_ia cfg
      on cfg.clinica_id = cv.clinica_id and cfg.unidade_id is null and cfg.followup_inteligente
    join lateral (
      select g.id from public.reguas_followup g
      where g.clinica_id = cv.clinica_id and g.ativa
      order by g.criado_em
      limit 1
    ) rg on true
    -- Só quem já escreveu alguma vez: campanha sem resposta não ganha follow-up.
    join lateral (
      select max(m.criado_em) as ultima_do_paciente
      from public.mensagens m
      where m.conversa_id = cv.id and m.autor = 'paciente'
    ) ult on ult.ultima_do_paciente is not null
    where cv.ia_ativa
      and cv.canal = 'whatsapp'
      and cv.status in ('aberta', 'pendente')
      and cv.ultima_mensagem_em > now() - interval '30 days'
      and public.em_horario_comercial(cl.fuso_horario)
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
    and extract(hour from now() at time zone c.fuso_horario) between 10 and 19
  on conflict (agendamento_id, tipo) where tipo <> 'confirmacao' do nothing;
  get diagnostics v_lembretes = row_count;

  return jsonb_build_object('followups_criados', v_followups, 'lembretes_criados', v_lembretes);
end;
$$;

/**
 * O que está pronto para sair. Por passada do agendador (1 min), no máximo 3
 * itens por chip e nunca além do limite diário dele; follow-up só em horário
 * comercial. O resto espera a próxima passada.
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
      join public.clinicas cl on cl.id = f.clinica_id
      where f.status = 'pendente'
        and f.agendado_para <= now()
        and public.em_horario_comercial(cl.fuso_horario)
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
  ),
  candidatos as (
    select i.tipo, i.id, i.quando, n.id as numero_id, cr.instancia, cr.token,
           public.telefone_normalizado(p.telefone) as telefone, i.texto,
           n.limite_diario - n.enviados_hoje as folga
    from itens i
    join public.pacientes p on p.id = i.paciente_id
    left join public.conversas cv on cv.id = i.conversa_id
    left join public.numeros_whatsapp proprio
      on proprio.id = cv.numero_whatsapp_id and proprio.ativo and proprio.status = 'conectado'
    join public.numeros_whatsapp n
      on n.ativo and n.status = 'conectado'
     and (n.id = proprio.id or (proprio.id is null and n.clinica_id = i.clinica_id))
    join public.credenciais_whatsapp cr on cr.numero_id = n.id
  ),
  por_chip as (
    select c.*, row_number() over (partition by c.numero_id order by c.quando, c.id) as posicao
    from candidatos c
  )
  select pc.tipo, pc.id, pc.instancia, pc.token, pc.telefone, pc.texto
  from por_chip pc
  where pc.posicao <= least(3, pc.folga)
  order by pc.quando
  limit greatest(p_limite, 1);
end;
$$;
