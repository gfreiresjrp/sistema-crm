-- Arquivos (Storage) e tempo real.

/* --------------------------------------------------------------- baldes */

-- midias: anexos das conversas e campanhas. Privado; o app usa URL assinada.
-- marca: logos das clínicas. Público, para a URL ser estável.
insert into storage.buckets (id, name, public, file_size_limit)
values
  ('midias', 'midias', false, 26214400),
  ('marca', 'marca', true, 2097152)
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit;

/*
 * O primeiro segmento do caminho é a clínica ("<clinica_id>/arquivo.ext"):
 * só membro dela lê ou grava ali.
 */
create or replace function public.pasta_da_clinica(p_nome text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return split_part(p_nome, '/', 1)::uuid;
exception when others then
  return null;
end;
$$;

create policy "membros leem midias" on storage.objects for select to authenticated
  using (bucket_id = 'midias' and public.pasta_da_clinica(name) = any (public.clinicas_do_usuario()));
create policy "membros enviam midias" on storage.objects for insert to authenticated
  with check (bucket_id = 'midias' and public.pasta_da_clinica(name) = any (public.clinicas_do_usuario()));
create policy "membros apagam midias" on storage.objects for delete to authenticated
  using (bucket_id = 'midias' and public.pasta_da_clinica(name) = any (public.clinicas_do_usuario()));

create policy "gestores enviam marca" on storage.objects for insert to authenticated
  with check (bucket_id = 'marca' and public.eh_gestor(public.pasta_da_clinica(name)));
create policy "gestores trocam marca" on storage.objects for update to authenticated
  using (bucket_id = 'marca' and public.eh_gestor(public.pasta_da_clinica(name)));
create policy "gestores apagam marca" on storage.objects for delete to authenticated
  using (bucket_id = 'marca' and public.eh_gestor(public.pasta_da_clinica(name)));
create policy "membros leem marca" on storage.objects for select to authenticated
  using (bucket_id = 'marca' and public.pasta_da_clinica(name) = any (public.clinicas_do_usuario()));

/* ---------------------------------------------------------- tempo real */

-- A caixa de entrada e o contador de pendências escutam estas duas tabelas.
alter publication supabase_realtime add table public.conversas, public.mensagens;
