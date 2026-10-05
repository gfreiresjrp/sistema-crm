-- Saúde da operação, para o monitor externo (rota /api/whatsapp/saude).
--
-- No fim de semana de 2026-10-03 o banco caiu e a IA ficou parada sem
-- ninguém perceber. Esta função diz, numa consulta só, se há chip conectado
-- e quando o agendador rodou pela última vez; o banco não responder já é, por
-- si, o alerta.

create or replace function public.wa_saude(p_segredo text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.wa_validar(p_segredo);
  return jsonb_build_object(
    'chips_ativos', (select count(*) from public.numeros_whatsapp where ativo),
    'chips_conectados', (select count(*) from public.numeros_whatsapp where ativo and status = 'conectado'),
    'chips_desconectados', coalesce((
      select jsonb_agg(apelido order by apelido)
      from public.numeros_whatsapp
      where ativo and status <> 'conectado'
    ), '[]'::jsonb),
    'agendador_rodou_em', (
      select max(d.start_time)
      from cron.job_run_details d
      join cron.job j on j.jobid = d.jobid
      where j.jobname = 'cliniia-tarefas' and d.status = 'succeeded'
    ),
    'ultima_mensagem_recebida_em', (
      select max(criado_em) from public.mensagens where direcao = 'entrada'
    )
  );
end;
$$;

revoke execute on function public.wa_saude(text) from public;
grant execute on function public.wa_saude(text) to anon, authenticated;

-- O agendador roda a cada minuto; o histórico do pg_cron não se limpa sozinho.
select cron.schedule(
  'cliniia-limpar-historico-cron',
  '17 4 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$
);
