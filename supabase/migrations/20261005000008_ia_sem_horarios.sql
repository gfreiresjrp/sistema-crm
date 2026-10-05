-- A IA só oferece dias e horários da agenda quando a clínica liga esta opção.
--
-- Desligada (padrão), ela não sugere data nenhuma: pergunta qual data a pessoa
-- prefere e passa o atendimento para a responsável marcar a avaliação.
-- Oferecer horário que a clínica não tem de verdade gerava promessa falsa.

alter table public.configuracoes_ia
  add column oferece_horarios boolean not null default false;
