-- O agendador espera até 45 s pela resposta de /api/whatsapp/tarefas.
--
-- A rota agora processa a fila da IA antes de responder (na Vercel o
-- segundo plano era cortado). Com 5 s o pg_net desistia antes do fim e a
-- resposta — que diz o que a fila fez — se perdia em net._http_response.

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
      $job$select net.http_post(url := %L, body := '{}'::jsonb, timeout_milliseconds := 45000)$job$,
      p_url
    )
  );
end;
$$;

revoke execute on function public.wa_ligar_agendador(text) from public, anon, authenticated;
