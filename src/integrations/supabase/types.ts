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
      app_settings: {
        Row: {
          created_at: string
          default_interest_percent: number
          default_late_fee_percent: number
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_interest_percent?: number
          default_late_fee_percent?: number
          id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_interest_percent?: number
          default_late_fee_percent?: number
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          category: string | null
          created_at: string
          file_name: string
          file_type: string | null
          file_url: string
          id: string
          tenant_id: string
          title: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          file_name: string
          file_type?: string | null
          file_url: string
          id?: string
          tenant_id: string
          title?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          file_name?: string
          file_type?: string | null
          file_url?: string
          id?: string
          tenant_id?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number | null
          created_at: string
          id: string
          interest_percent: number | null
          late_fee_percent: number | null
          month: number
          paid_at: string | null
          status: string
          tenant_id: string
          year: number
        }
        Insert: {
          amount?: number | null
          created_at?: string
          id?: string
          interest_percent?: number | null
          late_fee_percent?: number | null
          month: number
          paid_at?: string | null
          status?: string
          tenant_id: string
          year: number
        }
        Update: {
          amount?: number | null
          created_at?: string
          id?: string
          interest_percent?: number | null
          late_fee_percent?: number | null
          month?: number
          paid_at?: string | null
          status?: string
          tenant_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      properties: {
        Row: {
          address: string
          created_at: string
          id: string
          name: string | null
          updated_at: string
        }
        Insert: {
          address: string
          created_at?: string
          id?: string
          name?: string | null
          updated_at?: string
        }
        Update: {
          address?: string
          created_at?: string
          id?: string
          name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tenants: {
        Row: {
          cpf: string | null
          created_at: string
          default_interest_percent: number | null
          default_late_fee_percent: number | null
          deposit: number | null
          entry_date: string | null
          exit_date: string | null
          house_number: string | null
          id: string
          name: string
          notes: string | null
          payment_cycle: string | null
          payment_day: number | null
          phone: string | null
          property_id: string | null
          rent_amount: number
          status: string
          updated_at: string
        }
        Insert: {
          cpf?: string | null
          created_at?: string
          default_interest_percent?: number | null
          default_late_fee_percent?: number | null
          deposit?: number | null
          entry_date?: string | null
          exit_date?: string | null
          house_number?: string | null
          id?: string
          name: string
          notes?: string | null
          payment_cycle?: string | null
          payment_day?: number | null
          phone?: string | null
          property_id?: string | null
          rent_amount?: number
          status?: string
          updated_at?: string
        }
        Update: {
          cpf?: string | null
          created_at?: string
          default_interest_percent?: number | null
          default_late_fee_percent?: number | null
          deposit?: number | null
          entry_date?: string | null
          exit_date?: string | null
          house_number?: string | null
          id?: string
          name?: string
          notes?: string | null
          payment_cycle?: string | null
          payment_day?: number | null
          phone?: string | null
          property_id?: string | null
          rent_amount?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenants_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_config: {
        Row: {
          auto_approve_payments: boolean
          auto_approve_profile: boolean
          auto_send_receipt: boolean
          business_phone: string | null
          connection_status: string
          created_at: string
          id: string
          last_status_check: string | null
          last_webhook_at: string | null
          phone_number_id: string | null
          provider: string
          qr_code: string | null
          updated_at: string
          webhook_verified: boolean
        }
        Insert: {
          auto_approve_payments?: boolean
          auto_approve_profile?: boolean
          auto_send_receipt?: boolean
          business_phone?: string | null
          connection_status?: string
          created_at?: string
          id?: string
          last_status_check?: string | null
          last_webhook_at?: string | null
          phone_number_id?: string | null
          provider?: string
          qr_code?: string | null
          updated_at?: string
          webhook_verified?: boolean
        }
        Update: {
          auto_approve_payments?: boolean
          auto_approve_profile?: boolean
          auto_send_receipt?: boolean
          business_phone?: string | null
          connection_status?: string
          created_at?: string
          id?: string
          last_status_check?: string | null
          last_webhook_at?: string | null
          phone_number_id?: string | null
          provider?: string
          qr_code?: string | null
          updated_at?: string
          webhook_verified?: boolean
        }
        Relationships: []
      }
      whatsapp_messages: {
        Row: {
          ai_confidence: number | null
          ai_extracted: Json | null
          body: string | null
          created_at: string
          direction: string
          from_phone: string
          id: string
          media_mime_type: string | null
          media_url: string | null
          message_type: string
          processed: boolean
          raw_payload: Json | null
          received_at: string
          tenant_id: string | null
          to_phone: string | null
          wa_message_id: string | null
        }
        Insert: {
          ai_confidence?: number | null
          ai_extracted?: Json | null
          body?: string | null
          created_at?: string
          direction: string
          from_phone: string
          id?: string
          media_mime_type?: string | null
          media_url?: string | null
          message_type?: string
          processed?: boolean
          raw_payload?: Json | null
          received_at?: string
          tenant_id?: string | null
          to_phone?: string | null
          wa_message_id?: string | null
        }
        Update: {
          ai_confidence?: number | null
          ai_extracted?: Json | null
          body?: string | null
          created_at?: string
          direction?: string
          from_phone?: string
          id?: string
          media_mime_type?: string | null
          media_url?: string | null
          message_type?: string
          processed?: boolean
          raw_payload?: Json | null
          received_at?: string
          tenant_id?: string | null
          to_phone?: string | null
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_pending_actions: {
        Row: {
          action_type: string
          confidence: number | null
          created_at: string
          id: string
          message_id: string | null
          notes: string | null
          proposed_data: Json
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          action_type: string
          confidence?: number | null
          created_at?: string
          id?: string
          message_id?: string | null
          notes?: string | null
          proposed_data: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          action_type?: string
          confidence?: number | null
          created_at?: string
          id?: string
          message_id?: string | null
          notes?: string | null
          proposed_data?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_pending_actions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_pending_actions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
