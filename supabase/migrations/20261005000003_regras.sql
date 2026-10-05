-- Regras que o banco cumpre sozinho, para que nenhuma tela precise lembrar.

/* ----------------------------------------------------- utilitários */

-- "Maria Clara Souza" → "Maria"; nome vazio ou que é só telefone → ''.
create or replace function public.primeiro_nome(p_nome text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when coalesce(trim(p_nome), '') = '' or trim(p_nome) ~ '^[\d\s()+-]+$' then ''
    else initcap(split_part(trim(p_nome), ' ', 1))
  end;
$$;

-- Mesma regra de lib (disparar/route.ts): "Oi {{primeiro_nome}}!" sem nome vira "Oi!".
create or replace function public.personalizar(p_modelo text, p_nome text)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(regexp_replace(regexp_replace(
    replace(replace(coalesce(p_modelo, ''), '{{primeiro_nome}}', public.primeiro_nome(p_nome)),
            '{{nome}}', case when public.primeiro_nome(p_nome) = '' then '' else trim(p_nome) end),
    ' +([!?,.])', '\1', 'g'), ' {2,}', ' ', 'g'));
$$;

-- Só dígitos, com DDI 55 — o formato que a UazApi usa.
create or replace function public.telefone_normalizado(p_telefone text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g') = '' then ''
    when regexp_replace(p_telefone, '\D', '', 'g') like '55%'
      and length(regexp_replace(p_telefone, '\D', '', 'g')) >= 12
      then regexp_replace(p_telefone, '\D', '', 'g')
    else '55' || regexp_replace(p_telefone, '\D', '', 'g')
  end;
$$;

/**
 * As grafias de um mesmo celular: com e sem 55, com e sem o nono dígito.
 * O WhatsApp devolve muitos números sem o nono dígito; o cadastro costuma ter.
 */
create or replace function public.grafias_telefone(p_telefone text)
returns text[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  n text := public.telefone_normalizado(p_telefone);
  variantes text[];
begin
  if n = '' then
    return '{}';
  end if;
  variantes := array[n];
  if length(n) = 12 and substr(n, 5, 1) ~ '[6-9]' then
    variantes := variantes || (substr(n, 1, 4) || '9' || substr(n, 5));
  elsif length(n) = 13 and substr(n, 5, 1) = '9' then
    variantes := variantes || (substr(n, 1, 4) || substr(n, 6));
  end if;
  -- Cadastro manual costuma ficar sem o 55.
  return variantes || array(select substr(v, 3) from unnest(variantes) v);
end;
$$;

-- Membro (da clínica) de quem está logado — é ele que as colunas de autoria usam.
create or replace function public.membro_atual(p_clinica_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.id from public.membros_clinica m
  where m.perfil_id = auth.uid() and m.clinica_id = p_clinica_id and m.ativo
  limit 1;
$$;

/* ------------------------------------------------------- mensagens */

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
      -- Paciente que volta a escrever reabre o atendimento.
      status = case
        when new.direcao = 'entrada' and c.status in ('resolvida', 'arquivada') then 'aberta'
        else c.status
      end,
      numero_whatsapp_id = coalesce(c.numero_whatsapp_id, new.numero_whatsapp_id)
  where c.id = new.conversa_id
  returning c.paciente_id into v_paciente;

  update public.pacientes set ultimo_contato_em = new.criado_em where id = v_paciente;

  if new.autor = 'paciente' then
    -- A campanha mais recente que falou com a pessoa ganhou uma resposta.
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

    -- Quem respondeu sai da régua: o follow-up já cumpriu o papel.
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

create trigger mensagem_registrada
  after insert on public.mensagens
  for each row execute function public.mensagem_registrada();

-- Quem envia pelo painel assina a mensagem.
create or replace function public.mensagem_autoria()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.autor = 'humano' and new.enviada_por is null and auth.uid() is not null then
    new.enviada_por := public.membro_atual(new.clinica_id);
  end if;
  return new;
end;
$$;

create trigger mensagem_autoria
  before insert on public.mensagens
  for each row execute function public.mensagem_autoria();

/* -------------------------------------------------------- conversas */

-- Assumir a conversa tira a IA dela; devolver para a IA limpa quem assumiu.
create or replace function public.conversa_assumida()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.assumida_por is not null and old.assumida_por is distinct from new.assumida_por then
    new.ia_ativa := false;
    new.assumida_em := coalesce(new.assumida_em, now());
  end if;
  if new.ia_ativa and not old.ia_ativa then
    new.assumida_por := null;
    new.assumida_em := null;
  end if;
  return new;
end;
$$;

create trigger conversa_assumida
  before update on public.conversas
  for each row execute function public.conversa_assumida();

/* ------------------------------------------------------------ CRM */

create or replace function public.oportunidade_etapa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo public.tipo_etapa_funil;
begin
  if tg_op = 'UPDATE' and new.etapa_id is not distinct from old.etapa_id then
    return new;
  end if;

  select tipo into v_tipo from public.etapas_funil where id = new.etapa_id;
  if tg_op = 'UPDATE' then
    new.entrou_na_etapa_em := now();
  end if;
  new.status := case v_tipo when 'ganha' then 'ganha' when 'perdida' then 'perdida' else 'aberta' end;
  new.fechada_em := case when v_tipo in ('ganha', 'perdida') then coalesce(new.fechada_em, now()) end;
  return new;
end;
$$;

create trigger oportunidade_etapa
  before insert or update of etapa_id on public.oportunidades
  for each row execute function public.oportunidade_etapa();

create or replace function public.oportunidade_movimentada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.etapa_id is not distinct from old.etapa_id then
    return null;
  end if;
  insert into public.movimentacoes_oportunidade (
    clinica_id, oportunidade_id, etapa_origem_id, etapa_destino_id, movido_por
  ) values (
    new.clinica_id,
    new.id,
    case when tg_op = 'UPDATE' then old.etapa_id end,
    new.etapa_id,
    public.membro_atual(new.clinica_id)
  );
  return null;
end;
$$;

create trigger oportunidade_movimentada
  after insert or update of etapa_id on public.oportunidades
  for each row execute function public.oportunidade_movimentada();

/* ---------------------------------------------------------- agenda */

create or replace function public.agendamento_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.criado_por is null and auth.uid() is not null then
    new.criado_por := public.membro_atual(new.clinica_id);
  end if;

  if new.status = 'cancelado' then
    new.cancelado_em := coalesce(new.cancelado_em, now());
  elsif tg_op = 'UPDATE' and old.status = 'cancelado' then
    new.cancelado_em := null;
  end if;

  if new.status = 'confirmado' then
    new.confirmado_em := coalesce(new.confirmado_em, now());
  end if;

  return new;
end;
$$;

create trigger agendamento_status
  before insert or update on public.agendamentos
  for each row execute function public.agendamento_status();

create or replace function public.agendamento_efeitos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Compareceu: o lead virou paciente.
  if new.status in ('compareceu', 'concluido')
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    update public.pacientes
    set situacao = 'paciente',
        ultima_visita_em = greatest(coalesce(ultima_visita_em, new.inicio), new.inicio)
    where id = new.paciente_id;
  end if;

  -- Cancelou ou mudou de horário: o lembrete pendente perdeu o sentido.
  if tg_op = 'UPDATE' and (new.status in ('cancelado', 'faltou') or new.inicio <> old.inicio) then
    delete from public.lembretes_agendamento
    where agendamento_id = new.id and status = 'pendente';
  end if;

  -- O agendamento conta para a campanha que trouxe a pessoa (últimos 30 dias).
  if tg_op = 'INSERT' then
    update public.envios_campanha e
    set agendamento_id = new.id
    where e.id = (
      select e2.id from public.envios_campanha e2
      where e2.paciente_id = new.paciente_id
        and e2.agendamento_id is null
        and e2.criado_em > now() - interval '30 days'
      order by e2.criado_em desc
      limit 1
    );
  end if;

  return null;
end;
$$;

create trigger agendamento_efeitos
  after insert or update on public.agendamentos
  for each row execute function public.agendamento_efeitos();

/* -------------------------------------------------------- pacientes */

create or replace function public.paciente_autoria()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.telefone := regexp_replace(new.telefone, '\D', '', 'g');
  if new.telefone = '' then
    raise exception 'Telefone inválido.';
  end if;
  return new;
end;
$$;

create trigger paciente_autoria
  before insert or update of telefone on public.pacientes
  for each row execute function public.paciente_autoria();

/* ---------------------------------------------------------- chips */

create or replace function public.zerar_contadores_chips()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quantos integer;
begin
  update public.numeros_whatsapp
  set enviados_hoje = 0, contador_zerado_em = now()
  where (contador_zerado_em at time zone 'America/Sao_Paulo')::date
        < (now() at time zone 'America/Sao_Paulo')::date;
  get diagnostics v_quantos = row_count;
  return v_quantos;
end;
$$;

-- O chip de disparo com mais folga no limite do dia, ponderado pelo peso.
create or replace function public.proximo_chip_disponivel(p_clinica_id uuid)
returns uuid
language sql
stable
set search_path = ''
as $$
  select n.id
  from public.numeros_whatsapp n
  where n.clinica_id = p_clinica_id
    and n.ativo
    and n.status = 'conectado'
    and n.peso_rotacao > 0
    and n.enviados_hoje < n.limite_diario
  order by (n.enviados_hoje::numeric / n.peso_rotacao), n.ultima_atividade_em nulls first
  limit 1;
$$;
