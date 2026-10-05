-- Fecha o que não precisa estar na API.
--
-- As funções wa_* continuam abertas a anon de propósito: o servidor chama
-- com a chave publicável, e quem protege é o segredo exigido dentro delas.

-- Funções de gatilho não têm o que fazer via /rpc.
revoke execute on function
  public.tocar_atualizado_em(),
  public.criar_perfil_do_usuario(),
  public.sincronizar_email_do_perfil(),
  public.mensagem_registrada(),
  public.mensagem_autoria(),
  public.conversa_assumida(),
  public.oportunidade_etapa(),
  public.oportunidade_movimentada(),
  public.agendamento_status(),
  public.agendamento_efeitos(),
  public.paciente_autoria()
from public, anon, authenticated;

-- Sem sessão, "de quais clínicas eu sou" não tem resposta.
revoke execute on function
  public.clinicas_do_usuario(),
  public.eh_membro(uuid),
  public.eh_gestor(uuid),
  public.proximo_chip_disponivel(uuid),
  public.prompt_assistente_padrao()
from public, anon;
grant execute on function
  public.clinicas_do_usuario(),
  public.eh_membro(uuid),
  public.eh_gestor(uuid),
  public.proximo_chip_disponivel(uuid),
  public.prompt_assistente_padrao()
to authenticated;
