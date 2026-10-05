export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agendamentos: {
        Row: {
          agendado_pela_ia: boolean
          atualizado_em: string
          cancelado_em: string | null
          clinica_id: string
          confirmado_em: string | null
          criado_em: string
          criado_por: string | null
          fim: string
          id: string
          inicio: string
          motivo_cancelamento: string | null
          observacoes: string | null
          oportunidade_id: string | null
          origem: Database["public"]["Enums"]["origem_contato"]
          paciente_id: string
          procedimento_id: string | null
          profissional_id: string | null
          status: Database["public"]["Enums"]["status_agendamento"]
          unidade_id: string
          valor: number | null
        }
        Insert: {
          agendado_pela_ia?: boolean
          atualizado_em?: string
          cancelado_em?: string | null
          clinica_id: string
          confirmado_em?: string | null
          criado_em?: string
          criado_por?: string | null
          fim: string
          id?: string
          inicio: string
          motivo_cancelamento?: string | null
          observacoes?: string | null
          oportunidade_id?: string | null
          origem?: Database["public"]["Enums"]["origem_contato"]
          paciente_id: string
          procedimento_id?: string | null
          profissional_id?: string | null
          status?: Database["public"]["Enums"]["status_agendamento"]
          unidade_id: string
          valor?: number | null
        }
        Update: {
          agendado_pela_ia?: boolean
          atualizado_em?: string
          cancelado_em?: string | null
          clinica_id?: string
          confirmado_em?: string | null
          criado_em?: string
          criado_por?: string | null
          fim?: string
          id?: string
          inicio?: string
          motivo_cancelamento?: string | null
          observacoes?: string | null
          oportunidade_id?: string | null
          origem?: Database["public"]["Enums"]["origem_contato"]
          paciente_id?: string
          procedimento_id?: string | null
          profissional_id?: string | null
          status?: Database["public"]["Enums"]["status_agendamento"]
          unidade_id?: string
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "agendamentos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_marca_clinica"
            referencedColumns: ["clinica_id"]
          },
          {
            foreignKeyName: "agendamentos_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "membros_clinica"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "vw_caixa_entrada"
            referencedColumns: ["assumida_por"]
          },
          {
            foreignKeyName: "agendamentos_oportunidade_id_fkey"
            columns: ["oportunidade_id"]
            isOneToOne: false
            referencedRelation: "oportunidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "vw_agenda"
            referencedColumns: ["paciente_id"]
          },
          {
            foreignKeyName: "agendamentos_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "vw_caixa_entrada"
            referencedColumns: ["paciente_id"]
          },
          {
            foreignKeyName: "agendamentos_procedimento_id_fkey"
            columns: ["procedimento_id"]
            isOneToOne: false
            referencedRelation: "procedimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_procedimento_id_fkey"
            columns: ["procedimento_id"]
            isOneToOne: false
            referencedRelation: "vw_agenda"
            referencedColumns: ["procedimento_id"]
          },
          {
            foreignKeyName: "agendamentos_profissional_id_fkey"
            columns: ["profissional_id"]
            isOneToOne: false
            referencedRelation: "profissionais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_profissional_id_fkey"
            columns: ["profissional_id"]
            isOneToOne: false
            referencedRelation: "vw_agenda"
            referencedColumns: ["profissional_id"]
          },
          {
            foreignKeyName: "agendamentos_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      base_conhecimento_ia: {
        Row: {
          ativa: boolean
          atualizado_em: string
          categoria: string | null
          clinica_id: string
          criado_em: string
          criado_por: string | null
          etiquetas: string[]
          id: string
          pergunta: string
          resposta: string
        }
        Insert: {
          ativa?: boolean
          atualizado_em?: string
          categoria?: string | null
          clinica_id: string
          criado_em?: string
          criado_por?: string | null
          etiquetas?: string[]
          id?: string
          pergunta: string
          resposta: string
        }
        Update: {
          ativa?: boolean
          atualizado_em?: string
          categoria?: string | null
          clinica_id?: string
          criado_em?: string
          criado_por?: string | null
          etiquetas?: string[]
          id?: string
          pergunta?: string
          resposta?: string
        }
        Relationships: [
          {
            foreignKeyName: "base_conhecimento_ia_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "base_conhecimento_ia_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_marca_clinica"
            referencedColumns: ["clinica_id"]
          },
          {
            foreignKeyName: "base_conhecimento_ia_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "membros_clinica"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "base_conhecimento_ia_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "vw_caixa_entrada"
            referencedColumns: ["assumida_por"]
          },
        ]
      }
      bloqueios_agenda: {
        Row: {
          clinica_id: string
          criado_em: string
          criado_por: string | null
          fim: string
          id: string
          inicio: string
          motivo: string | null
          profissional_id: string | null
          unidade_id: string | null
        }
        Insert: {
          clinica_id: string
          criado_em?: string
          criado_por?: string | null
          fim: string
          id?: string
          inicio: string
          motivo?: string | null
          profissional_id?: string | null
          unidade_id?: string | null
        }
        Update: {
          clinica_id?: string
          criado_em?: string
          criado_por?: string | null
          fim?: string
          id?: string
          inicio?: string
          motivo?: string | null
          profissional_id?: string | null
          unidade_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bloqueios_agenda_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bloqueios_agenda_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_marca_clinica"
            referencedColumns: ["clinica_id"]
          },
          {
            foreignKeyName: "bloqueios_agenda_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "membros_clinica"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bloqueios_agenda_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "vw_caixa_entrada"
            referencedColumns: ["assumida_por"]
          },
          {
            foreignKeyName: "bloqueios_agenda_profissional_id_fkey"
            columns: ["profissional_id"]
            isOneToOne: false
            referencedRelation: "profissionais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bloqueios_agenda_profissional_id_fkey"
            columns: ["profissional_id"]
            isOneToOne: false
            referencedRelation: "vw_agenda"
            referencedColumns: ["profissional_id"]
          },
          {
            foreignKeyName: "bloqueios_agenda_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      campanha_numeros: {
        Row: {
          campanha_id: string
          clinica_id: string
          criado_em: string
          id: string
          numero_whatsapp_id: string
        }
        Insert: {
          campanha_id: string
          clinica_id: string
          criado_em?: string
          id?: string
          numero_whatsapp_id: string
        }
        Update: {
          campanha_id?: string
          clinica_id?: string
          criado_em?: string
          id?: string
          numero_whatsapp_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campanha_numeros_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "campanhas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campanha_numeros_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "vw_desempenho_campanhas"
            referencedColumns: ["campanha_id"]
          },
          {
            foreignKeyName: "campanha_numeros_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campanha_numeros_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_marca_clinica"
            referencedColumns: ["clinica_id"]
          },
          {
            foreignKeyName: "campanha_numeros_numero_whatsapp_id_fkey"
            columns: ["numero_whatsapp_id"]
            isOneToOne: false
            referencedRelation: "numeros_whatsapp"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campanha_numeros_numero_whatsapp_id_fkey"
            columns: ["numero_whatsapp_id"]
            isOneToOne: false
            referencedRelation: "vw_saude_chips"
            referencedColumns: ["numero_id"]
          },
        ]
      }
      campanhas: {
        Row: {
          atualizado_em: string
          canal: Database["public"]["Enums"]["canal_atendimento"]
          clinica_id: string
          criado_em: string
          criado_por: string | null
          descricao: string | null
          encerra_em: string | null
          envios_por_hora: number
          filtro_publico: Json
          id: string
          inicia_em: string | null
          investimento: number
          modelo_mensagem: string
          nome: string
          pasta_externa: string | null
          objetivo: string | null
          status: Database["public"]["Enums"]["status_campanha"]
          unidade_id: string | null
        }
        Insert: {
          atualizado_em?: string
          canal?: Database["public"]["Enums"]["canal_atendimento"]
          clinica_id: string
          criado_em?: string
          criado_por?: string | null
          descricao?: string | null
          encerra_em?: string | null
          envios_por_hora?: number
          filtro_publico?: Json
          id?: string
          inicia_em?: string | null
          investimento?: number
          modelo_mensagem?: string
          nome: string
          objetivo?: string | null
          status?: Database["public"]["Enums"]["status_campanha"]
          unidade_id?: string | null
        }
        Update: {
          atualizado_em?: string
          canal?: Database["public"]["Enums"]["canal_atendimento"]
          clinica_id?: string
          criado_em?: string
          criado_por?: string | null
          descricao?: string | null
          encerra_em?: string | null
          envios_por_hora?: number
          filtro_publico?: Json
          id?: string
          inicia_em?: string | null
          investimento?: number
          modelo_mensagem?: string
          nome?: string
          pasta_externa?: string | null
          objetivo?: string | null
          status?: Database["public"]["Enums"]["status_campanha"]
          unidade_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campanhas_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campanhas_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_marca_clinica"
            referencedColumns: ["clinica_id"]
          },
          {
            foreignKeyName: "campanhas_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "membros_clinica"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campanhas_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "vw_caixa_entrada"
            referencedColumns: ["assumida_por"]
          },
          {
            foreignKeyName: "campanhas_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      categorias_procedimento: {
        Row: {
          ativa: boolean
          atualizado_em: string
          clinica_id: string
          criado_em: string
          id: string
          nome: string
          ordem: number
        }
        Insert: {
          ativa?: boolean
          atualizado_em?: string
          clinica_id: string
          criado_em?: string
          id?: string
          nome: string
          ordem?: number
        }
        Update: {
          ativa?: boolean
          atualizado_em?: string
          clinica_id?: string
          criado_em?: string
          id?: string
          nome?: string
          ordem?: number
        }
        Relationships: [
          {
            foreignKeyName: "categorias_procedimento_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categorias_procedimento_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_marca_clinica"
            referencedColumns: ["clinica_id"]
          },
        ]
      }
      clinicas: {
        Row: {
          ativa: boolean
          atualizado_em: string
          cnpj: string | null
          cor_destaque: string | null
          cor_primaria: string | null
          cor_secundaria: string | null
          criado_em: string
          dominio_proprio: string | null
          email: string | null
          favicon_url: string | null
          fuso_horario: string
          id: string
          logo_url: string | null
          nome: string
          nome_exibicao: string | null
          plano: string
          razao_social: string | null
          site: string | null
          telefone: string | null
          tema_padrao: Database["public"]["Enums"]["tema_painel"]
        }
        Insert: {
          ativa?: boolean
          atualizado_em?: string
          cnpj?: string | null
          cor_destaque?: string | null
          cor_primaria?: string | null
          cor_secundaria?: string | null
          criado_em?: string
          dominio_proprio?: string | null
          email?: string | null
          favicon_url?: string | null
          fuso_horario?: string
          id?: string
          logo_url?: string | null
          nome: string
          nome_exibicao?: string | null
          plano?: string
          razao_social?: string | null
          site?: string | null
          telefone?: string | null
          tema_padrao?: Database["public"]["Enums"]["tema_painel"]
        }
        Update: {
          ativa?: boolean
          atualizado_em?: string
          cnpj?: string | null
          cor_destaque?: string | null
          cor_primaria?: string | null
          cor_secundaria?: string | null
          criado_em?: string
          dominio_proprio?: string | null
          email?: string | null
          favicon_url?: string | null
          fuso_horario?: string
          id?: string
          logo_url?: string | null
          nome?: string
          nome_exibicao?: string | null
          plano?: string
          razao_social?: string | null
          site?: string | null
          telefone?: string | null
          tema_padrao?: Database["public"]["Enums"]["tema_painel"]
        }
        Relationships: []
      }
      configuracoes_ia: {
        Row: {
          atendimento_24h: boolean
          atualizado_em: string
          clinica_id: string
          confirmacao_agenda: boolean
          criado_em: string
          desconto_maximo_percentual: number
          escalar_para_humano_apos: number
          followup_inteligente: boolean
          id: string
          instrucoes_adicionais: string | null
          maximo_parcelas: number
          mensagem_apresentacao: string
          modelo_ia: string
          oferece_horarios: boolean
          nome_assistente: string
          prompt_sistema: string | null
          quebra_objecoes: boolean
          silencio_fim: string
          silencio_inicio: string
          tom_voz: Database["public"]["Enums"]["tom_voz_ia"]
          transcreve_audio: boolean
          unidade_id: string | null
          valor_minimo_entrada: number
        }
        Insert: {
          atendimento_24h?: boolean
          atualizado_em?: string
          clinica_id: string
          confirmacao_agenda?: boolean
          criado_em?: string
          desconto_maximo_percentual?: number
          escalar_para_humano_apos?: number
          followup_inteligente?: boolean
          id?: string
          instrucoes_adicionais?: string | null
          maximo_parcelas?: number
          mensagem_apresentacao?: string
          modelo_ia?: string
          oferece_horarios?: boolean
          nome_assistente?: string
          prompt_sistema?: string | null
          quebra_objecoes?: boolean
          silencio_fim?: string
          silencio_inicio?: string
          tom_voz?: Database["public"]["Enums"]["tom_voz_ia"]
          transcreve_audio?: boolean
          unidade_id?: string | null
          valor_minimo_entrada?: number
        }
        Update: {
          atendimento_24h?: boolean
          atualizado_em?: string
          clinica_id?: string
          confirmacao_agenda?: boolean
          criado_em?: string
          desconto_maximo_percentual?: number
          escalar_para_humano_apos?: number
          followup_inteligente?: boolean
          id?: string
          instrucoes_adicionais?: string | null
          maximo_parcelas?: number
          mensagem_apresentacao?: string
          modelo_ia?: string
          oferece_horarios?: boolean
          nome_assistente?: string
          prompt_sistema?: string | null
          quebra_objecoes?: boolean
          silencio_fim?: string
          silencio_inicio?: string
          tom_voz?: Database["public"]["Enums"]["tom_voz_ia"]
          transcreve_audio?: boolean
          unidade_id?: string | null
          valor_minimo_entrada?: number
        }
        Relationships: [
          {
            foreignKeyName: "configuracoes_ia_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "configuracoes_ia_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_marca_clinica"
            referencedColumns: ["clinica_id"]
          },
          {
            foreignKeyName: "configuracoes_ia_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      conversas: {
        Row: {
          assumida_em: string | null
          assumida_por: string | null
          atualizado_em: string
          canal: Database["public"]["Enums"]["canal_atendimento"]
          clinica_id: string
          criado_em: string
          ia_ativa: boolean
          id: string
          identificador_externo: string | null
          nao_lidas: number
          numero_whatsapp_id: string | null
          paciente_id: string
          status: Database["public"]["Enums"]["status_conversa"]
          ultima_mensagem_em: string | null
          ultima_mensagem_previa: string | null
          unidade_id: string | null
        }
        Insert: {
          assumida_em?: string | null
          assumida_por?: string | null
          atualizado_em?: string
          canal?: Database["public"]["Enums"]["canal_atendimento"]
          clinica_id: string
          criado_em?: string
          ia_ativa?: boolean
          id?: string
          identificador_externo?: string | null
          nao_lidas?: number
          numero_whatsapp_id?: string | null
          paciente_id: string
          status?: Database["public"]["Enums"]["status_conversa"]
          ultima_mensagem_em?: string | null
          ultima_mensagem_previa?: string | null
          unidade_id?: string | null
        }
        Update: {
          assumida_em?: string | null
          assumida_por?: string | null
          atualizado_em?: string
          canal?: Database["public"]["Enums"]["canal_atendimento"]
          clinica_id?: string
          criado_em?: string
          ia_ativa?: boolean
          id?: string
          identificador_externo?: string | null
          nao_lidas?: number
          numero_whatsapp_id?: string | null
          paciente_id?: string
          status?: Database["public"]["Enums"]["status_conversa"]
          ultima_mensagem_em?: string | null
          ultima_mensagem_previa?: string | null
          unidade_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversas_assumida_por_fkey"
            columns: ["assumida_por"]
            isOneToOne: false
            referencedRelation: "membros_clinica"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversas_assumida_por_fkey"
            columns: ["assumida_por"]
            isOneToOne: false
            referencedRelation: "vw_caixa_entrada"
            referencedColumns: ["assumida_por"]
          },
          {
            foreignKeyName: "conversas_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversas_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_marca_clinica"
            referencedColumns: ["clinica_id"]
          },
          {
            foreignKeyName: "conversas_numero_whatsapp_id_fkey"
            columns: ["numero_whatsapp_id"]
            isOneToOne: false
            referencedRelation: "numeros_whatsapp"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversas_numero_whatsapp_id_fkey"
            columns: ["numero_whatsapp_id"]
            isOneToOne: false
            referencedRelation: "vw_saude_chips"
            referencedColumns: ["numero_id"]
          },
          {
            foreignKeyName: "conversas_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversas_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "vw_agenda"
            referencedColumns: ["paciente_id"]
          },
          {
            foreignKeyName: "conversas_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "vw_caixa_entrada"
            referencedColumns: ["paciente_id"]
          },
          {
            foreignKeyName: "conversas_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      envios_campanha: {
        Row: {
          agendado_para: string | null
          agendamento_id: string | null
          atualizado_em: string
          campanha_id: string
          clinica_id: string
          conversa_id: string | null
          criado_em: string
          entregue_em: string | null
          enviado_em: string | null
          erro: string | null
          id: string
          mensagem_enviada: string | null
          numero_whatsapp_id: string | null
          paciente_id: string
          respondido_em: string | null
          status: Database["public"]["Enums"]["status_envio"]
        }
        Insert: {
          agendado_para?: string | null
          agendamento_id?: string | null
          atualizado_em?: string
          campanha_id: string
          clinica_id: string
          conversa_id?: string | null
          criado_em?: string
          entregue_em?: string | null
          enviado_em?: string | null
          erro?: string | null
          id?: string
          mensagem_enviada?: string | null
          numero_whatsapp_id?: string | null
          paciente_id: string
          respondido_em?: string | null
          status?: Database["public"]["Enums"]["status_envio"]
        }
        Update: {
          agendado_para?: string | null
          agendamento_id?: string | null
          atualizado_em?: string
          campanha_id?: string
          clinica_id?: string
          conversa_id?: string | null
          criado_em?: string
          entregue_em?: string | null
          enviado_em?: string | null
          erro?: string | null
          id?: string
          mensagem_enviada?: string | null
          numero_whatsapp_id?: string | null
          paciente_id?: string
          respondido_em?: string | null
          status?: Database["public"]["Enums"]["status_envio"]
        }
        Relationships: [
          {
            foreignKeyName: "envios_campanha_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "envios_campanha_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "vw_agenda"
            referencedColumns: ["agendamento_id"]
          },
          {
            foreignKeyName: "envios_campanha_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "campanhas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "envios_campanha_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "vw_desempenho_campanhas"
            referencedColumns: ["campanha_id"]
          },
          {
            foreignKeyName: "envios_campanha_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "envios_campanha_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_marca_clinica"
            referencedColumns: ["clinica_id"]
          },
          {
            foreignKeyName: "envios_campanha_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "envios_campanha_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "vw_caixa_entrada"
            referencedColumns: ["conversa_id"]
          },
          {
            foreignKeyName: "envios_campanha_numero_whatsapp_id_fkey"
            columns: ["numero_whatsapp_id"]
            isOneToOne: false
            referencedRelation: "numeros_whatsapp"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "envios_campanha_numero_whatsapp_id_fkey"
            columns: ["numero_whatsapp_id"]
            isOneToOne: false
            referencedRelation: "vw_saude_chips"
            referencedColumns: ["numero_id"]
          },
          {
            foreignKeyName: "envios_campanha_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "envios_campanha_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "vw_agenda"
            referencedColumns: ["paciente_id"]
          },
          {
            foreignKeyName: "envios_campanha_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "vw_caixa_entrada"
            referencedColumns: ["paciente_id"]
          },
        ]
      }
      etapas_funil: {
        Row: {
          ativa: boolean
          atualizado_em: string
          clinica_id: string
          cor: string
          criado_em: string
          id: string
          nome: string
          ordem: number
          tipo: Database["public"]["Enums"]["tipo_etapa_funil"]
        }
        Insert: {
          ativa?: boolean
          atualizado_em?: string
          clinica_id: string
          cor?: string
          criado_em?: string
          id?: string
          nome: string
          ordem?: number
          tipo?: Database["public"]["Enums"]["tipo_etapa_funil"]
        }
        Update: {
          ativa?: boolean
          atualizado_em?: string
          clinica_id?: string
          cor?: string
          criado_em?: string
          id?: string
          nome?: string
          ordem?: number
          tipo?: Database["public"]["Enums"]["tipo_etapa_funil"]
        }
        Relationships: [
          {
            foreignKeyName: "etapas_funil_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "etapas_funil_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_marca_clinica"
            referencedColumns: ["clinica_id"]
          },
        ]
      }
      etapas_regua_followup: {
        Row: {
          atraso_horas: number
          atualizado_em: string
          clinica_id: string
          criado_em: string
          horario_preferencial: string | null
          id: string
          modelo_mensagem: string
          ordem: number
          regua_id: string
        }
        Insert: {
          atraso_horas: number
          atualizado_em?: string
          clinica_id: string
          criado_em?: string
          horario_preferencial?: string | null
          id?: string
          modelo_mensagem?: string
          ordem: number
          regua_id: string
        }
        Update: {
          atraso_horas?: number
          atualizado_em?: string
          clinica_id?: string
          criado_em?: string
          horario_preferencial?: string | null
          id?: string
          modelo_mensagem?: string
          ordem?: number
          regua_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "etapas_regua_followup_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "etapas_regua_followup_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_marca_clinica"
            referencedColumns: ["clinica_id"]
          },
          {
            foreignKeyName: "etapas_regua_followup_regua_id_fkey"
            columns: ["regua_id"]
            isOneToOne: false
            referencedRelation: "reguas_followup"
            referencedColumns: ["id"]
          },
        ]
      }
      eventos_auditoria: {
        Row: {
          acao: Database["public"]["Enums"]["acao_auditoria"]
          clinica_id: string | null
          criado_em: string
          dados_antes: Json | null
          dados_depois: Json | null
          id: number
          perfil_id: string | null
          registro_id: string | null
          tabela: string
        }
        Insert: {
          acao: Database["public"]["Enums"]["acao_auditoria"]
          clinica_id?: string | null
          criado_em?: string
          dados_antes?: Json | null
          dados_depois?: Json | null
          id?: number
          perfil_id?: string | null
          registro_id?: string | null
          tabela: string
        }
        Update: {
          acao?: Database["public"]["Enums"]["acao_auditoria"]
          clinica_id?: string | null
          criado_em?: string
          dados_antes?: Json | null
          dados_depois?: Json | null
          id?: number
          perfil_id?: string | null
          registro_id?: string | null
          tabela?: string
        }
        Relationships: [
          {
            foreignKeyName: "eventos_auditoria_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventos_auditoria_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_marca_clinica"
            referencedColumns: ["clinica_id"]
          },
          {
            foreignKeyName: "eventos_auditoria_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      followups: {
        Row: {
          agendado_para: string
          atualizado_em: string
          clinica_id: string
          conversa_id: string | null
          criado_em: string
          enviado_em: string | null
          erro: string | null
          etapa_regua_id: string | null
          id: string
          mensagem_enviada: string | null
          oportunidade_id: string | null
          paciente_id: string
          regua_id: string | null
          respondido_em: string | null
          status: Database["public"]["Enums"]["status_followup"]
        }
        Insert: {
          agendado_para: string
          atualizado_em?: string
          clinica_id: string
          conversa_id?: string | null
          criado_em?: string
          enviado_em?: string | null
          erro?: string | null
          etapa_regua_id?: string | null
          id?: string
          mensagem_enviada?: string | null
          oportunidade_id?: string | null
          paciente_id: string
          regua_id?: string | null
          respondido_em?: string | null
          status?: Database["public"]["Enums"]["status_followup"]
        }
        Update: {
          agendado_para?: string
          atualizado_em?: string
          clinica_id?: string
          conversa_id?: string | null
          criado_em?: string
          enviado_em?: string | null
          erro?: string | null
          etapa_regua_id?: string | null
          id?: string
          mensagem_enviada?: string | null
          oportunidade_id?: string | null
          paciente_id?: string
          regua_id?: string | null
          respondido_em?: string | null
          status?: Database["public"]["Enums"]["status_followup"]
        }
        Relationships: [
          {
            foreignKeyName: "followups_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followups_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_marca_clinica"
            referencedColumns: ["clinica_id"]
          },
          {
            foreignKeyName: "followups_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followups_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "vw_caixa_entrada"
            referencedColumns: ["conversa_id"]
          },
          {
            foreignKeyName: "followups_etapa_regua_id_fkey"
            columns: ["etapa_regua_id"]
            isOneToOne: false
            referencedRelation: "etapas_regua_followup"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followups_oportunidade_id_fkey"
            columns: ["oportunidade_id"]
            isOneToOne: false
            referencedRelation: "oportunidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followups_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followups_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "vw_agenda"
            referencedColumns: ["paciente_id"]
          },
          {
            foreignKeyName: "followups_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "vw_caixa_entrada"
            referencedColumns: ["paciente_id"]
          },
          {
            foreignKeyName: "followups_regua_id_fkey"
            columns: ["regua_id"]
            isOneToOne: false
            referencedRelation: "reguas_followup"
            referencedColumns: ["id"]
          },
        ]
      }
      horarios_funcionamento: {
        Row: {
          abre: string
          atualizado_em: string
          clinica_id: string
          criado_em: string
          dia_semana: number
          fecha: string
          id: string
          unidade_id: string
        }
        Insert: {
          abre: string
          atualizado_em?: string
          clinica_id: string
          criado_em?: string
          dia_semana: number
          fecha: string
          id?: string
          unidade_id: string
        }
        Update: {
          abre?: string
          atualizado_em?: string
          clinica_id?: string
          criado_em?: string
          dia_semana?: number
          fecha?: string
          id?: string
          unidade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "horarios_funcionamento_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "horarios_funcionamento_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_marca_clinica"
            referencedColumns: ["clinica_id"]
          },
          {
            foreignKeyName: "horarios_funcionamento_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      lembretes_agendamento: {
        Row: {
          agendamento_id: string
          atualizado_em: string
          canal: Database["public"]["Enums"]["canal_atendimento"]
          clinica_id: string
          criado_em: string
          enviado_em: string | null
          enviar_em: string
          erro: string | null
          id: string
          mensagem: string | null
          status: Database["public"]["Enums"]["status_lembrete"]
          tipo: Database["public"]["Enums"]["tipo_lembrete"]
        }
        Insert: {
          agendamento_id: string
          atualizado_em?: string
          canal?: Database["public"]["Enums"]["canal_atendimento"]
          clinica_id: string
          criado_em?: string
          enviado_em?: string | null
          enviar_em: string
          erro?: string | null
          id?: string
          mensagem?: string | null
          status?: Database["public"]["Enums"]["status_lembrete"]
          tipo?: Database["public"]["Enums"]["tipo_lembrete"]
        }
        Update: {
          agendamento_id?: string
          atualizado_em?: string
          canal?: Database["public"]["Enums"]["canal_atendimento"]
          clinica_id?: string
          criado_em?: string
          enviado_em?: string | null
          enviar_em?: string
          erro?: string | null
          id?: string
          mensagem?: string | null
          status?: Database["public"]["Enums"]["status_lembrete"]
          tipo?: Database["public"]["Enums"]["tipo_lembrete"]
        }
        Relationships: [
          {
            foreignKeyName: "lembretes_agendamento_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lembretes_agendamento_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "vw_agenda"
            referencedColumns: ["agendamento_id"]
          },
          {
            foreignKeyName: "lembretes_agendamento_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lembretes_agendamento_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_marca_clinica"
            referencedColumns: ["clinica_id"]
          },
        ]
      }
      listas_leads: {
        Row: {
          atualizado_em: string
          clinica_id: string
          criado_em: string
          criado_por: string | null
          descricao: string | null
          id: string
          nome: string
        }
        Insert: {
          atualizado_em?: string
          clinica_id: string
          criado_em?: string
          criado_por?: string | null
          descricao?: string | null
          id?: string
          nome: string
        }
        Update: {
          atualizado_em?: string
          clinica_id?: string
          criado_em?: string
          criado_por?: string | null
          descricao?: string | null
          id?: string
          nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "listas_leads_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listas_leads_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "membros_clinica"
            referencedColumns: ["id"]
          },
        ]
      }
      listas_leads_itens: {
        Row: {
          clinica_id: string
          criado_em: string
          id: string
          lista_id: string
          paciente_id: string
        }
        Insert: {
          clinica_id: string
          criado_em?: string
          id?: string
          lista_id: string
          paciente_id: string
        }
        Update: {
          clinica_id?: string
          criado_em?: string
          id?: string
          lista_id?: string
          paciente_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "listas_leads_itens_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listas_leads_itens_lista_id_fkey"
            columns: ["lista_id"]
            isOneToOne: false
            referencedRelation: "listas_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listas_leads_itens_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      membros_clinica: {
        Row: {
          ativo: boolean
          atualizado_em: string
          clinica_id: string
          criado_em: string
          id: string
          papel: Database["public"]["Enums"]["papel_usuario"]
          perfil_id: string
          unidade_id: string | null
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          clinica_id: string
          criado_em?: string
          id?: string
          papel?: Database["public"]["Enums"]["papel_usuario"]
          perfil_id: string
          unidade_id?: string | null
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          clinica_id?: string
          criado_em?: string
          id?: string
          papel?: Database["public"]["Enums"]["papel_usuario"]
          perfil_id?: string
          unidade_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "membros_clinica_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membros_clinica_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_marca_clinica"
            referencedColumns: ["clinica_id"]
          },
          {
            foreignKeyName: "membros_clinica_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membros_clinica_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      mensagens: {
        Row: {
          autor: Database["public"]["Enums"]["autor_mensagem"]
          clinica_id: string
          conteudo: string | null
          conversa_id: string
          criado_em: string
          direcao: Database["public"]["Enums"]["direcao_mensagem"]
          enviada_por: string | null
          erro: string | null
          id: string
          identificador_externo: string | null
          metadados: Json
          midia_url: string | null
          numero_whatsapp_id: string | null
          status: Database["public"]["Enums"]["status_mensagem"]
          tipo_conteudo: Database["public"]["Enums"]["tipo_conteudo_mensagem"]
          transcricao: string | null
        }
        Insert: {
          autor: Database["public"]["Enums"]["autor_mensagem"]
          clinica_id: string
          conteudo?: string | null
          conversa_id: string
          criado_em?: string
          direcao: Database["public"]["Enums"]["direcao_mensagem"]
          enviada_por?: string | null
          erro?: string | null
          id?: string
          identificador_externo?: string | null
          metadados?: Json
          midia_url?: string | null
          numero_whatsapp_id?: string | null
          status?: Database["public"]["Enums"]["status_mensagem"]
          tipo_conteudo?: Database["public"]["Enums"]["tipo_conteudo_mensagem"]
          transcricao?: string | null
        }
        Update: {
          autor?: Database["public"]["Enums"]["autor_mensagem"]
          clinica_id?: string
          conteudo?: string | null
          conversa_id?: string
          criado_em?: string
          direcao?: Database["public"]["Enums"]["direcao_mensagem"]
          enviada_por?: string | null
          erro?: string | null
          id?: string
          identificador_externo?: string | null
          metadados?: Json
          midia_url?: string | null
          numero_whatsapp_id?: string | null
          status?: Database["public"]["Enums"]["status_mensagem"]
          tipo_conteudo?: Database["public"]["Enums"]["tipo_conteudo_mensagem"]
          transcricao?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mensagens_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensagens_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_marca_clinica"
            referencedColumns: ["clinica_id"]
          },
          {
            foreignKeyName: "mensagens_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensagens_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "vw_caixa_entrada"
            referencedColumns: ["conversa_id"]
          },
          {
            foreignKeyName: "mensagens_enviada_por_fkey"
            columns: ["enviada_por"]
            isOneToOne: false
            referencedRelation: "membros_clinica"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensagens_enviada_por_fkey"
            columns: ["enviada_por"]
            isOneToOne: false
            referencedRelation: "vw_caixa_entrada"
            referencedColumns: ["assumida_por"]
          },
          {
            foreignKeyName: "mensagens_numero_whatsapp_id_fkey"
            columns: ["numero_whatsapp_id"]
            isOneToOne: false
            referencedRelation: "numeros_whatsapp"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensagens_numero_whatsapp_id_fkey"
            columns: ["numero_whatsapp_id"]
            isOneToOne: false
            referencedRelation: "vw_saude_chips"
            referencedColumns: ["numero_id"]
          },
        ]
      }
      movimentacoes_oportunidade: {
        Row: {
          clinica_id: string
          criado_em: string
          etapa_destino_id: string
          etapa_origem_id: string | null
          id: string
          movido_pela_ia: boolean
          movido_por: string | null
          observacao: string | null
          oportunidade_id: string
        }
        Insert: {
          clinica_id: string
          criado_em?: string
          etapa_destino_id: string
          etapa_origem_id?: string | null
          id?: string
          movido_pela_ia?: boolean
          movido_por?: string | null
          observacao?: string | null
          oportunidade_id: string
        }
        Update: {
          clinica_id?: string
          criado_em?: string
          etapa_destino_id?: string
          etapa_origem_id?: string | null
          id?: string
          movido_pela_ia?: boolean
          movido_por?: string | null
          observacao?: string | null
          oportunidade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "movimentacoes_oportunidade_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentacoes_oportunidade_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_marca_clinica"
            referencedColumns: ["clinica_id"]
          },
          {
            foreignKeyName: "movimentacoes_oportunidade_etapa_destino_id_fkey"
            columns: ["etapa_destino_id"]
            isOneToOne: false
            referencedRelation: "etapas_funil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentacoes_oportunidade_etapa_destino_id_fkey"
            columns: ["etapa_destino_id"]
            isOneToOne: false
            referencedRelation: "vw_funil_crm"
            referencedColumns: ["etapa_id"]
          },
          {
            foreignKeyName: "movimentacoes_oportunidade_etapa_origem_id_fkey"
            columns: ["etapa_origem_id"]
            isOneToOne: false
            referencedRelation: "etapas_funil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentacoes_oportunidade_etapa_origem_id_fkey"
            columns: ["etapa_origem_id"]
            isOneToOne: false
            referencedRelation: "vw_funil_crm"
            referencedColumns: ["etapa_id"]
          },
          {
            foreignKeyName: "movimentacoes_oportunidade_movido_por_fkey"
            columns: ["movido_por"]
            isOneToOne: false
            referencedRelation: "membros_clinica"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentacoes_oportunidade_movido_por_fkey"
            columns: ["movido_por"]
            isOneToOne: false
            referencedRelation: "vw_caixa_entrada"
            referencedColumns: ["assumida_por"]
          },
          {
            foreignKeyName: "movimentacoes_oportunidade_oportunidade_id_fkey"
            columns: ["oportunidade_id"]
            isOneToOne: false
            referencedRelation: "oportunidades"
            referencedColumns: ["id"]
          },
        ]
      }
      numeros_whatsapp: {
        Row: {
          apelido: string
          aquecimento_iniciado_em: string | null
          ativo: boolean
          atualizado_em: string
          clinica_id: string
          contador_zerado_em: string
          criado_em: string
          enviados_hoje: number
          id: string
          instancia_externa: string | null
          limite_diario: number
          numero: string | null
          peso_rotacao: number
          provedor: string
          status: Database["public"]["Enums"]["status_numero_whatsapp"]
          ultima_atividade_em: string | null
          unidade_id: string | null
        }
        Insert: {
          apelido: string
          aquecimento_iniciado_em?: string | null
          ativo?: boolean
          atualizado_em?: string
          clinica_id: string
          contador_zerado_em?: string
          criado_em?: string
          enviados_hoje?: number
          id?: string
          instancia_externa?: string | null
          limite_diario?: number
          numero: string | null
          peso_rotacao?: number
          provedor?: string
          status?: Database["public"]["Enums"]["status_numero_whatsapp"]
          ultima_atividade_em?: string | null
          unidade_id?: string | null
        }
        Update: {
          apelido?: string
          aquecimento_iniciado_em?: string | null
          ativo?: boolean
          atualizado_em?: string
          clinica_id?: string
          contador_zerado_em?: string
          criado_em?: string
          enviados_hoje?: number
          id?: string
          instancia_externa?: string | null
          limite_diario?: number
          numero?: string | null
          peso_rotacao?: number
          provedor?: string
          status?: Database["public"]["Enums"]["status_numero_whatsapp"]
          ultima_atividade_em?: string | null
          unidade_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "numeros_whatsapp_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "numeros_whatsapp_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_marca_clinica"
            referencedColumns: ["clinica_id"]
          },
          {
            foreignKeyName: "numeros_whatsapp_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      oportunidades: {
        Row: {
          atualizado_em: string
          clinica_id: string
          criado_em: string
          entrou_na_etapa_em: string
          etapa_id: string
          fechada_em: string | null
          id: string
          motivo_perda: string | null
          origem: Database["public"]["Enums"]["origem_contato"]
          paciente_id: string
          previsao_fechamento: string | null
          procedimento_id: string | null
          responsavel_id: string | null
          status: Database["public"]["Enums"]["status_oportunidade"]
          titulo: string | null
          unidade_id: string | null
          valor_estimado: number | null
        }
        Insert: {
          atualizado_em?: string
          clinica_id: string
          criado_em?: string
          entrou_na_etapa_em?: string
          etapa_id: string
          fechada_em?: string | null
          id?: string
          motivo_perda?: string | null
          origem?: Database["public"]["Enums"]["origem_contato"]
          paciente_id: string
          previsao_fechamento?: string | null
          procedimento_id?: string | null
          responsavel_id?: string | null
          status?: Database["public"]["Enums"]["status_oportunidade"]
          titulo?: string | null
          unidade_id?: string | null
          valor_estimado?: number | null
        }
        Update: {
          atualizado_em?: string
          clinica_id?: string
          criado_em?: string
          entrou_na_etapa_em?: string
          etapa_id?: string
          fechada_em?: string | null
          id?: string
          motivo_perda?: string | null
          origem?: Database["public"]["Enums"]["origem_contato"]
          paciente_id?: string
          previsao_fechamento?: string | null
          procedimento_id?: string | null
          responsavel_id?: string | null
          status?: Database["public"]["Enums"]["status_oportunidade"]
          titulo?: string | null
          unidade_id?: string | null
          valor_estimado?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "oportunidades_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oportunidades_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_marca_clinica"
            referencedColumns: ["clinica_id"]
          },
          {
            foreignKeyName: "oportunidades_etapa_id_fkey"
            columns: ["etapa_id"]
            isOneToOne: false
            referencedRelation: "etapas_funil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oportunidades_etapa_id_fkey"
            columns: ["etapa_id"]
            isOneToOne: false
            referencedRelation: "vw_funil_crm"
            referencedColumns: ["etapa_id"]
          },
          {
            foreignKeyName: "oportunidades_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oportunidades_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "vw_agenda"
            referencedColumns: ["paciente_id"]
          },
          {
            foreignKeyName: "oportunidades_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "vw_caixa_entrada"
            referencedColumns: ["paciente_id"]
          },
          {
            foreignKeyName: "oportunidades_procedimento_id_fkey"
            columns: ["procedimento_id"]
            isOneToOne: false
            referencedRelation: "procedimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oportunidades_procedimento_id_fkey"
            columns: ["procedimento_id"]
            isOneToOne: false
            referencedRelation: "vw_agenda"
            referencedColumns: ["procedimento_id"]
          },
          {
            foreignKeyName: "oportunidades_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "membros_clinica"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oportunidades_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "vw_caixa_entrada"
            referencedColumns: ["assumida_por"]
          },
          {
            foreignKeyName: "oportunidades_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      pacientes: {
        Row: {
          aceita_marketing: boolean
          atualizado_em: string
          clinica_id: string
          cpf: string | null
          criado_em: string
          data_nascimento: string | null
          email: string | null
          foto_origem: string | null
          foto_url: string | null
          endereco: Json
          etiquetas: string[]
          excluido_em: string | null
          id: string
          interesse_principal: string | null
          nome_completo: string
          observacoes: string | null
          origem: Database["public"]["Enums"]["origem_contato"]
          primeiro_contato_em: string
          responsavel_id: string | null
          sexo: Database["public"]["Enums"]["sexo_biologico"]
          situacao: Database["public"]["Enums"]["situacao_paciente"]
          telefone: string
          ultima_visita_em: string | null
          ultimo_contato_em: string | null
          unidade_id: string | null
        }
        Insert: {
          aceita_marketing?: boolean
          atualizado_em?: string
          clinica_id: string
          cpf?: string | null
          criado_em?: string
          data_nascimento?: string | null
          email?: string | null
          foto_origem?: string | null
          foto_url?: string | null
          endereco?: Json
          etiquetas?: string[]
          excluido_em?: string | null
          id?: string
          interesse_principal?: string | null
          nome_completo: string
          observacoes?: string | null
          origem?: Database["public"]["Enums"]["origem_contato"]
          primeiro_contato_em?: string
          responsavel_id?: string | null
          sexo?: Database["public"]["Enums"]["sexo_biologico"]
          situacao?: Database["public"]["Enums"]["situacao_paciente"]
          telefone: string
          ultima_visita_em?: string | null
          ultimo_contato_em?: string | null
          unidade_id?: string | null
        }
        Update: {
          aceita_marketing?: boolean
          atualizado_em?: string
          clinica_id?: string
          cpf?: string | null
          criado_em?: string
          data_nascimento?: string | null
          email?: string | null
          foto_origem?: string | null
          foto_url?: string | null
          endereco?: Json
          etiquetas?: string[]
          excluido_em?: string | null
          id?: string
          interesse_principal?: string | null
          nome_completo?: string
          observacoes?: string | null
          origem?: Database["public"]["Enums"]["origem_contato"]
          primeiro_contato_em?: string
          responsavel_id?: string | null
          sexo?: Database["public"]["Enums"]["sexo_biologico"]
          situacao?: Database["public"]["Enums"]["situacao_paciente"]
          telefone?: string
          ultima_visita_em?: string | null
          ultimo_contato_em?: string | null
          unidade_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pacientes_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pacientes_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_marca_clinica"
            referencedColumns: ["clinica_id"]
          },
          {
            foreignKeyName: "pacientes_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "membros_clinica"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pacientes_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "vw_caixa_entrada"
            referencedColumns: ["assumida_por"]
          },
          {
            foreignKeyName: "pacientes_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      pagamentos: {
        Row: {
          agendamento_id: string | null
          atualizado_em: string
          clinica_id: string
          criado_em: string
          desconto: number
          forma: Database["public"]["Enums"]["forma_pagamento"]
          id: string
          observacoes: string | null
          paciente_id: string
          pago_em: string | null
          parcelas: number
          registrado_por: string | null
          status: Database["public"]["Enums"]["status_pagamento"]
          valor: number
        }
        Insert: {
          agendamento_id?: string | null
          atualizado_em?: string
          clinica_id: string
          criado_em?: string
          desconto?: number
          forma?: Database["public"]["Enums"]["forma_pagamento"]
          id?: string
          observacoes?: string | null
          paciente_id: string
          pago_em?: string | null
          parcelas?: number
          registrado_por?: string | null
          status?: Database["public"]["Enums"]["status_pagamento"]
          valor: number
        }
        Update: {
          agendamento_id?: string | null
          atualizado_em?: string
          clinica_id?: string
          criado_em?: string
          desconto?: number
          forma?: Database["public"]["Enums"]["forma_pagamento"]
          id?: string
          observacoes?: string | null
          paciente_id?: string
          pago_em?: string | null
          parcelas?: number
          registrado_por?: string | null
          status?: Database["public"]["Enums"]["status_pagamento"]
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "pagamentos_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "vw_agenda"
            referencedColumns: ["agendamento_id"]
          },
          {
            foreignKeyName: "pagamentos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_marca_clinica"
            referencedColumns: ["clinica_id"]
          },
          {
            foreignKeyName: "pagamentos_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "vw_agenda"
            referencedColumns: ["paciente_id"]
          },
          {
            foreignKeyName: "pagamentos_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "vw_caixa_entrada"
            referencedColumns: ["paciente_id"]
          },
          {
            foreignKeyName: "pagamentos_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "membros_clinica"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "vw_caixa_entrada"
            referencedColumns: ["assumida_por"]
          },
        ]
      }
      perfis: {
        Row: {
          atualizado_em: string
          avatar_url: string | null
          criado_em: string
          email: string | null
          id: string
          nome_completo: string
          telefone: string | null
        }
        Insert: {
          atualizado_em?: string
          avatar_url?: string | null
          criado_em?: string
          email?: string | null
          id: string
          nome_completo?: string
          telefone?: string | null
        }
        Update: {
          atualizado_em?: string
          avatar_url?: string | null
          criado_em?: string
          email?: string | null
          id?: string
          nome_completo?: string
          telefone?: string | null
        }
        Relationships: []
      }
      procedimentos: {
        Row: {
          ativo: boolean
          atualizado_em: string
          categoria_id: string | null
          clinica_id: string
          criado_em: string
          descricao: string | null
          duracao_minutos: number
          id: string
          intervalo_retorno_dias: number | null
          nome: string
          valor: number
          valor_promocional: number | null
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          categoria_id?: string | null
          clinica_id: string
          criado_em?: string
          descricao?: string | null
          duracao_minutos?: number
          id?: string
          intervalo_retorno_dias?: number | null
          nome: string
          valor?: number
          valor_promocional?: number | null
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          categoria_id?: string | null
          clinica_id?: string
          criado_em?: string
          descricao?: string | null
          duracao_minutos?: number
          id?: string
          intervalo_retorno_dias?: number | null
          nome?: string
          valor?: number
          valor_promocional?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "procedimentos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias_procedimento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procedimentos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procedimentos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_marca_clinica"
            referencedColumns: ["clinica_id"]
          },
        ]
      }
      profissionais: {
        Row: {
          aceita_agendamento: boolean
          ativo: boolean
          atualizado_em: string
          clinica_id: string
          cor_agenda: string
          criado_em: string
          especialidade: string | null
          id: string
          membro_id: string | null
          nome: string
          registro_conselho: string | null
          unidade_id: string | null
        }
        Insert: {
          aceita_agendamento?: boolean
          ativo?: boolean
          atualizado_em?: string
          clinica_id: string
          cor_agenda?: string
          criado_em?: string
          especialidade?: string | null
          id?: string
          membro_id?: string | null
          nome: string
          registro_conselho?: string | null
          unidade_id?: string | null
        }
        Update: {
          aceita_agendamento?: boolean
          ativo?: boolean
          atualizado_em?: string
          clinica_id?: string
          cor_agenda?: string
          criado_em?: string
          especialidade?: string | null
          id?: string
          membro_id?: string | null
          nome?: string
          registro_conselho?: string | null
          unidade_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profissionais_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profissionais_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_marca_clinica"
            referencedColumns: ["clinica_id"]
          },
          {
            foreignKeyName: "profissionais_membro_id_fkey"
            columns: ["membro_id"]
            isOneToOne: false
            referencedRelation: "membros_clinica"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profissionais_membro_id_fkey"
            columns: ["membro_id"]
            isOneToOne: false
            referencedRelation: "vw_caixa_entrada"
            referencedColumns: ["assumida_por"]
          },
          {
            foreignKeyName: "profissionais_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      reguas_followup: {
        Row: {
          ativa: boolean
          atualizado_em: string
          clinica_id: string
          criado_em: string
          descricao: string | null
          id: string
          nome: string
        }
        Insert: {
          ativa?: boolean
          atualizado_em?: string
          clinica_id: string
          criado_em?: string
          descricao?: string | null
          id?: string
          nome: string
        }
        Update: {
          ativa?: boolean
          atualizado_em?: string
          clinica_id?: string
          criado_em?: string
          descricao?: string | null
          id?: string
          nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "reguas_followup_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reguas_followup_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_marca_clinica"
            referencedColumns: ["clinica_id"]
          },
        ]
      }
      unidades: {
        Row: {
          ativa: boolean
          atualizado_em: string
          bairro: string | null
          cep: string | null
          cidade: string | null
          clinica_id: string
          complemento: string | null
          criado_em: string
          email: string | null
          id: string
          logradouro: string | null
          nome: string
          numero: string | null
          telefone: string | null
          uf: string | null
        }
        Insert: {
          ativa?: boolean
          atualizado_em?: string
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          clinica_id: string
          complemento?: string | null
          criado_em?: string
          email?: string | null
          id?: string
          logradouro?: string | null
          nome: string
          numero?: string | null
          telefone?: string | null
          uf?: string | null
        }
        Update: {
          ativa?: boolean
          atualizado_em?: string
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          clinica_id?: string
          complemento?: string | null
          criado_em?: string
          email?: string | null
          id?: string
          logradouro?: string | null
          nome?: string
          numero?: string | null
          telefone?: string | null
          uf?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "unidades_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unidades_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_marca_clinica"
            referencedColumns: ["clinica_id"]
          },
        ]
      }
    }
    Views: {
      vw_agenda: {
        Row: {
          agendado_pela_ia: boolean | null
          agendamento_id: string | null
          clinica_id: string | null
          data_local: string | null
          duracao_minutos: number | null
          fim: string | null
          inicio: string | null
          origem: Database["public"]["Enums"]["origem_contato"] | null
          paciente: string | null
          paciente_id: string | null
          procedimento: string | null
          procedimento_id: string | null
          profissional: string | null
          profissional_id: string | null
          status: Database["public"]["Enums"]["status_agendamento"] | null
          telefone: string | null
          unidade: string | null
          unidade_id: string | null
          valor: number | null
        }
        Relationships: [
          {
            foreignKeyName: "agendamentos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_marca_clinica"
            referencedColumns: ["clinica_id"]
          },
          {
            foreignKeyName: "agendamentos_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_caixa_entrada: {
        Row: {
          assumida_por: string | null
          atendente: string | null
          clinica_id: string | null
          conversa_id: string | null
          etapa_funil: string | null
          ia_ativa: boolean | null
          interesse_principal: string | null
          nao_lidas: number | null
          nome_completo: string | null
          origem: Database["public"]["Enums"]["origem_contato"] | null
          paciente_id: string | null
          situacao: Database["public"]["Enums"]["situacao_paciente"] | null
          status: Database["public"]["Enums"]["status_conversa"] | null
          telefone: string | null
          ultima_mensagem_em: string | null
          ultima_mensagem_previa: string | null
          unidade_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversas_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversas_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_marca_clinica"
            referencedColumns: ["clinica_id"]
          },
          {
            foreignKeyName: "conversas_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_desempenho_campanhas: {
        Row: {
          abordados: number | null
          agendaram: number | null
          campanha: string | null
          campanha_id: string | null
          clinica_id: string | null
          compareceram: number | null
          enviados: number | null
          investimento: number | null
          receita: number | null
          responderam: number | null
          retorno_sobre_investimento: number | null
          status: Database["public"]["Enums"]["status_campanha"] | null
          taxa_resposta_percentual: number | null
        }
        Relationships: [
          {
            foreignKeyName: "campanhas_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campanhas_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_marca_clinica"
            referencedColumns: ["clinica_id"]
          },
        ]
      }
      vw_funil_crm: {
        Row: {
          clinica_id: string | null
          cor: string | null
          dias_medios_na_etapa: number | null
          etapa: string | null
          etapa_id: string | null
          oportunidades_abertas: number | null
          ordem: number | null
          tipo: Database["public"]["Enums"]["tipo_etapa_funil"] | null
          valor_em_aberto: number | null
        }
        Relationships: [
          {
            foreignKeyName: "etapas_funil_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "etapas_funil_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_marca_clinica"
            referencedColumns: ["clinica_id"]
          },
        ]
      }
      vw_indicadores_mensais: {
        Row: {
          agendamentos: number | null
          agendamentos_pela_ia: number | null
          clinica_id: string | null
          comparecimentos: number | null
          conversas_atendidas: number | null
          mes: string | null
          receita_atribuida_ia: number | null
          receita_total: number | null
          taxa_conversao_percentual: number | null
          ticket_medio: number | null
        }
        Relationships: []
      }
      vw_marca_clinica: {
        Row: {
          clinica_id: string | null
          cor_destaque: string | null
          cor_primaria: string | null
          cor_secundaria: string | null
          dominio_proprio: string | null
          favicon_url: string | null
          logo_url: string | null
          nome_painel: string | null
          tema_padrao: Database["public"]["Enums"]["tema_painel"] | null
          usa_tema_padrao: boolean | null
        }
        Insert: {
          clinica_id?: string | null
          cor_destaque?: string | null
          cor_primaria?: string | null
          cor_secundaria?: string | null
          dominio_proprio?: string | null
          favicon_url?: string | null
          logo_url?: string | null
          nome_painel?: never
          tema_padrao?: Database["public"]["Enums"]["tema_painel"] | null
          usa_tema_padrao?: never
        }
        Update: {
          clinica_id?: string | null
          cor_destaque?: string | null
          cor_primaria?: string | null
          cor_secundaria?: string | null
          dominio_proprio?: string | null
          favicon_url?: string | null
          logo_url?: string | null
          nome_painel?: never
          tema_padrao?: Database["public"]["Enums"]["tema_painel"] | null
          usa_tema_padrao?: never
        }
        Relationships: []
      }
      vw_origem_agendamentos: {
        Row: {
          agendamentos: number | null
          clinica_id: string | null
          comparecimentos: number | null
          mes: string | null
          origem: Database["public"]["Enums"]["origem_contato"] | null
          receita: number | null
        }
        Relationships: [
          {
            foreignKeyName: "agendamentos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_marca_clinica"
            referencedColumns: ["clinica_id"]
          },
        ]
      }
      vw_saude_chips: {
        Row: {
          apelido: string | null
          aquecimento_iniciado_em: string | null
          clinica_id: string | null
          enviados_hoje: number | null
          limite_diario: number | null
          numero: string | null
          numero_id: string | null
          status: Database["public"]["Enums"]["status_numero_whatsapp"] | null
          ultima_atividade_em: string | null
          uso_percentual: number | null
        }
        Insert: {
          apelido?: string | null
          aquecimento_iniciado_em?: string | null
          clinica_id?: string | null
          enviados_hoje?: number | null
          limite_diario?: number | null
          numero?: string | null
          numero_id?: string | null
          status?: Database["public"]["Enums"]["status_numero_whatsapp"] | null
          ultima_atividade_em?: string | null
          uso_percentual?: never
        }
        Update: {
          apelido?: string | null
          aquecimento_iniciado_em?: string | null
          clinica_id?: string | null
          enviados_hoje?: number | null
          limite_diario?: number | null
          numero?: string | null
          numero_id?: string | null
          status?: Database["public"]["Enums"]["status_numero_whatsapp"] | null
          ultima_atividade_em?: string | null
          uso_percentual?: never
        }
        Relationships: [
          {
            foreignKeyName: "numeros_whatsapp_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "numeros_whatsapp_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "vw_marca_clinica"
            referencedColumns: ["clinica_id"]
          },
        ]
      }
    }
    Functions: {
      aplicar_politicas_clinica: {
        Args: { p_tabela: string }
        Returns: undefined
      }
      clinicas_do_usuario: { Args: never; Returns: string[] }
      criar_clinica_do_usuario: {
        Args: { p_nome: string; p_unidade?: string }
        Returns: string
      }
      criar_usuario_da_clinica: {
        Args: {
          p_clinica_id: string
          p_email: string
          p_senha: string
          p_nome: string
          p_papel?: Database["public"]["Enums"]["papel_usuario"]
          p_unidade_id?: string | null
          p_profissional?: boolean
          p_especialidade?: string | null
          p_registro?: string | null
        }
        Returns: string
      }
      redefinir_senha_membro: {
        Args: { p_membro_id: string; p_senha: string }
        Returns: undefined
      }
      eh_gestor: { Args: { p_clinica_id: string }; Returns: boolean }
      prompt_assistente_padrao: { Args: never; Returns: string }
      wa_contexto_assistente: {
        Args: { p_segredo: string; p_conversa_id: string }
        Returns: Json
      }
      wa_registrar_resposta_ia: {
        Args: {
          p_segredo: string
          p_conversa_id: string
          p_conteudo: string
          p_id_externo?: string | null
        }
        Returns: string
      }
      wa_atualizar_envios: {
        Args: {
          p_segredo: string
          p_campanha_id: string
          p_entregues: string[]
          p_falhados: string[]
        }
        Returns: Json
      }
      wa_campanhas_em_disparo: {
        Args: { p_segredo: string }
        Returns: {
          campanha_id: string
          pasta_externa: string
          instancia: string
          token: string
        }[]
      }
      wa_concluir_envio: {
        Args: {
          p_segredo: string
          p_tipo: string
          p_id: string
          p_ok: boolean
          p_erro?: string | null
        }
        Returns: undefined
      }
      wa_fila_de_envio: {
        Args: { p_segredo: string; p_limite?: number }
        Returns: {
          tipo: string
          id: string
          instancia: string
          token: string
          telefone: string
          texto: string
        }[]
      }
      wa_gerar_pendencias: { Args: { p_segredo: string }; Returns: Json }
      wa_atualizar_conexao: {
        Args: {
          p_segredo: string
          p_instancia: string
          p_status: Database["public"]["Enums"]["status_numero_whatsapp"]
          p_numero?: string | null
        }
        Returns: undefined
      }
      wa_guardar_credencial: {
        Args: {
          p_segredo: string
          p_numero_id: string
          p_instancia: string
          p_token: string
        }
        Returns: undefined
      }
      wa_ler_credencial: {
        Args: { p_segredo: string; p_numero_id: string }
        Returns: { instancia: string; token: string }[]
      }
      wa_credencial_por_instancia: {
        Args: { p_segredo: string; p_instancia: string }
        Returns: { numero_id: string; token: string }[]
      }
      wa_guardar_foto: {
        Args: { p_segredo: string; p_paciente_id: string; p_foto: string | null; p_origem: string | null }
        Returns: undefined
      }
      wa_registrar_mensagem: {
        Args: {
          p_segredo: string
          p_instancia: string
          p_telefone: string
          p_nome?: string | null
          p_conteudo?: string | null
          p_de_mim: boolean
          p_id_externo?: string | null
          p_tipo?: Database["public"]["Enums"]["tipo_conteudo_mensagem"]
          p_midia_url?: string | null
          p_enviada_pela_api?: boolean
          p_foto?: string | null
        }
        Returns: Json
      }
      eh_membro: { Args: { p_clinica_id: string }; Returns: boolean }
      proximo_chip_disponivel: {
        Args: { p_clinica_id: string }
        Returns: string
      }
      zerar_contadores_chips: { Args: never; Returns: number }
      wa_saude: { Args: { p_segredo: string }; Returns: Json }
      wa_campanhas_a_continuar: {
        Args: { p_segredo: string }
        Returns: { campanha_id: string; clinica_id: string }[]
      }
    }
    Enums: {
      acao_auditoria: "insercao" | "atualizacao" | "exclusao"
      autor_mensagem: "paciente" | "ia" | "humano" | "sistema"
      canal_atendimento:
        | "whatsapp"
        | "instagram"
        | "facebook"
        | "site"
        | "telefone"
        | "presencial"
      direcao_mensagem: "entrada" | "saida"
      forma_pagamento:
        | "dinheiro"
        | "pix"
        | "cartao_credito"
        | "cartao_debito"
        | "boleto"
        | "transferencia"
        | "link_pagamento"
      origem_contato:
        | "instagram"
        | "whatsapp"
        | "facebook"
        | "google"
        | "site"
        | "indicacao"
        | "reativacao"
        | "presencial"
        | "telefone"
        | "outro"
      papel_usuario:
        | "proprietario"
        | "administrador"
        | "gerente"
        | "atendente"
        | "profissional"
      sexo_biologico: "feminino" | "masculino" | "outro" | "nao_informado"
      situacao_paciente: "lead" | "paciente" | "inativo" | "arquivado"
      status_agendamento:
        | "aguardando_confirmacao"
        | "confirmado"
        | "remarcado"
        | "em_atendimento"
        | "concluido"
        | "compareceu"
        | "faltou"
        | "cancelado"
      status_campanha:
        | "rascunho"
        | "agendada"
        | "em_andamento"
        | "pausada"
        | "concluida"
        | "cancelada"
      status_conversa: "aberta" | "pendente" | "resolvida" | "arquivada"
      status_envio:
        | "pendente"
        | "enviado"
        | "entregue"
        | "lido"
        | "respondido"
        | "falhou"
        | "cancelado"
      status_followup:
        | "pendente"
        | "enviado"
        | "respondido"
        | "cancelado"
        | "falhou"
      status_lembrete: "pendente" | "enviado" | "falhou" | "cancelado"
      status_mensagem: "pendente" | "enviada" | "entregue" | "lida" | "falhou"
      status_numero_whatsapp:
        | "desconectado"
        | "conectando"
        | "conectado"
        | "aquecendo"
        | "pausado"
        | "banido"
      status_oportunidade: "aberta" | "ganha" | "perdida"
      status_pagamento:
        | "pendente"
        | "pago"
        | "parcial"
        | "estornado"
        | "cancelado"
      tema_painel: "claro" | "escuro" | "sistema"
      tipo_conteudo_mensagem:
        | "texto"
        | "imagem"
        | "audio"
        | "video"
        | "documento"
        | "localizacao"
        | "contato"
        | "figurinha"
      tipo_etapa_funil: "aberta" | "ganha" | "perdida"
      tipo_lembrete:
        | "confirmacao"
        | "lembrete_vespera"
        | "lembrete_hora"
        | "pos_atendimento"
        | "aniversario"
        | "retorno_procedimento"
      tom_voz_ia: "acolhedor" | "direto" | "descontraido" | "formal"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      acao_auditoria: ["insercao", "atualizacao", "exclusao"],
      autor_mensagem: ["paciente", "ia", "humano", "sistema"],
      canal_atendimento: [
        "whatsapp",
        "instagram",
        "facebook",
        "site",
        "telefone",
        "presencial",
      ],
      direcao_mensagem: ["entrada", "saida"],
      forma_pagamento: [
        "dinheiro",
        "pix",
        "cartao_credito",
        "cartao_debito",
        "boleto",
        "transferencia",
        "link_pagamento",
      ],
      origem_contato: [
        "instagram",
        "whatsapp",
        "facebook",
        "google",
        "site",
        "indicacao",
        "reativacao",
        "presencial",
        "telefone",
        "outro",
      ],
      papel_usuario: [
        "proprietario",
        "administrador",
        "gerente",
        "atendente",
        "profissional",
      ],
      sexo_biologico: ["feminino", "masculino", "outro", "nao_informado"],
      situacao_paciente: ["lead", "paciente", "inativo", "arquivado"],
      status_agendamento: [
        "aguardando_confirmacao",
        "confirmado",
        "remarcado",
        "em_atendimento",
        "concluido",
        "compareceu",
        "faltou",
        "cancelado",
      ],
      status_campanha: [
        "rascunho",
        "agendada",
        "em_andamento",
        "pausada",
        "concluida",
        "cancelada",
      ],
      status_conversa: ["aberta", "pendente", "resolvida", "arquivada"],
      status_envio: [
        "pendente",
        "enviado",
        "entregue",
        "lido",
        "respondido",
        "falhou",
        "cancelado",
      ],
      status_followup: [
        "pendente",
        "enviado",
        "respondido",
        "cancelado",
        "falhou",
      ],
      status_lembrete: ["pendente", "enviado", "falhou", "cancelado"],
      status_mensagem: ["pendente", "enviada", "entregue", "lida", "falhou"],
      status_numero_whatsapp: [
        "desconectado",
        "conectando",
        "conectado",
        "aquecendo",
        "pausado",
        "banido",
      ],
      status_oportunidade: ["aberta", "ganha", "perdida"],
      status_pagamento: [
        "pendente",
        "pago",
        "parcial",
        "estornado",
        "cancelado",
      ],
      tema_painel: ["claro", "escuro", "sistema"],
      tipo_conteudo_mensagem: [
        "texto",
        "imagem",
        "audio",
        "video",
        "documento",
        "localizacao",
        "contato",
        "figurinha",
      ],
      tipo_etapa_funil: ["aberta", "ganha", "perdida"],
      tipo_lembrete: [
        "confirmacao",
        "lembrete_vespera",
        "lembrete_hora",
        "pos_atendimento",
        "aniversario",
        "retorno_procedimento",
      ],
      tom_voz_ia: ["acolhedor", "direto", "descontraido", "formal"],
    },
  },
} as const
