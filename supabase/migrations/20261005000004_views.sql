-- Views das telas. Todas com security_invoker: o RLS de quem consulta vale
-- dentro delas, então uma clínica nunca enxerga a linha de outra.
--
-- Os meses saem como timestamptz da meia-noite local (e não como date): o
-- navegador faz new Date(mes), e uma data pura viraria o dia anterior no
-- fuso do Brasil, jogando cada mês para o mês de trás.

create view public.vw_marca_clinica with (security_invoker = true) as
select
  c.id as clinica_id,
  coalesce(nullif(trim(c.nome_exibicao), ''), c.nome) as nome_painel,
  c.logo_url,
  c.favicon_url,
  c.cor_primaria,
  c.cor_secundaria,
  c.cor_destaque,
  c.dominio_proprio,
  c.tema_padrao,
  (c.cor_primaria is null and c.cor_secundaria is null and c.cor_destaque is null) as usa_tema_padrao
from public.clinicas c;

create view public.vw_caixa_entrada with (security_invoker = true) as
select
  cv.id as conversa_id,
  cv.clinica_id,
  cv.unidade_id,
  cv.paciente_id,
  p.nome_completo,
  p.telefone,
  p.email,
  p.foto_url,
  p.etiquetas,
  p.observacoes,
  p.origem,
  p.situacao,
  p.interesse_principal,
  cv.status,
  cv.ia_ativa,
  cv.assumida_por,
  nullif(pf.nome_completo, '') as atendente,
  cv.nao_lidas,
  cv.ultima_mensagem_em,
  cv.ultima_mensagem_previa,
  cv.criado_em,
  (
    select e.nome
    from public.oportunidades o
    join public.etapas_funil e on e.id = o.etapa_id
    where o.paciente_id = cv.paciente_id
    order by (o.status = 'aberta') desc, o.atualizado_em desc
    limit 1
  ) as etapa_funil
from public.conversas cv
join public.pacientes p on p.id = cv.paciente_id
left join public.membros_clinica m on m.id = cv.assumida_por
left join public.perfis pf on pf.id = m.perfil_id
where p.excluido_em is null;

create view public.vw_agenda with (security_invoker = true) as
select
  a.id as agendamento_id,
  a.clinica_id,
  a.unidade_id,
  u.nome as unidade,
  a.paciente_id,
  p.nome_completo as paciente,
  p.telefone,
  a.procedimento_id,
  pr.nome as procedimento,
  a.profissional_id,
  pf.nome as profissional,
  a.inicio,
  a.fim,
  (extract(epoch from (a.fim - a.inicio)) / 60)::integer as duracao_minutos,
  (a.inicio at time zone c.fuso_horario)::date as data_local,
  a.status,
  a.origem,
  a.agendado_pela_ia,
  coalesce(a.valor, pr.valor) as valor
from public.agendamentos a
join public.clinicas c on c.id = a.clinica_id
join public.pacientes p on p.id = a.paciente_id
left join public.unidades u on u.id = a.unidade_id
left join public.procedimentos pr on pr.id = a.procedimento_id
left join public.profissionais pf on pf.id = a.profissional_id;

create view public.vw_funil_crm with (security_invoker = true) as
select
  e.id as etapa_id,
  e.clinica_id,
  e.nome as etapa,
  e.cor,
  e.ordem,
  e.tipo,
  count(o.id) filter (where o.status = 'aberta')::integer as oportunidades_abertas,
  coalesce(sum(o.valor_estimado) filter (where o.status = 'aberta'), 0) as valor_em_aberto,
  round(coalesce(avg(extract(epoch from (now() - o.entrou_na_etapa_em)) / 86400)
    filter (where o.status = 'aberta'), 0)::numeric, 1) as dias_medios_na_etapa
from public.etapas_funil e
left join public.oportunidades o on o.etapa_id = e.id
where e.ativa
group by e.id;

create view public.vw_saude_chips with (security_invoker = true) as
select
  n.id as numero_id,
  n.clinica_id,
  n.apelido,
  n.numero,
  n.status,
  n.enviados_hoje,
  n.limite_diario,
  case when n.limite_diario > 0
    then round(100.0 * n.enviados_hoje / n.limite_diario, 1)
  end as uso_percentual,
  n.aquecimento_iniciado_em,
  n.ultima_atividade_em
from public.numeros_whatsapp n
where n.ativo;

create view public.vw_desempenho_campanhas with (security_invoker = true) as
select
  c.id as campanha_id,
  c.clinica_id,
  c.nome as campanha,
  c.status,
  c.investimento,
  count(e.id)::integer as abordados,
  count(e.id) filter (where e.status in ('enviado', 'entregue', 'lido', 'respondido'))::integer as enviados,
  count(e.id) filter (where e.status = 'respondido' or e.respondido_em is not null)::integer as responderam,
  count(e.agendamento_id)::integer as agendaram,
  count(a.id) filter (where a.status in ('compareceu', 'concluido'))::integer as compareceram,
  coalesce((
    select sum(pg.valor - pg.desconto)
    from public.pagamentos pg
    where pg.status in ('pago', 'parcial')
      and pg.agendamento_id in (
        select e2.agendamento_id from public.envios_campanha e2
        where e2.campanha_id = c.id and e2.agendamento_id is not null
      )
  ), 0) as receita,
  case when count(e.id) filter (where e.status in ('enviado', 'entregue', 'lido', 'respondido')) > 0
    then round(100.0 * count(e.id) filter (where e.status = 'respondido' or e.respondido_em is not null)
      / count(e.id) filter (where e.status in ('enviado', 'entregue', 'lido', 'respondido')), 1)
    else 0
  end as taxa_resposta_percentual,
  case when c.investimento > 0
    then round(coalesce((
      select sum(pg.valor - pg.desconto)
      from public.pagamentos pg
      where pg.status in ('pago', 'parcial')
        and pg.agendamento_id in (
          select e2.agendamento_id from public.envios_campanha e2
          where e2.campanha_id = c.id and e2.agendamento_id is not null
        )
    ), 0) / c.investimento, 2)
  end as retorno_sobre_investimento
