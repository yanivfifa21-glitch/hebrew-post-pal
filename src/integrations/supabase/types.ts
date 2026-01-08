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
      app_settings: {
        Row: {
          aliexpress_tracking_id: string | null
          automation_enabled: boolean | null
          created_at: string
          custom_ai_prompt: string | null
          id: string
          interval_end_time: string | null
          interval_start_time: string | null
          posting_interval_hours: number | null
          posting_times: string[] | null
          publishing_days: number[] | null
          shabbat_end_time: string | null
          shabbat_mode_enabled: boolean | null
          shabbat_start_time: string | null
          telegram_chat_id: string | null
          telegram_enabled: boolean | null
          updated_at: string
          user_id: string
          whatsapp_enabled: boolean | null
        }
        Insert: {
          aliexpress_tracking_id?: string | null
          automation_enabled?: boolean | null
          created_at?: string
          custom_ai_prompt?: string | null
          id?: string
          interval_end_time?: string | null
          interval_start_time?: string | null
          posting_interval_hours?: number | null
          posting_times?: string[] | null
          publishing_days?: number[] | null
          shabbat_end_time?: string | null
          shabbat_mode_enabled?: boolean | null
          shabbat_start_time?: string | null
          telegram_chat_id?: string | null
          telegram_enabled?: boolean | null
          updated_at?: string
          user_id: string
          whatsapp_enabled?: boolean | null
        }
        Update: {
          aliexpress_tracking_id?: string | null
          automation_enabled?: boolean | null
          created_at?: string
          custom_ai_prompt?: string | null
          id?: string
          interval_end_time?: string | null
          interval_start_time?: string | null
          posting_interval_hours?: number | null
          posting_times?: string[] | null
          publishing_days?: number[] | null
          shabbat_end_time?: string | null
          shabbat_mode_enabled?: boolean | null
          shabbat_start_time?: string | null
          telegram_chat_id?: string | null
          telegram_enabled?: boolean | null
          updated_at?: string
          user_id?: string
          whatsapp_enabled?: boolean | null
        }
        Relationships: []
      }
      authorized_users: {
        Row: {
          created_at: string
          email: string
          id: string
          status: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          status?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          status?: string
        }
        Relationships: []
      }
      automation_logs: {
        Row: {
          context: Json | null
          created_at: string
          id: string
          level: string
          message: string
          run_id: string
          user_id: string
        }
        Insert: {
          context?: Json | null
          created_at?: string
          id?: string
          level?: string
          message: string
          run_id: string
          user_id: string
        }
        Update: {
          context?: Json | null
          created_at?: string
          id?: string
          level?: string
          message?: string
          run_id?: string
          user_id?: string
        }
        Relationships: []
      }
      messaging_accounts: {
        Row: {
          account_name: string
          account_type: string
          created_at: string
          encrypted_api_token: string | null
          encrypted_bot_token: string | null
          encrypted_instance_id: string | null
          id: string
          is_active: boolean
          telegram_chat_id: string | null
          updated_at: string
          user_id: string
          whatsapp_chat_id: string | null
        }
        Insert: {
          account_name: string
          account_type: string
          created_at?: string
          encrypted_api_token?: string | null
          encrypted_bot_token?: string | null
          encrypted_instance_id?: string | null
          id?: string
          is_active?: boolean
          telegram_chat_id?: string | null
          updated_at?: string
          user_id: string
          whatsapp_chat_id?: string | null
        }
        Update: {
          account_name?: string
          account_type?: string
          created_at?: string
          encrypted_api_token?: string | null
          encrypted_bot_token?: string | null
          encrypted_instance_id?: string | null
          id?: string
          is_active?: boolean
          telegram_chat_id?: string | null
          updated_at?: string
          user_id?: string
          whatsapp_chat_id?: string | null
        }
        Relationships: []
      }
      products: {
        Row: {
          affiliate_link: string | null
          channels: string[] | null
          created_at: string
          hebrew_description: string | null
          id: string
          image_url: string | null
          orders_count: number | null
          original_url: string
          price: number | null
          rating: number | null
          scheduled_time: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          affiliate_link?: string | null
          channels?: string[] | null
          created_at?: string
          hebrew_description?: string | null
          id?: string
          image_url?: string | null
          orders_count?: number | null
          original_url: string
          price?: number | null
          rating?: number | null
          scheduled_time?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          affiliate_link?: string | null
          channels?: string[] | null
          created_at?: string
          hebrew_description?: string | null
          id?: string
          image_url?: string | null
          orders_count?: number | null
          original_url?: string
          price?: number | null
          rating?: number | null
          scheduled_time?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_credentials: {
        Row: {
          aliexpress_app_key: string | null
          aliexpress_app_secret: string | null
          created_at: string | null
          greenapi_api_token: string | null
          greenapi_chat_id: string | null
          greenapi_instance_id: string | null
          id: string
          telegram_bot_token: string | null
          telegram_chat_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          aliexpress_app_key?: string | null
          aliexpress_app_secret?: string | null
          created_at?: string | null
          greenapi_api_token?: string | null
          greenapi_chat_id?: string | null
          greenapi_instance_id?: string | null
          id?: string
          telegram_bot_token?: string | null
          telegram_chat_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          aliexpress_app_key?: string | null
          aliexpress_app_secret?: string | null
          created_at?: string | null
          greenapi_api_token?: string | null
          greenapi_chat_id?: string | null
          greenapi_instance_id?: string | null
          id?: string
          telegram_bot_token?: string | null
          telegram_chat_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      decrypt_credential: { Args: { encrypted_data: string }; Returns: string }
      encrypt_credential: { Args: { plain_text: string }; Returns: string }
      get_account_credentials_status: {
        Args: { p_account_id: string }
        Returns: Json
      }
      get_my_access_status: { Args: never; Returns: string }
      get_my_credentials_status: { Args: never; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_admin_email: { Args: never; Returns: boolean }
      is_email_authorized: { Args: { check_email: string }; Returns: boolean }
      is_me_authorized: { Args: never; Returns: boolean }
      update_account_credentials: {
        Args: {
          p_account_id: string
          p_greenapi_api_token?: string
          p_greenapi_chat_id?: string
          p_greenapi_instance_id?: string
          p_telegram_bot_token?: string
          p_telegram_chat_id?: string
        }
        Returns: Json
      }
      update_my_credentials: {
        Args: {
          p_aliexpress_app_key?: string
          p_aliexpress_app_secret?: string
          p_greenapi_api_token?: string
          p_greenapi_chat_id?: string
          p_greenapi_instance_id?: string
          p_telegram_bot_token?: string
          p_telegram_chat_id?: string
        }
        Returns: Json
      }
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
