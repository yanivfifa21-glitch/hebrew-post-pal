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
      ad_center_products: {
        Row: {
          affiliate_link: string | null
          campaign_id: string | null
          category: string | null
          commission_rate: number | null
          created_at: string | null
          discount_percent: number | null
          fetched_at: string | null
          id: string
          image_url: string | null
          original_price: number | null
          price: number | null
          product_id: string
          product_url: string | null
          rating: number | null
          sales_count: number | null
          source: string | null
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          affiliate_link?: string | null
          campaign_id?: string | null
          category?: string | null
          commission_rate?: number | null
          created_at?: string | null
          discount_percent?: number | null
          fetched_at?: string | null
          id?: string
          image_url?: string | null
          original_price?: number | null
          price?: number | null
          product_id: string
          product_url?: string | null
          rating?: number | null
          sales_count?: number | null
          source?: string | null
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          affiliate_link?: string | null
          campaign_id?: string | null
          category?: string | null
          commission_rate?: number | null
          created_at?: string | null
          discount_percent?: number | null
          fetched_at?: string | null
          id?: string
          image_url?: string | null
          original_price?: number | null
          price?: number | null
          product_id?: string
          product_url?: string | null
          rating?: number | null
          sales_count?: number | null
          source?: string | null
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_center_products_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "affiliate_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_campaigns: {
        Row: {
          banner_url: string | null
          campaign_id: string | null
          campaign_name: string
          commission_rate: number | null
          created_at: string | null
          fetched_at: string | null
          id: string
          is_active: boolean | null
          landing_page_url: string | null
          promo_desc: string | null
          source: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          banner_url?: string | null
          campaign_id?: string | null
          campaign_name: string
          commission_rate?: number | null
          created_at?: string | null
          fetched_at?: string | null
          id?: string
          is_active?: boolean | null
          landing_page_url?: string | null
          promo_desc?: string | null
          source?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          banner_url?: string | null
          campaign_id?: string | null
          campaign_name?: string
          commission_rate?: number | null
          created_at?: string | null
          fetched_at?: string | null
          id?: string
          is_active?: boolean | null
          landing_page_url?: string | null
          promo_desc?: string | null
          source?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          affiliate_params: Json | null
          ai_rewrite_template: string | null
          aliexpress_tracking_id: string | null
          automation_enabled: boolean | null
          created_at: string
          custom_ai_prompt: string | null
          default_auto_approve: boolean
          id: string
          interval_end_time: string | null
          interval_start_time: string | null
          last_bulk_stock_check: string | null
          listener_api_url: string | null
          openai_api_key: string | null
          posting_interval_hours: number | null
          posting_interval_minutes: number | null
          posting_times: string[] | null
          publishing_days: number[] | null
          shabbat_end_time: string | null
          shabbat_mode_enabled: boolean | null
          shabbat_start_time: string | null
          stock_check_before_publish: boolean
          stock_check_interval_hours: number
          stock_check_scheduled: boolean
          telegram_chat_id: string | null
          telegram_enabled: boolean | null
          telegram_interval_end_time: string | null
          telegram_interval_minutes: number | null
          telegram_interval_start_time: string | null
          updated_at: string
          usd_exchange_rate: number | null
          use_custom_emoji: boolean | null
          user_id: string
          whatsapp_enabled: boolean | null
          whatsapp_interval_end_time: string | null
          whatsapp_interval_minutes: number | null
          whatsapp_interval_start_time: string | null
        }
        Insert: {
          affiliate_params?: Json | null
          ai_rewrite_template?: string | null
          aliexpress_tracking_id?: string | null
          automation_enabled?: boolean | null
          created_at?: string
          custom_ai_prompt?: string | null
          default_auto_approve?: boolean
          id?: string
          interval_end_time?: string | null
          interval_start_time?: string | null
          last_bulk_stock_check?: string | null
          listener_api_url?: string | null
          openai_api_key?: string | null
          posting_interval_hours?: number | null
          posting_interval_minutes?: number | null
          posting_times?: string[] | null
          publishing_days?: number[] | null
          shabbat_end_time?: string | null
          shabbat_mode_enabled?: boolean | null
          shabbat_start_time?: string | null
          stock_check_before_publish?: boolean
          stock_check_interval_hours?: number
          stock_check_scheduled?: boolean
          telegram_chat_id?: string | null
          telegram_enabled?: boolean | null
          telegram_interval_end_time?: string | null
          telegram_interval_minutes?: number | null
          telegram_interval_start_time?: string | null
          updated_at?: string
          usd_exchange_rate?: number | null
          use_custom_emoji?: boolean | null
          user_id: string
          whatsapp_enabled?: boolean | null
          whatsapp_interval_end_time?: string | null
          whatsapp_interval_minutes?: number | null
          whatsapp_interval_start_time?: string | null
        }
        Update: {
          affiliate_params?: Json | null
          ai_rewrite_template?: string | null
          aliexpress_tracking_id?: string | null
          automation_enabled?: boolean | null
          created_at?: string
          custom_ai_prompt?: string | null
          default_auto_approve?: boolean
          id?: string
          interval_end_time?: string | null
          interval_start_time?: string | null
          last_bulk_stock_check?: string | null
          listener_api_url?: string | null
          openai_api_key?: string | null
          posting_interval_hours?: number | null
          posting_interval_minutes?: number | null
          posting_times?: string[] | null
          publishing_days?: number[] | null
          shabbat_end_time?: string | null
          shabbat_mode_enabled?: boolean | null
          shabbat_start_time?: string | null
          stock_check_before_publish?: boolean
          stock_check_interval_hours?: number
          stock_check_scheduled?: boolean
          telegram_chat_id?: string | null
          telegram_enabled?: boolean | null
          telegram_interval_end_time?: string | null
          telegram_interval_minutes?: number | null
          telegram_interval_start_time?: string | null
          updated_at?: string
          usd_exchange_rate?: number | null
          use_custom_emoji?: boolean | null
          user_id?: string
          whatsapp_enabled?: boolean | null
          whatsapp_interval_end_time?: string | null
          whatsapp_interval_minutes?: number | null
          whatsapp_interval_start_time?: string | null
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
      captured_posts: {
        Row: {
          captured_at: string
          id: string
          image_url: string | null
          media_type: string | null
          modified_text: string | null
          modified_url: string | null
          original_text: string | null
          original_url: string | null
          product_id: string | null
          reviewed_at: string | null
          source_group_id: string | null
          status: string
          user_id: string
        }
        Insert: {
          captured_at?: string
          id?: string
          image_url?: string | null
          media_type?: string | null
          modified_text?: string | null
          modified_url?: string | null
          original_text?: string | null
          original_url?: string | null
          product_id?: string | null
          reviewed_at?: string | null
          source_group_id?: string | null
          status?: string
          user_id: string
        }
        Update: {
          captured_at?: string
          id?: string
          image_url?: string | null
          media_type?: string | null
          modified_text?: string | null
          modified_url?: string | null
          original_text?: string | null
          original_url?: string | null
          product_id?: string | null
          reviewed_at?: string | null
          source_group_id?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "captured_posts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "captured_posts_source_group_id_fkey"
            columns: ["source_group_id"]
            isOneToOne: false
            referencedRelation: "relay_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_campaigns: {
        Row: {
          coupons: Json
          created_at: string
          exchange_rate: number
          id: string
          is_active: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          coupons?: Json
          created_at?: string
          exchange_rate?: number
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          coupons?: Json
          created_at?: string
          exchange_rate?: number
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      custom_emoji_mappings: {
        Row: {
          created_at: string
          custom_emoji_id: string
          emoji: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          custom_emoji_id: string
          emoji: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          custom_emoji_id?: string
          emoji?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      encryption_config: {
        Row: {
          created_at: string | null
          id: number
          key_value: string | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          key_value?: string | null
        }
        Update: {
          created_at?: string | null
          id?: number
          key_value?: string | null
        }
        Relationships: []
      }
      gold_posts: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          last_sent_date: string | null
          media_type: string | null
          media_url: string | null
          message: string
          send_time: string
          target_account_ids: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          last_sent_date?: string | null
          media_type?: string | null
          media_url?: string | null
          message?: string
          send_time?: string
          target_account_ids?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          last_sent_date?: string | null
          media_type?: string | null
          media_url?: string | null
          message?: string
          send_time?: string
          target_account_ids?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      manual_queue: {
        Row: {
          created_at: string
          id: string
          media_type: string | null
          media_url: string | null
          message: string | null
          sent_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          media_type?: string | null
          media_url?: string | null
          message?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          media_type?: string | null
          media_url?: string | null
          message?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
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
          auto_disabled: boolean
          channels: string[] | null
          created_at: string
          hebrew_description: string | null
          id: string
          image_url: string | null
          last_stock_check: string | null
          media_type: string | null
          orders_count: number | null
          original_url: string
          price: number | null
          rating: number | null
          scheduled_time: string | null
          sent_via: string | null
          status: string
          stock_check_count: number
          stock_status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          affiliate_link?: string | null
          auto_disabled?: boolean
          channels?: string[] | null
          created_at?: string
          hebrew_description?: string | null
          id?: string
          image_url?: string | null
          last_stock_check?: string | null
          media_type?: string | null
          orders_count?: number | null
          original_url: string
          price?: number | null
          rating?: number | null
          scheduled_time?: string | null
          sent_via?: string | null
          status?: string
          stock_check_count?: number
          stock_status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          affiliate_link?: string | null
          auto_disabled?: boolean
          channels?: string[] | null
          created_at?: string
          hebrew_description?: string | null
          id?: string
          image_url?: string | null
          last_stock_check?: string | null
          media_type?: string | null
          orders_count?: number | null
          original_url?: string
          price?: number | null
          rating?: number | null
          scheduled_time?: string | null
          sent_via?: string | null
          status?: string
          stock_check_count?: number
          stock_status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      relay_groups: {
        Row: {
          auto_approve: boolean
          bot_token: string | null
          captured_count: number
          created_at: string
          group_name: string
          id: string
          is_active: boolean
          rewrite_mode: string
          telegram_group_id: string
          text_template_append: string | null
          text_template_prepend: string | null
          updated_at: string
          user_id: string
          webhook_active: boolean
        }
        Insert: {
          auto_approve?: boolean
          bot_token?: string | null
          captured_count?: number
          created_at?: string
          group_name: string
          id?: string
          is_active?: boolean
          rewrite_mode?: string
          telegram_group_id: string
          text_template_append?: string | null
          text_template_prepend?: string | null
          updated_at?: string
          user_id: string
          webhook_active?: boolean
        }
        Update: {
          auto_approve?: boolean
          bot_token?: string | null
          captured_count?: number
          created_at?: string
          group_name?: string
          id?: string
          is_active?: boolean
          rewrite_mode?: string
          telegram_group_id?: string
          text_template_append?: string | null
          text_template_prepend?: string | null
          updated_at?: string
          user_id?: string
          webhook_active?: boolean
        }
        Relationships: []
      }
      user_credentials: {
        Row: {
          created_at: string | null
          encrypted_aliexpress_app_key: string | null
          encrypted_aliexpress_app_secret: string | null
          encrypted_greenapi_api_token: string | null
          encrypted_telegram_bot_token: string | null
          greenapi_chat_id: string | null
          greenapi_instance_id: string | null
          id: string
          telegram_chat_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          encrypted_aliexpress_app_key?: string | null
          encrypted_aliexpress_app_secret?: string | null
          encrypted_greenapi_api_token?: string | null
          encrypted_telegram_bot_token?: string | null
          greenapi_chat_id?: string | null
          greenapi_instance_id?: string | null
          id?: string
          telegram_chat_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          encrypted_aliexpress_app_key?: string | null
          encrypted_aliexpress_app_secret?: string | null
          encrypted_greenapi_api_token?: string | null
          encrypted_telegram_bot_token?: string | null
          greenapi_chat_id?: string | null
          greenapi_instance_id?: string | null
          id?: string
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
      zone_accounts: {
        Row: {
          account_id: string
          created_at: string
          id: string
          zone_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          id?: string
          zone_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          id?: string
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "zone_accounts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "messaging_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zone_accounts_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      zone_products: {
        Row: {
          created_at: string
          id: string
          product_id: string
          scheduled_time: string | null
          sent_at: string | null
          status: string
          zone_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          scheduled_time?: string | null
          sent_at?: string | null
          status?: string
          zone_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          scheduled_time?: string | null
          sent_at?: string | null
          status?: string
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "zone_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zone_products_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      zones: {
        Row: {
          created_at: string
          id: string
          interval_end_time: string
          interval_minutes: number
          interval_start_time: string
          is_active: boolean
          last_posted_at: string | null
          name: string
          posting_times: string[] | null
          publishing_days: number[]
          schedule_mode: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          interval_end_time?: string
          interval_minutes?: number
          interval_start_time?: string
          is_active?: boolean
          last_posted_at?: string | null
          name: string
          posting_times?: string[] | null
          publishing_days?: number[]
          schedule_mode?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          interval_end_time?: string
          interval_minutes?: number
          interval_start_time?: string
          is_active?: boolean
          last_posted_at?: string | null
          name?: string
          posting_times?: string[] | null
          publishing_days?: number[]
          schedule_mode?: string
          updated_at?: string
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
      get_decrypted_messaging_account_credentials: {
        Args: { p_account_id: string; p_user_id: string }
        Returns: Json
      }
      get_decrypted_user_credentials: {
        Args: { p_user_id: string }
        Returns: Json
      }
      get_encryption_key: { Args: never; Returns: string }
      get_my_access_status: { Args: never; Returns: string }
      get_my_credentials_status: { Args: never; Returns: Json }
      get_my_messaging_accounts_safe: {
        Args: never
        Returns: {
          account_name: string
          account_type: string
          created_at: string
          has_api_token: boolean
          has_bot_token: boolean
          has_instance_id: boolean
          id: string
          is_active: boolean
          telegram_chat_id: string
          updated_at: string
          whatsapp_chat_id: string
        }[]
      }
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
      set_encryption_key: { Args: { p_key: string }; Returns: undefined }
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
