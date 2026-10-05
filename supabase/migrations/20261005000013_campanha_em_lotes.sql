-- Campanha em lotes diários, dentro do limite de cada chip.
--
-- O disparo manda hoje só o que cabe no limite diário do chip e grava em
-- filtro_publico.faltam quantos ainda vão sair. O agendador pergunta aqui
-- quais campanhas continuar: em andamento, com gente faltando, lote anterior
-- já entregue e dentro do horário comercial da clínica.

create or replace function public.wa_campanhas_a_continuar(p_segredo text)
returns table (campanha_id uuid, clinica_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.wa_validar(p_segredo);
  return query
  select c.id, c.clinica_id
  from public.campanhas c
  join public.clinicas cl on cl.id = c.clinica_id
  where c.status = 'em_andamento'
    and coalesce((c.filtro_publico ->> 'faltam')::integer, 0) > 0
    and public.em_horario_comercial(cl.fuso_horario)
    and not exists (
      select 1 from public.envios_campanha e
      where e.campanha_id = c.id and e.status = 'pendente'
    );
end;
$$;

revoke execute on function public.wa_campanhas_a_continuar(text) from public;
grant execute on function public.wa_campanhas_a_continuar(text) to anon, authenticated;

-- Concluída só quando não falta ninguém, não só quando o lote do dia acabou.
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
    and coalesce((c.filtro_publico ->> 'faltam')::integer, 0) = 0
    and not exists (
      select 1 from public.envios_campanha e
      where e.campanha_id = c.id and e.status in ('pendente', 'enviado')
    );

  return jsonb_build_object('entregues', v_entregues, 'falhados', v_falhados);
end;
$$;
