-- Isolamento por clínica (RLS), perfis e provisionamento de contas.

/* ------------------------------------------------------ quem é quem */

-- SECURITY DEFINER: as policies de membros_clinica usam estas funções, e ler a
-- tabela pela própria policy entraria em recursão.
create or replace function public.clinicas_do_usuario()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(m.clinica_id), '{}')
  from public.membros_clinica m
  where m.perfil_id = auth.uid() and m.ativo;
$$;

create or replace function public.eh_membro(p_clinica_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.membros_clinica m
    where m.perfil_id = auth.uid() and m.clinica_id = p_clinica_id and m.ativo
  );
$$;

create or replace function public.eh_gestor(p_clinica_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.membros_clinica m
    where m.perfil_id = auth.uid()
      and m.clinica_id = p_clinica_id
      and m.ativo
      and m.papel in ('proprietario', 'administrador', 'gerente')
  );
$$;

/**
 * As quatro policies padrão de uma tabela com clinica_id: quem é membro ativo
 * da clínica lê e escreve; ninguém mais enxerga a linha.
 */
create or replace function public.aplicar_politicas_clinica(p_tabela text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  execute format('alter table public.%I enable row level security', p_tabela);
  execute format('drop policy if exists membros_leem on public.%I', p_tabela);
  execute format('drop policy if exists membros_criam on public.%I', p_tabela);
  execute format('drop policy if exists membros_alteram on public.%I', p_tabela);
  execute format('drop policy if exists membros_apagam on public.%I', p_tabela);
  execute format(
    'create policy membros_leem on public.%I for select to authenticated
       using (clinica_id = any (public.clinicas_do_usuario()))', p_tabela);
  execute format(
    'create policy membros_criam on public.%I for insert to authenticated
       with check (clinica_id = any (public.clinicas_do_usuario()))', p_tabela);
  execute format(
    'create policy membros_alteram on public.%I for update to authenticated
       using (clinica_id = any (public.clinicas_do_usuario()))
       with check (clinica_id = any (public.clinicas_do_usuario()))', p_tabela);
  execute format(
    'create policy membros_apagam on public.%I for delete to authenticated
       using (clinica_id = any (public.clinicas_do_usuario()))', p_tabela);
end;
$$;
revoke execute on function public.aplicar_politicas_clinica(text) from public, anon, authenticated;

select public.aplicar_politicas_clinica(t)
from unnest(array[
  'unidades', 'horarios_funcionamento', 'categorias_procedimento', 'procedimentos',
  'profissionais', 'pacientes', 'listas_leads', 'listas_leads_itens', 'etapas_funil',
  'oportunidades', 'movimentacoes_oportunidade', 'agendamentos', 'bloqueios_agenda',
  'lembretes_agendamento', 'pagamentos', 'numeros_whatsapp', 'conversas', 'mensagens',
  'campanhas', 'campanha_numeros', 'envios_campanha', 'reguas_followup',
  'etapas_regua_followup', 'followups', 'configuracoes_ia', 'base_conhecimento_ia'
]) as t;

/* ------------------------------------------------- clínicas e equipe */

alter table public.clinicas enable row level security;

create policy membros_leem on public.clinicas for select to authenticated
  using (id = any (public.clinicas_do_usuario()));
-- Identidade visual e dados cadastrais: só quem gere a clínica.
create policy gestores_alteram on public.clinicas for update to authenticated
  using (public.eh_gestor(id)) with check (public.eh_gestor(id));

alter table public.membros_clinica enable row level security;

create policy membros_leem on public.membros_clinica for select to authenticated
  using (clinica_id = any (public.clinicas_do_usuario()) or perfil_id = auth.uid());
-- Ativar/desativar e trocar papel; criar é pela função criar_usuario_da_clinica.
create policy gestores_alteram on public.membros_clinica for update to authenticated
  using (public.eh_gestor(clinica_id)) with check (public.eh_gestor(clinica_id));

alter table public.perfis enable row level security;

create policy proprio_ou_colega on public.perfis for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1 from public.membros_clinica m
      where m.perfil_id = perfis.id and m.clinica_id = any (public.clinicas_do_usuario())
    )
  );
create policy proprio_altera on public.perfis for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

alter table public.eventos_auditoria enable row level security;

create policy gestores_leem on public.eventos_auditoria for select to authenticated
  using (public.eh_gestor(clinica_id));

/* -------------------------------------------------- perfil no cadastro */

create or replace function public.criar_perfil_do_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.perfis (id, nome_completo, email)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'nome_completo'), ''), ''),
    new.email
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

create trigger criar_perfil_do_usuario
  after insert on auth.users
  for each row execute function public.criar_perfil_do_usuario();