from public.campanhas c
left join public.envios_campanha e on e.campanha_id = c.id
left join public.agendamentos a on a.id = e.agendamento_id
group by c.id;

create view public.vw_origem_agendamentos with (security_invoker = true) as
select
  a.clinica_id,
  date_trunc('month', a.inicio at time zone c.fuso_horario) at time zone c.fuso_horario as mes,
  a.origem,
  count(*)::integer as agendamentos,
  count(*) filter (where a.status in ('compareceu', 'concluido'))::integer as comparecimentos,
  coalesce(sum(coalesce(a.valor, pr.valor, 0)) filter (where a.status in ('compareceu', 'concluido')), 0) as receita
from public.agendamentos a
join public.clinicas c on c.id = a.clinica_id
left join public.procedimentos pr on pr.id = a.procedimento_id
where a.status <> 'cancelado'
group by a.clinica_id, c.fuso_horario, 2, a.origem;

create view public.vw_indicadores_mensais with (security_invoker = true) as
with
conversas_mes as (
  select m.clinica_id,
         date_trunc('month', m.criado_em at time zone c.fuso_horario) at time zone c.fuso_horario as mes,
         count(distinct m.conversa_id) as conversas_atendidas
  from public.mensagens m
  join public.clinicas c on c.id = m.clinica_id
  where m.autor = 'paciente'
  group by 1, 2
),
agenda_mes as (
  select a.clinica_id,
         date_trunc('month', a.inicio at time zone c.fuso_horario) at time zone c.fuso_horario as mes,
         count(*) as agendamentos,
         count(*) filter (where a.agendado_pela_ia) as agendamentos_pela_ia,
         count(*) filter (where a.status in ('compareceu', 'concluido')) as comparecimentos
  from public.agendamentos a
  join public.clinicas c on c.id = a.clinica_id
  where a.status <> 'cancelado'
  group by 1, 2
),
receita_mes as (
  select pg.clinica_id,
         date_trunc('month', coalesce(pg.pago_em, pg.criado_em) at time zone c.fuso_horario) at time zone c.fuso_horario as mes,
         sum(pg.valor - pg.desconto) as receita_total,
         coalesce(sum(pg.valor - pg.desconto) filter (where a.agendado_pela_ia), 0) as receita_atribuida_ia,
         count(*) as pagamentos
  from public.pagamentos pg
  join public.clinicas c on c.id = pg.clinica_id
  left join public.agendamentos a on a.id = pg.agendamento_id
  where pg.status in ('pago', 'parcial')
  group by 1, 2
),
meses as (
  select clinica_id, mes from conversas_mes
  union select clinica_id, mes from agenda_mes
  union select clinica_id, mes from receita_mes
)
select
  ms.clinica_id,
  ms.mes,
  coalesce(cm.conversas_atendidas, 0)::integer as conversas_atendidas,
  coalesce(am.agendamentos, 0)::integer as agendamentos,
  coalesce(am.agendamentos_pela_ia, 0)::integer as agendamentos_pela_ia,
  coalesce(am.comparecimentos, 0)::integer as comparecimentos,
  coalesce(rm.receita_total, 0) as receita_total,
  coalesce(rm.receita_atribuida_ia, 0) as receita_atribuida_ia,
  case when coalesce(rm.pagamentos, 0) > 0 then round(rm.receita_total / rm.pagamentos, 2) else 0 end as ticket_medio,
  case when coalesce(cm.conversas_atendidas, 0) > 0
    then round(100.0 * coalesce(am.agendamentos, 0) / cm.conversas_atendidas, 1)
    else 0
  end as taxa_conversao_percentual
from meses ms
left join conversas_mes cm on cm.clinica_id = ms.clinica_id and cm.mes = ms.mes
left join agenda_mes am on am.clinica_id = ms.clinica_id and am.mes = ms.mes
left join receita_mes rm on rm.clinica_id = ms.clinica_id and rm.mes = ms.mes;

grant select on
  public.vw_marca_clinica, public.vw_caixa_entrada, public.vw_agenda, public.vw_funil_crm,
  public.vw_saude_chips, public.vw_desempenho_campanhas, public.vw_origem_agendamentos,
  public.vw_indicadores_mensais
to authenticated;
revoke select on
  public.vw_marca_clinica, public.vw_caixa_entrada, public.vw_agenda, public.vw_funil_crm,
  public.vw_saude_chips, public.vw_desempenho_campanhas, public.vw_origem_agendamentos,
  public.vw_indicadores_mensais
from anon;
