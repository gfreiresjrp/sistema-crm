-- A aba Conhecimento (Configurar IA) aceita texto livre por assunto, não só
-- pergunta e resposta: a categoria passa a ir para a IA, e o prompt padrão
-- trata o bloco como informação a seguir, não como FAQ.

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

O que a clínica ensinou (informações e regras — siga sempre, e elas valem mais que o resto deste texto quando houver conflito):
{{conhecimento}}

Sobre quem está falando com você: {{paciente}}

Instruções da clínica:
{{instrucoes}}$prompt$;
$$;

-- Clínicas que usam a instrução já gravada: o bloco antigo de "Perguntas
-- frequentes" passa a ter o mesmo peso de regra.
update public.configuracoes_ia
set prompt_sistema = replace(
  prompt_sistema,
  E'Perguntas frequentes:\n{{conhecimento}}',
  E'O que a clínica ensinou (informações e regras — siga sempre, e elas valem mais que o resto deste texto quando houver conflito):\n{{conhecimento}}'
)
where prompt_sistema like E'%Perguntas frequentes:\n{{conhecimento}}%';