-- E-mail trocado no Auth acompanha o perfil (é ele que a tela de equipe mostra).
create or replace function public.sincronizar_email_do_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.perfis set email = new.email where id = new.id;
  return new;
end;
$$;

create trigger sincronizar_email_do_perfil
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.sincronizar_email_do_perfil();

/* ---------------------------------------------------- prompt padrão */

create or replace function public.prompt_assistente_padrao()
returns text
language sql
immutable
set search_path = ''
as $$
  select $prompt$Você é {{assistente}}, assistente virtual da {{clinica}}, e atende pelo WhatsApp.

{{tom}}

Como conversar:
- Mensagens curtas, como alguém digitando no celular: no máximo 3 frases por mensagem.
- Uma pergunta por vez. Chame a pessoa pelo primeiro nome quando souber.
- Use emoji com moderação (no máximo um por mensagem).
- Nunca diga que é uma inteligência artificial, a menos que perguntem diretamente.
- Não faça diagnóstico nem prometa resultado de tratamento.

Na primeira resposta, se apresente com base nesta mensagem: {{apresentacao}}

Seu objetivo é entender o que a pessoa procura, tirar as dúvidas e conduzir para uma avaliação na clínica.

Procedimentos e valores (use só estes, nunca invente preço):
{{procedimentos}}

Negociação: {{limites}}

Perguntas frequentes:
{{conhecimento}}

Sobre quem está falando com você: {{paciente}}

Instruções da clínica:
{{instrucoes}}$prompt$;
$$;

/* -------------------------------------------- provisionar uma clínica */

/**
 * Cria a clínica de quem acabou de se cadastrar, com tudo o que o painel
 * precisa para funcionar no primeiro acesso: unidade, vínculo de
 * proprietário, funil, configuração da IA e régua de follow-up.
 */
