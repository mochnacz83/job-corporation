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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      access_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          page: string | null
          user_id: string
        }
        Insert: {
          action?: string
          created_at?: string
          id?: string
          page?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          page?: string | null
          user_id?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      area_permissions: {
        Row: {
          all_access: boolean
          area: string
          created_at: string
          id: string
          modules: string[]
          powerbi_report_ids: string[]
          updated_at: string
        }
        Insert: {
          all_access?: boolean
          area: string
          created_at?: string
          id?: string
          modules?: string[]
          powerbi_report_ids?: string[]
          updated_at?: string
        }
        Update: {
          all_access?: boolean
          area?: string
          created_at?: string
          id?: string
          modules?: string[]
          powerbi_report_ids?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      atividades_fato: {
        Row: {
          data_atividade: string | null
          data_termino: string | null
          ds_estado: string | null
          ds_macro_atividade: string | null
          id: string
          imported_at: string
          matricula_tr: string | null
          matricula_tt: string | null
          nome_tecnico: string | null
          raw: Json | null
        }
        Insert: {
          data_atividade?: string | null
          data_termino?: string | null
          ds_estado?: string | null
          ds_macro_atividade?: string | null
          id?: string
          imported_at?: string
          matricula_tr?: string | null
          matricula_tt?: string | null
          nome_tecnico?: string | null
          raw?: Json | null
        }
        Update: {
          data_atividade?: string | null
          data_termino?: string | null
          ds_estado?: string | null
          ds_macro_atividade?: string | null
          id?: string
          imported_at?: string
          matricula_tr?: string | null
          matricula_tt?: string | null
          nome_tecnico?: string | null
          raw?: Json | null
        }
        Relationships: []
      }
      atividades_sync_log: {
        Row: {
          error_message: string | null
          finished_at: string | null
          id: string
          rows_imported: number | null
          started_at: string
          status: string
          triggered_by: string | null
        }
        Insert: {
          error_message?: string | null
          finished_at?: string | null
          id?: string
          rows_imported?: number | null
          started_at?: string
          status?: string
          triggered_by?: string | null
        }
        Update: {
          error_message?: string | null
          finished_at?: string | null
          id?: string
          rows_imported?: number | null
          started_at?: string
          status?: string
          triggered_by?: string | null
        }
        Relationships: []
      }
      fato_reparos: {
        Row: {
          causa_ofensora_n1: string | null
          causa_ofensora_n2: string | null
          causa_ofensora_n3: string | null
          chave_reparo: string | null
          cldv: number | null
          cliente: string | null
          created_at: string | null
          data_abertura: string | null
          data_fechamento: string | null
          designacao: string | null
          faixa_repetida: string | null
          id: string
          municipio: string | null
          posto_anterior: string | null
          posto_encerramento: string | null
          posto_prazo: string | null
          produto: string | null
          protocolo: string | null
          rep: string | null
          reparo_prazo: string | null
          retido: string | null
          tecnologia_acesso: string | null
          tempo_repetida: number | null
          tmr: number | null
          tmr_real: number | null
          uf: string | null
          updated_at: string | null
        }
        Insert: {
          causa_ofensora_n1?: string | null
          causa_ofensora_n2?: string | null
          causa_ofensora_n3?: string | null
          chave_reparo?: string | null
          cldv?: number | null
          cliente?: string | null
          created_at?: string | null
          data_abertura?: string | null
          data_fechamento?: string | null
          designacao?: string | null
          faixa_repetida?: string | null
          id?: string
          municipio?: string | null
          posto_anterior?: string | null
          posto_encerramento?: string | null
          posto_prazo?: string | null
          produto?: string | null
          protocolo?: string | null
          rep?: string | null
          reparo_prazo?: string | null
          retido?: string | null
          tecnologia_acesso?: string | null
          tempo_repetida?: number | null
          tmr?: number | null
          tmr_real?: number | null
          uf?: string | null
          updated_at?: string | null
        }
        Update: {
          causa_ofensora_n1?: string | null
          causa_ofensora_n2?: string | null
          causa_ofensora_n3?: string | null
          chave_reparo?: string | null
          cldv?: number | null
          cliente?: string | null
          created_at?: string | null
          data_abertura?: string | null
          data_fechamento?: string | null
          designacao?: string | null
          faixa_repetida?: string | null
          id?: string
          municipio?: string | null
          posto_anterior?: string | null
          posto_encerramento?: string | null
          posto_prazo?: string | null
          produto?: string | null
          protocolo?: string | null
          rep?: string | null
          reparo_prazo?: string | null
          retido?: string | null
          tecnologia_acesso?: string | null
          tempo_repetida?: number | null
          tmr?: number | null
          tmr_real?: number | null
          uf?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      inventory_base: {
        Row: {
          codigo_material: string | null
          coordenador: string | null
          created_at: string | null
          id: string
          matricula_tt: string
          modelo: string | null
          nome_tecnico: string
          serial: string
          setor: string | null
          supervisor: string | null
        }
        Insert: {
          codigo_material?: string | null
          coordenador?: string | null
          created_at?: string | null
          id?: string
          matricula_tt: string
          modelo?: string | null
          nome_tecnico: string
          serial: string
          setor?: string | null
          supervisor?: string | null
        }
        Update: {
          codigo_material?: string | null
          coordenador?: string | null
          created_at?: string | null
          id?: string
          matricula_tt?: string
          modelo?: string | null
          nome_tecnico?: string
          serial?: string
          setor?: string | null
          supervisor?: string | null
        }
        Relationships: []
      }
      inventory_submission_items: {
        Row: {
          codigo_material: string | null
          created_at: string | null
          id: string
          modelo: string | null
          serial: string
          status: string
          submission_id: string | null
        }
        Insert: {
          codigo_material?: string | null
          created_at?: string | null
          id?: string
          modelo?: string | null
          serial: string
          status: string
          submission_id?: string | null
        }
        Update: {
          codigo_material?: string | null
          created_at?: string | null
          id?: string
          modelo?: string | null
          serial?: string
          status?: string
          submission_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_submission_items_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "inventory_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_submissions: {
        Row: {
          coordenador: string | null
          data_fim: string | null
          data_inicio: string | null
          id: string
          matricula_tt: string
          nome_tecnico: string
          status: string | null
          supervisor: string | null
          user_id: string | null
        }
        Insert: {
          coordenador?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          id?: string
          matricula_tt: string
          nome_tecnico: string
          status?: string | null
          supervisor?: string | null
          user_id?: string | null
        }
        Update: {
          coordenador?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          id?: string
          matricula_tt?: string
          nome_tecnico?: string
          status?: string | null
          supervisor?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      materiais_cadastro: {
        Row: {
          codigo: string
          created_at: string
          id: string
          nome_material: string
          uploaded_by: string
        }
        Insert: {
          codigo: string
          created_at?: string
          id?: string
          nome_material: string
          uploaded_by: string
        }
        Update: {
          codigo?: string
          created_at?: string
          id?: string
          nome_material?: string
          uploaded_by?: string
        }
        Relationships: []
      }
      materiais_inventario: {
        Row: {
          codigo: string
          created_at: string
          id: string
          nome_material: string
          segmento: string
        }
        Insert: {
          codigo: string
          created_at?: string
          id?: string
          nome_material: string
          segmento?: string
        }
        Update: {
          codigo?: string
          created_at?: string
          id?: string
          nome_material?: string
          segmento?: string
        }
        Relationships: []
      }
      material_coleta_items: {
        Row: {
          codigo_material: string
          coleta_id: string
          created_at: string
          id: string
          nome_material: string
          quantidade: number
          serial: string | null
          unidade: string
        }
        Insert: {
          codigo_material: string
          coleta_id: string
          created_at?: string
          id?: string
          nome_material: string
          quantidade?: number
          serial?: string | null
          unidade?: string
        }
        Update: {
          codigo_material?: string
          coleta_id?: string
          created_at?: string
          id?: string
          nome_material?: string
          quantidade?: number
          serial?: string | null
          unidade?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_coleta_items_coleta_id_fkey"
            columns: ["coleta_id"]
            isOneToOne: false
            referencedRelation: "material_coletas"
            referencedColumns: ["id"]
          },
        ]
      }
      material_coletas: {
        Row: {
          almox_edit_done: boolean | null
          assinatura_almoxarifado: string | null
          assinatura_colaborador: string | null
          atividade: string
          ba: string | null
          cidade: string | null
          circuito: string | null
          circuito_compartilhado: string | null
          classificacao_cenario: string | null
          created_at: string
          data_execucao: string
          edit_request_reason: string | null
          edit_requested: boolean
          edit_requested_at: string | null
          edit_unlocked: boolean
          edit_unlocked_at: string | null
          edit_unlocked_by: string | null
          foto_url: string | null
          id: string
          last_exported_at: string | null
          local_retirada: string | null
          matricula_tt: string | null
          nome_tecnico: string
          opcoes_adicionais: string | null
          pdf_url: string | null
          post_edit_locked: boolean
          sigla_cidade: string | null
          tipo_aplicacao: string
          uf: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          almox_edit_done?: boolean | null
          assinatura_almoxarifado?: string | null
          assinatura_colaborador?: string | null
          atividade: string
          ba?: string | null
          cidade?: string | null
          circuito?: string | null
          circuito_compartilhado?: string | null
          classificacao_cenario?: string | null
          created_at?: string
          data_execucao?: string
          edit_request_reason?: string | null
          edit_requested?: boolean
          edit_requested_at?: string | null
          edit_unlocked?: boolean
          edit_unlocked_at?: string | null
          edit_unlocked_by?: string | null
          foto_url?: string | null
          id?: string
          last_exported_at?: string | null
          local_retirada?: string | null
          matricula_tt?: string | null
          nome_tecnico: string
          opcoes_adicionais?: string | null
          pdf_url?: string | null
          post_edit_locked?: boolean
          sigla_cidade?: string | null
          tipo_aplicacao: string
          uf?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          almox_edit_done?: boolean | null
          assinatura_almoxarifado?: string | null
          assinatura_colaborador?: string | null
          atividade?: string
          ba?: string | null
          cidade?: string | null
          circuito?: string | null
          circuito_compartilhado?: string | null
          classificacao_cenario?: string | null
          created_at?: string
          data_execucao?: string
          edit_request_reason?: string | null
          edit_requested?: boolean
          edit_requested_at?: string | null
          edit_unlocked?: boolean
          edit_unlocked_at?: string | null
          edit_unlocked_by?: string | null
          foto_url?: string | null
          id?: string
          last_exported_at?: string | null
          local_retirada?: string | null
          matricula_tt?: string | null
          nome_tecnico?: string
          opcoes_adicionais?: string | null
          pdf_url?: string | null
          post_edit_locked?: boolean
          sigla_cidade?: string | null
          tipo_aplicacao?: string
          uf?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      module_ideas: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          idea_type: string
          module_name: string
          status: string
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          idea_type: string
          module_name: string
          status: string
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          idea_type?: string
          module_name?: string
          status?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      powerbi_links: {
        Row: {
          ativo: boolean | null
          created_at: string
          descricao: string | null
          icone: string | null
          id: string
          ordem: number | null
          titulo: string
          url: string
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string
          descricao?: string | null
          icone?: string | null
          id?: string
          ordem?: number | null
          titulo: string
          url: string
        }
        Update: {
          ativo?: boolean | null
          created_at?: string
          descricao?: string | null
          icone?: string | null
          id?: string
          ordem?: number | null
          titulo?: string
          url?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          area: string | null
          cargo: string | null
          created_at: string
          email: string | null
          empresa: string | null
          id: string
          matricula: string
          must_change_password: boolean
          nome: string
          requested_password: string | null
          reset_password_pending: boolean
          status: string
          telefone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          area?: string | null
          cargo?: string | null
          created_at?: string
          email?: string | null
          empresa?: string | null
          id?: string
          matricula: string
          must_change_password?: boolean
          nome: string
          requested_password?: string | null
          reset_password_pending?: boolean
          status?: string
          telefone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          area?: string | null
          cargo?: string | null
          created_at?: string
          email?: string | null
          empresa?: string | null
          id?: string
          matricula?: string
          must_change_password?: boolean
          nome?: string
          requested_password?: string | null
          reset_password_pending?: boolean
          status?: string
          telefone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      raw_b2b: {
        Row: {
          causa_ofensora_n1: string | null
          causa_ofensora_n2: string | null
          causa_ofensora_n3: string | null
          cldv: number | null
          cliente: string | null
          created_at: string | null
          data_abertura: string | null
          data_fechamento: string | null
          designacao: string | null
          id: string
          municipio: string | null
          posto_anterior: string | null
          posto_encerramento: string | null
          produto: string | null
          protocolo: string | null
          tecnologia_acesso: string | null
          uf: string | null
        }
        Insert: {
          causa_ofensora_n1?: string | null
          causa_ofensora_n2?: string | null
          causa_ofensora_n3?: string | null
          cldv?: number | null
          cliente?: string | null
          created_at?: string | null
          data_abertura?: string | null
          data_fechamento?: string | null
          designacao?: string | null
          id?: string
          municipio?: string | null
          posto_anterior?: string | null
          posto_encerramento?: string | null
          produto?: string | null
          protocolo?: string | null
          tecnologia_acesso?: string | null
          uf?: string | null
        }
        Update: {
          causa_ofensora_n1?: string | null
          causa_ofensora_n2?: string | null
          causa_ofensora_n3?: string | null
          cldv?: number | null
          cliente?: string | null
          created_at?: string | null
          data_abertura?: string | null
          data_fechamento?: string | null
          designacao?: string | null
          id?: string
          municipio?: string | null
          posto_anterior?: string | null
          posto_encerramento?: string | null
          produto?: string | null
          protocolo?: string | null
          tecnologia_acesso?: string | null
          uf?: string | null
        }
        Relationships: []
      }
      raw_vip_prazo: {
        Row: {
          circuito: string | null
          created_at: string | null
          id: string
          posto_prazo: string | null
          reparo_prazo: string | null
        }
        Insert: {
          circuito?: string | null
          created_at?: string | null
          id?: string
          posto_prazo?: string | null
          reparo_prazo?: string | null
        }
        Update: {
          circuito?: string | null
          created_at?: string | null
          id?: string
          posto_prazo?: string | null
          reparo_prazo?: string | null
        }
        Relationships: []
      }
      raw_vip_repetida: {
        Row: {
          circuito: string | null
          created_at: string | null
          faixa_repetida: string | null
          id: string
          rep: string | null
          retido: string | null
          tempo_repetida: number | null
        }
        Insert: {
          circuito?: string | null
          created_at?: string | null
          faixa_repetida?: string | null
          id?: string
          rep?: string | null
          retido?: string | null
          tempo_repetida?: number | null
        }
        Update: {
          circuito?: string | null
          created_at?: string | null
          faixa_repetida?: string | null
          id?: string
          rep?: string | null
          retido?: string | null
          tempo_repetida?: number | null
        }
        Relationships: []
      }
      raw_vip_tmr: {
        Row: {
          circuito: string | null
          created_at: string | null
          id: string
          tmr: number | null
          tmr_pend_oi: number | null
          tmr_pend_vtal: number | null
        }
        Insert: {
          circuito?: string | null
          created_at?: string | null
          id?: string
          tmr?: number | null
          tmr_pend_oi?: number | null
          tmr_pend_vtal?: number | null
        }
        Update: {
          circuito?: string | null
          created_at?: string | null
          id?: string
          tmr?: number | null
          tmr_pend_oi?: number | null
          tmr_pend_vtal?: number | null
        }
        Relationships: []
      }
      reagenda_history: {
        Row: {
          contato: string
          contato2: string | null
          contato3: string | null
          created_at: string
          data_agendamento: string | null
          data_nova: string | null
          data_original_formatada: string | null
          decisao: string
          deleted_by_user: boolean
          horario: string
          id: string
          is_manual_status: boolean
          last_contacted_at: string | null
          nome: string
          operadora: string | null
          periodo: string
          sa: string | null
          selecionado: boolean
          setor: string | null
          status: string
          tipo_atividade: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          contato: string
          contato2?: string | null
          contato3?: string | null
          created_at?: string
          data_agendamento?: string | null
          data_nova?: string | null
          data_original_formatada?: string | null
          decisao?: string
          deleted_by_user?: boolean
          horario?: string
          id?: string
          is_manual_status?: boolean
          last_contacted_at?: string | null
          nome: string
          operadora?: string | null
          periodo?: string
          sa?: string | null
          selecionado?: boolean
          setor?: string | null
          status?: string
          tipo_atividade?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          contato?: string
          contato2?: string | null
          contato3?: string | null
          created_at?: string
          data_agendamento?: string | null
          data_nova?: string | null
          data_original_formatada?: string | null
          decisao?: string
          deleted_by_user?: boolean
          horario?: string
          id?: string
          is_manual_status?: boolean
          last_contacted_at?: string | null
          nome?: string
          operadora?: string | null
          periodo?: string
          sa?: string | null
          selecionado?: boolean
          setor?: string | null
          status?: string
          tipo_atividade?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tecnicos_cadastro: {
        Row: {
          cidade_residencia: string | null
          coordenador: string | null
          created_at: string
          id: string
          nome_empresa: string | null
          nome_tecnico: string
          re: string | null
          supervisor: string | null
          telefone: string | null
          tr: string | null
          tt: string | null
          uploaded_by: string
        }
        Insert: {
          cidade_residencia?: string | null
          coordenador?: string | null
          created_at?: string
          id?: string
          nome_empresa?: string | null
          nome_tecnico: string
          re?: string | null
          supervisor?: string | null
          telefone?: string | null
          tr?: string | null
          tt?: string | null
          uploaded_by: string
        }
        Update: {
          cidade_residencia?: string | null
          coordenador?: string | null
          created_at?: string
          id?: string
          nome_empresa?: string | null
          nome_tecnico?: string
          re?: string | null
          supervisor?: string | null
          telefone?: string | null
          tr?: string | null
          tt?: string | null
          uploaded_by?: string
        }
        Relationships: []
      }
      tecnicos_indicadores: {
        Row: {
          created_at: string
          dias_trabalhados: number | null
          eficacia: number | null
          id: string
          infancia_chamados_30d: number | null
          infancia_instaladas: number | null
          infancia_pct: number | null
          lote_importacao: string | null
          mes_referencia: string
          produtividade: number | null
          repetida_entrantes: number | null
          repetida_pct: number | null
          repetida_repetiu: number | null
          tt: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          dias_trabalhados?: number | null
          eficacia?: number | null
          id?: string
          infancia_chamados_30d?: number | null
          infancia_instaladas?: number | null
          infancia_pct?: number | null
          lote_importacao?: string | null
          mes_referencia?: string
          produtividade?: number | null
          repetida_entrantes?: number | null
          repetida_pct?: number | null
          repetida_repetiu?: number | null
          tt: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          dias_trabalhados?: number | null
          eficacia?: number | null
          id?: string
          infancia_chamados_30d?: number | null
          infancia_instaladas?: number | null
          infancia_pct?: number | null
          lote_importacao?: string | null
          mes_referencia?: string
          produtividade?: number | null
          repetida_entrantes?: number | null
          repetida_pct?: number | null
          repetida_repetiu?: number | null
          tt?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      tecnicos_presenca: {
        Row: {
          coordenador: string | null
          funcionario: string | null
          id: string
          operadora: string | null
          setor_atual: string | null
          setor_origem: string | null
          status: string | null
          supervisor: string | null
          tr: string | null
          tt: string | null
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          coordenador?: string | null
          funcionario?: string | null
          id?: string
          operadora?: string | null
          setor_atual?: string | null
          setor_origem?: string | null
          status?: string | null
          supervisor?: string | null
          tr?: string | null
          tt?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          coordenador?: string | null
          funcionario?: string | null
          id?: string
          operadora?: string | null
          setor_atual?: string | null
          setor_origem?: string | null
          status?: string | null
          supervisor?: string | null
          tr?: string | null
          tt?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      user_presence: {
        Row: {
          current_page: string | null
          last_seen_at: string
          user_id: string
        }
        Insert: {
          current_page?: string | null
          last_seen_at?: string
          user_id: string
        }
        Update: {
          current_page?: string | null
          last_seen_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      visitas: {
        Row: {
          assinatura_digital: string | null
          created_at: string
          data_visita: string
          id: string
          local: string
          observacoes: string | null
          status: string
          supervisor_id: string
          updated_at: string
        }
        Insert: {
          assinatura_digital?: string | null
          created_at?: string
          data_visita?: string
          id?: string
          local: string
          observacoes?: string | null
          status?: string
          supervisor_id: string
          updated_at?: string
        }
        Update: {
          assinatura_digital?: string | null
          created_at?: string
          data_visita?: string
          id?: string
          local?: string
          observacoes?: string | null
          status?: string
          supervisor_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      vistoria_evolucao: {
        Row: {
          created_at: string
          data_revisita: string
          eficacia_anterior: string | null
          eficacia_atual: string | null
          id: string
          infancia_anterior: string | null
          infancia_atual: string | null
          observacoes: string | null
          produtividade_anterior: string | null
          produtividade_atual: string | null
          repetida_anterior: string | null
          repetida_atual: string | null
          tecnico_re: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data_revisita?: string
          eficacia_anterior?: string | null
          eficacia_atual?: string | null
          id?: string
          infancia_anterior?: string | null
          infancia_atual?: string | null
          observacoes?: string | null
          produtividade_anterior?: string | null
          produtividade_atual?: string | null
          repetida_anterior?: string | null
          repetida_atual?: string | null
          tecnico_re: string
          user_id: string
        }
        Update: {
          created_at?: string
          data_revisita?: string
          eficacia_anterior?: string | null
          eficacia_atual?: string | null
          id?: string
          infancia_anterior?: string | null
          infancia_atual?: string | null
          observacoes?: string | null
          produtividade_anterior?: string | null
          produtividade_atual?: string | null
          repetida_anterior?: string | null
          repetida_atual?: string | null
          tecnico_re?: string
          user_id?: string
        }
        Relationships: []
      }
      vistorias_campo: {
        Row: {
          assinatura_supervisor: string | null
          assinatura_tecnico: string | null
          avaliacao_qualidade: Json | null
          created_at: string
          ferramentas_faltantes: Json | null
          foto_equipamentos_url: string | null
          foto_execucao_url: string | null
          foto_supervisor_url: string | null
          foto_uniforme_url: string | null
          id: string
          indicador_dias_trabalhados: string | null
          indicador_eficacia: string | null
          indicador_infancia: string | null
          indicador_produtividade: string | null
          indicador_repetida: string | null
          nome_tecnico: string | null
          observacoes: string | null
          supervisor_tecnico: string | null
          tecnico_re: string | null
          tecnico_tt: string | null
          uniformes_faltantes: Json | null
          user_id: string | null
        }
        Insert: {
          assinatura_supervisor?: string | null
          assinatura_tecnico?: string | null
          avaliacao_qualidade?: Json | null
          created_at?: string
          ferramentas_faltantes?: Json | null
          foto_equipamentos_url?: string | null
          foto_execucao_url?: string | null
          foto_supervisor_url?: string | null
          foto_uniforme_url?: string | null
          id?: string
          indicador_dias_trabalhados?: string | null
          indicador_eficacia?: string | null
          indicador_infancia?: string | null
          indicador_produtividade?: string | null
          indicador_repetida?: string | null
          nome_tecnico?: string | null
          observacoes?: string | null
          supervisor_tecnico?: string | null
          tecnico_re?: string | null
          tecnico_tt?: string | null
          uniformes_faltantes?: Json | null
          user_id?: string | null
        }
        Update: {
          assinatura_supervisor?: string | null
          assinatura_tecnico?: string | null
          avaliacao_qualidade?: Json | null
          created_at?: string
          ferramentas_faltantes?: Json | null
          foto_equipamentos_url?: string | null
          foto_execucao_url?: string | null
          foto_supervisor_url?: string | null
          foto_uniforme_url?: string | null
          id?: string
          indicador_dias_trabalhados?: string | null
          indicador_eficacia?: string | null
          indicador_infancia?: string | null
          indicador_produtividade?: string | null
          indicador_repetida?: string | null
          nome_tecnico?: string | null
          observacoes?: string | null
          supervisor_tecnico?: string | null
          tecnico_re?: string | null
          tecnico_tt?: string | null
          uniformes_faltantes?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      clear_raw_tables: { Args: never; Returns: undefined }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      material_coleta_has_items: {
        Args: { _coleta_id: string }
        Returns: boolean
      }
      process_bi_etl: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
