-- Uma mudança pedida pela clínica e uma de proteção dos chips.
--
-- 1. A resposta da IA cita a mensagem do lead (o "responder" do WhatsApp):
--    o contexto passa a trazer o id externo da última mensagem dele.
-- 2. Chip novo nasce com limite de 50 envios por dia, não 300. Chip recém
--    conectado é o mais vulnerável a ser derrubado pelo WhatsApp; o limite
--    sobe à mão conforme o chip aquece.

alter table public.numeros_whatsapp alter column limite_diario set default 50;

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
      select jsonb_agg(
        jsonb_build_object('pergunta', k.pergunta, 'resposta', k.resposta, 'categoria', k.categoria)
        order by k.categoria nulls last, k.criado_em
      )
      from public.base_conhecimento_ia k
      where k.clinica_id = v_conversa.clinica_id and k.ativa
    ), '[]'::jsonb),
    'responder_a', (
      select m.identificador_externo
      from public.mensagens m
      where m.conversa_id = p_conversa_id and m.autor = 'paciente'
      order by m.criado_em desc
      limit 1
    ),
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