create or replace function public.criar_clinica_do_usuario(
  p_nome text,
  p_unidade text default 'Unidade principal'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_clinica uuid;
  v_unidade uuid;
  v_regua uuid;
begin
  if v_usuario is null then
    raise exception 'Faça login para criar a clínica.';
  end if;
  if coalesce(trim(p_nome), '') = '' then
    raise exception 'Informe o nome da empresa.';
  end if;
  if exists (select 1 from public.membros_clinica where perfil_id = v_usuario and ativo) then
    raise exception 'Seu usuário já está vinculado a uma clínica.';
  end if;

  -- Contas criadas antes do gatilho de perfil (ou importadas) ainda não têm um.
  insert into public.perfis (id, email)
  select u.id, u.email from auth.users u where u.id = v_usuario
  on conflict (id) do nothing;

  insert into public.clinicas (nome, nome_exibicao)
  values (trim(p_nome), trim(p_nome))
  returning id into v_clinica;

  insert into public.unidades (clinica_id, nome)
  values (v_clinica, coalesce(nullif(trim(p_unidade), ''), 'Unidade principal'))
  returning id into v_unidade;

  insert into public.membros_clinica (clinica_id, perfil_id, papel)
  values (v_clinica, v_usuario, 'proprietario');

  insert into public.etapas_funil (clinica_id, nome, ordem, cor, tipo) values
    (v_clinica, 'Novo lead', 1, '#64748b', 'aberta'),
    (v_clinica, 'Em conversa', 2, '#3b82f6', 'aberta'),
    (v_clinica, 'Avaliação agendada', 3, '#8b5cf6', 'aberta'),
    (v_clinica, 'Proposta enviada', 4, '#f59e0b', 'aberta'),
    (v_clinica, 'Fechado', 5, '#10b981', 'ganha'),
    (v_clinica, 'Perdido', 6, '#ef4444', 'perdida');

  insert into public.configuracoes_ia (clinica_id, prompt_sistema, mensagem_apresentacao)
  values (
    v_clinica,
    public.prompt_assistente_padrao(),
    format('Oi! Aqui é a Sofia, da %s 💛 Como posso te ajudar?', trim(p_nome))
  );

  insert into public.reguas_followup (clinica_id, nome, descricao)
  values (v_clinica, 'Retomada padrão', 'Retoma quem parou de responder em 1, 3 e 7 dias.')
  returning id into v_regua;

  insert into public.etapas_regua_followup (clinica_id, regua_id, ordem, atraso_horas, modelo_mensagem) values
    (v_clinica, v_regua, 1, 24, 'Oi {{primeiro_nome}}! Passando para saber se ficou alguma dúvida. Posso te ajudar com algo? 😊'),
    (v_clinica, v_regua, 2, 72, 'Oi {{primeiro_nome}}, tudo bem? Ainda temos horários disponíveis esta semana. Quer que eu veja um para você?'),
    (v_clinica, v_regua, 3, 168, 'Oi {{primeiro_nome}}! Vou deixar seu atendimento em aberto por aqui. Quando quiser retomar, é só me chamar 💛');

  return v_clinica;
end;
$$;

/* ----------------------------------------------- logins da equipe */

/**
 * Cria o login de alguém da equipe direto no Auth, já confirmado, e o vincula
 * à clínica. Só quem gere a clínica pode chamar. É também o caminho do login
 * da própria IA (lib/servidor/robo.ts).
 */
create or replace function public.criar_usuario_da_clinica(
  p_clinica_id uuid,
  p_email text,
  p_senha text,
  p_nome text,
  p_papel public.papel_usuario default 'atendente',
  p_unidade_id uuid default null,
  p_profissional boolean default false,
  p_especialidade text default null,
  p_registro text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(p_email));
  v_usuario uuid;
  v_membro uuid;
begin
  if not public.eh_gestor(p_clinica_id) then
    raise exception 'Só gestores da clínica podem criar logins.';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'E-mail inválido.';
  end if;
  if length(coalesce(p_senha, '')) < 8 then
    raise exception 'A senha precisa ter pelo menos 8 caracteres.';
  end if;
  if p_papel = 'proprietario' and not exists (
    select 1 from public.membros_clinica
    where perfil_id = auth.uid() and clinica_id = p_clinica_id and papel = 'proprietario'
  ) then
    raise exception 'Só o proprietário pode criar outro proprietário.';
  end if;
  if exists (select 1 from auth.users where lower(email) = v_email) then
    raise exception 'Este e-mail já tem login.';
  end if;

  v_usuario := gen_random_uuid();

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', v_usuario, 'authenticated', 'authenticated',
    v_email, extensions.crypt(p_senha, extensions.gen_salt('bf')), now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    jsonb_build_object('nome_completo', trim(p_nome)),
    now(), now(), '', '', '', ''
  );

  insert into auth.identities (
    provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) values (
    v_usuario::text, v_usuario,
    jsonb_build_object('sub', v_usuario::text, 'email', v_email, 'email_verified', true),
    'email', now(), now(), now()
  );

  -- O gatilho de auth.users já criou o perfil; o nome vem garantido aqui.
  update public.perfis set nome_completo = trim(p_nome) where id = v_usuario;

  insert into public.membros_clinica (clinica_id, perfil_id, papel, unidade_id)
  values (p_clinica_id, v_usuario, p_papel, p_unidade_id)
  returning id into v_membro;

  if p_profissional then
    insert into public.profissionais (
      clinica_id, unidade_id, membro_id, nome, especialidade, registro_conselho
    ) values (
      p_clinica_id, p_unidade_id, v_membro, trim(p_nome),
      nullif(trim(p_especialidade), ''), nullif(trim(p_registro), '')
    );
  end if;

  return v_membro;
end;
$$;

create or replace function public.redefinir_senha_membro(p_membro_id uuid, p_senha text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membro public.membros_clinica;
begin
  select * into v_membro from public.membros_clinica where id = p_membro_id;
  if v_membro.id is null or not public.eh_gestor(v_membro.clinica_id) then
    raise exception 'Só gestores da clínica podem redefinir senhas.';
  end if;
  if length(coalesce(p_senha, '')) < 8 then
    raise exception 'A senha precisa ter pelo menos 8 caracteres.';
  end if;
  -- Um gerente não troca a senha do dono.
  if v_membro.papel = 'proprietario' and v_membro.perfil_id <> auth.uid() and not exists (
    select 1 from public.membros_clinica
    where perfil_id = auth.uid() and clinica_id = v_membro.clinica_id and papel = 'proprietario'
  ) then
    raise exception 'Só o proprietário pode redefinir a senha de outro proprietário.';
  end if;

  update auth.users
  set encrypted_password = extensions.crypt(p_senha, extensions.gen_salt('bf')),
      updated_at = now()
  where id = v_membro.perfil_id;
end;
$$;

revoke execute on function public.criar_clinica_do_usuario(text, text) from public, anon;
revoke execute on function public.criar_usuario_da_clinica(uuid, text, text, text, public.papel_usuario, uuid, boolean, text, text) from public, anon;
revoke execute on function public.redefinir_senha_membro(uuid, text) from public, anon;
grant execute on function public.criar_clinica_do_usuario(text, text) to authenticated;
grant execute on function public.criar_usuario_da_clinica(uuid, text, text, text, public.papel_usuario, uuid, boolean, text, text) to authenticated;
grant execute on function public.redefinir_senha_membro(uuid, text) to authenticated;
