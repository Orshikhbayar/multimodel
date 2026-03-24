export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1";
  };
  public: {
    Tables: {
      conversations: {
        Row: {
          created_at: string;
          id: string;
          project_id: string | null;
          title: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          project_id?: string | null;
          title?: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          project_id?: string;
          title?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "conversations_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversations_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      credit_ledger_events: {
        Row: {
          amount_int: number;
          amount_usd_int: number;
          billing_bucket: string;
          created_at: string;
          credit_delta_int: number;
          id: string;
          metadata: Json | null;
          provider_reference_id: string | null;
          reference_id: string | null;
          stripe_event_id: string | null;
          stripe_object_id: string | null;
          subject_id: string;
          type: string;
          usage_run_id: string | null;
          usage_value_usd_int: number | null;
          user_id: string;
        };
        Insert: {
          amount_int?: number;
          amount_usd_int?: number;
          billing_bucket?: string;
          created_at?: string;
          credit_delta_int: number;
          id?: string;
          metadata?: Json | null;
          provider_reference_id?: string | null;
          reference_id?: string | null;
          stripe_event_id?: string | null;
          stripe_object_id?: string | null;
          subject_id: string;
          type: string;
          usage_run_id?: string | null;
          usage_value_usd_int?: number | null;
          user_id: string;
        };
        Update: {
          amount_int?: number;
          amount_usd_int?: number;
          billing_bucket?: string;
          created_at?: string;
          credit_delta_int?: number;
          id?: string;
          metadata?: Json | null;
          provider_reference_id?: string | null;
          reference_id?: string | null;
          stripe_event_id?: string | null;
          stripe_object_id?: string | null;
          subject_id?: string;
          type?: string;
          usage_run_id?: string | null;
          usage_value_usd_int?: number | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "credit_ledger_events_usage_run_id_fkey";
            columns: ["usage_run_id"];
            isOneToOne: false;
            referencedRelation: "usage_runs";
            referencedColumns: ["id"];
          },
        ];
      };
      messages: {
        Row: {
          attachments: Json | null;
          content: string;
          conversation_id: string;
          created_at: string;
          edited_at: string | null;
          id: string;
          role: Database["public"]["Enums"]["message_role"];
          tool_calls: Json | null;
        };
        Insert: {
          attachments?: Json | null;
          content: string;
          conversation_id: string;
          created_at?: string;
          edited_at?: string | null;
          id?: string;
          role: Database["public"]["Enums"]["message_role"];
          tool_calls?: Json | null;
        };
        Update: {
          attachments?: Json | null;
          content?: string;
          conversation_id?: string;
          created_at?: string;
          edited_at?: string | null;
          id?: string;
          role?: Database["public"]["Enums"]["message_role"];
          tool_calls?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
        ];
      };
      model_rates: {
        Row: {
          cached_input_usd_per_1m_tokens_int: number | null;
          created_at: string;
          credit_multiplier_basis_points: number | null;
          display_name: string;
          input_usd_per_1m_tokens_int: number;
          model_id: string;
          output_usd_per_1m_tokens_int: number;
          plan_lock_json: Json | null;
          updated_at: string;
        };
        Insert: {
          cached_input_usd_per_1m_tokens_int?: number | null;
          created_at?: string;
          credit_multiplier_basis_points?: number | null;
          display_name: string;
          input_usd_per_1m_tokens_int: number;
          model_id: string;
          output_usd_per_1m_tokens_int: number;
          plan_lock_json?: Json | null;
          updated_at?: string;
        };
        Update: {
          cached_input_usd_per_1m_tokens_int?: number | null;
          created_at?: string;
          credit_multiplier_basis_points?: number | null;
          display_name?: string;
          input_usd_per_1m_tokens_int?: number;
          model_id?: string;
          output_usd_per_1m_tokens_int?: number;
          plan_lock_json?: Json | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      model_runs: {
        Row: {
          conversation_id: string;
          cost_usd: number | null;
          created_at: string;
          disagreements: Json | null;
          error_code: string | null;
          error_text: string | null;
          id: string;
          input_tokens: number | null;
          interrupted: boolean;
          latency_ms: number | null;
          message_id: string | null;
          model: string;
          output_text: string | null;
          output_tokens: number | null;
          provider: string;
          rating: number | null;
          slot_id: number | null;
          sources: Json | null;
          status: Database["public"]["Enums"]["run_status"];
          total_tokens: number | null;
          updated_at: string;
        };
        Insert: {
          conversation_id: string;
          cost_usd?: number | null;
          created_at?: string;
          disagreements?: Json | null;
          error_code?: string | null;
          error_text?: string | null;
          id?: string;
          input_tokens?: number | null;
          interrupted?: boolean;
          latency_ms?: number | null;
          message_id?: string | null;
          model: string;
          output_text?: string | null;
          output_tokens?: number | null;
          provider: string;
          rating?: number | null;
          slot_id?: number | null;
          sources?: Json | null;
          status?: Database["public"]["Enums"]["run_status"];
          total_tokens?: number | null;
          updated_at?: string;
        };
        Update: {
          conversation_id?: string;
          cost_usd?: number | null;
          created_at?: string;
          disagreements?: Json | null;
          error_code?: string | null;
          error_text?: string | null;
          id?: string;
          input_tokens?: number | null;
          interrupted?: boolean;
          latency_ms?: number | null;
          message_id?: string | null;
          model?: string;
          output_text?: string | null;
          output_tokens?: number | null;
          provider?: string;
          rating?: number | null;
          slot_id?: number | null;
          sources?: Json | null;
          status?: Database["public"]["Enums"]["run_status"];
          total_tokens?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "model_runs_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "model_runs_message_id_fkey";
            columns: ["message_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          billing_cadence: string;
          billing_currency: string;
          billing_lock_reason: string | null;
          billing_locked_at: string | null;
          bonus_credits_cents: number;
          created_at: string;
          email: string | null;
          id: string;
          included_credits_cents: number;
          period_end_at: string;
          period_start_at: string;
          plan_id: string;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          stripe_subscription_status: string | null;
          top_up_credits_cents: number;
        };
        Insert: {
          billing_cadence?: string;
          billing_currency?: string;
          billing_lock_reason?: string | null;
          billing_locked_at?: string | null;
          bonus_credits_cents?: number;
          created_at?: string;
          email?: string | null;
          id: string;
          included_credits_cents?: number;
          period_end_at?: string;
          period_start_at?: string;
          plan_id?: string;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          stripe_subscription_status?: string | null;
          top_up_credits_cents?: number;
        };
        Update: {
          billing_cadence?: string;
          billing_currency?: string;
          billing_lock_reason?: string | null;
          billing_locked_at?: string | null;
          bonus_credits_cents?: number;
          created_at?: string;
          email?: string | null;
          id?: string;
          included_credits_cents?: number;
          period_end_at?: string;
          period_start_at?: string;
          plan_id?: string;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          stripe_subscription_status?: string | null;
          top_up_credits_cents?: number;
        };
        Relationships: [];
      };
      projects: {
        Row: {
          archived_at: string | null;
          created_at: string;
          description: string | null;
          id: string;
          name: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          archived_at?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          name: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          archived_at?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          name?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "projects_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      stripe_webhook_events: {
        Row: {
          created_at: string;
          id: string;
          metadata: Json | null;
          stripe_event_id: string;
          type: string;
          user_id: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          metadata?: Json | null;
          stripe_event_id: string;
          type: string;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          metadata?: Json | null;
          stripe_event_id?: string;
          type?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      subscription_allowances: {
        Row: {
          created_at: string;
          id: string;
          included_used_value_usd_int: number;
          included_value_usd_int: number;
          period_end: string;
          period_start: string;
          subject_id: string;
          subject_type: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          included_used_value_usd_int?: number;
          included_value_usd_int: number;
          period_end: string;
          period_start: string;
          subject_id: string;
          subject_type: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          included_used_value_usd_int?: number;
          included_value_usd_int?: number;
          period_end?: string;
          period_start?: string;
          subject_id?: string;
          subject_type?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      usage_holds: {
        Row: {
          auto_reserved_value_usd_int: number;
          created_at: string;
          held_bonus_credits_int: number;
          held_credits_int: number;
          held_included_credits_int: number;
          held_top_up_credits_int: number;
          held_value_usd_int: number;
          id: string;
          metadata: Json | null;
          mode: string | null;
          model_id: string;
          plan_id: string;
          resolved_at: string | null;
          run_reference_id: string;
          status: string;
          user_id: string;
        };
        Insert: {
          auto_reserved_value_usd_int?: number;
          created_at?: string;
          held_bonus_credits_int?: number;
          held_credits_int?: number;
          held_included_credits_int?: number;
          held_top_up_credits_int?: number;
          held_value_usd_int?: number;
          id?: string;
          metadata?: Json | null;
          mode?: string | null;
          model_id: string;
          plan_id: string;
          resolved_at?: string | null;
          run_reference_id: string;
          status?: string;
          user_id: string;
        };
        Update: {
          auto_reserved_value_usd_int?: number;
          created_at?: string;
          held_bonus_credits_int?: number;
          held_credits_int?: number;
          held_included_credits_int?: number;
          held_top_up_credits_int?: number;
          held_value_usd_int?: number;
          id?: string;
          metadata?: Json | null;
          mode?: string | null;
          model_id?: string;
          plan_id?: string;
          resolved_at?: string | null;
          run_reference_id?: string;
          status?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      usage_runs: {
        Row: {
          billed_amount_usd_int: number;
          billed_credits_int: number;
          billing_bucket: Database["public"]["Enums"]["billing_bucket"];
          created_at: string;
          finished_at: string | null;
          hold_id: string | null;
          id: string;
          metadata: Json | null;
          mode: string | null;
          model_id: string;
          plan_id: string;
          run_reference_id: string;
          status: string;
          team_id: string | null;
          tokens_in: number;
          tokens_out: number;
          tokens_total: number;
          usage_value_usd_int: number;
          user_id: string;
        };
        Insert: {
          billed_amount_usd_int?: number;
          billed_credits_int?: number;
          billing_bucket?: Database["public"]["Enums"]["billing_bucket"];
          created_at?: string;
          finished_at?: string | null;
          hold_id?: string | null;
          id?: string;
          metadata?: Json | null;
          mode?: string | null;
          model_id: string;
          plan_id: string;
          run_reference_id: string;
          status?: string;
          team_id?: string | null;
          tokens_in?: number;
          tokens_out?: number;
          tokens_total?: number;
          usage_value_usd_int?: number;
          user_id: string;
        };
        Update: {
          billed_amount_usd_int?: number;
          billed_credits_int?: number;
          billing_bucket?: Database["public"]["Enums"]["billing_bucket"];
          created_at?: string;
          finished_at?: string | null;
          hold_id?: string | null;
          id?: string;
          metadata?: Json | null;
          mode?: string | null;
          model_id?: string;
          plan_id?: string;
          run_reference_id?: string;
          status?: string;
          team_id?: string | null;
          tokens_in?: number;
          tokens_out?: number;
          tokens_total?: number;
          usage_value_usd_int?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "usage_runs_hold_id_fkey";
            columns: ["hold_id"];
            isOneToOne: false;
            referencedRelation: "usage_holds";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "usage_runs_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      workspace_members: {
        Row: {
          created_at: string;
          role: Database["public"]["Enums"]["workspace_role"];
          user_id: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          role?: Database["public"]["Enums"]["workspace_role"];
          user_id: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          role?: Database["public"]["Enums"]["workspace_role"];
          user_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      workspaces: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          owner_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          owner_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          owner_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      apply_reversal_webhook: {
        Args: {
          p_amount_usd_int: number;
          p_credit_delta_int: number;
          p_metadata?: Json;
          p_reference_id: string;
          p_stripe_event_id: string;
          p_stripe_object_id: string;
          p_user_id: string;
        };
        Returns: undefined;
      };
      apply_subscription_invoice_webhook: {
        Args: {
          p_amount_usd_int: number;
          p_cadence: string;
          p_period_end: string;
          p_period_start: string;
          p_plan_id: string;
          p_stripe_event_id: string;
          p_stripe_object_id: string;
          p_subscription_id: string;
          p_subscription_status?: string;
          p_user_id: string;
        };
        Returns: undefined;
      };
      apply_topup_webhook: {
        Args: {
          p_amount_usd_int: number;
          p_credit_delta_int: number;
          p_metadata?: Json;
          p_reference_id: string;
          p_stripe_event_id: string;
          p_stripe_object_id: string;
          p_user_id: string;
        };
        Returns: undefined;
      };
      billing_change_plan_in_app: {
        Args: {
          p_cadence: string;
          p_plan_id: string;
          p_provider_reference_id?: string;
          p_reference_id?: string;
          p_subject_id: string;
        };
        Returns: {
          billing_cadence: string;
          billing_currency: string;
          billing_lock_reason: string | null;
          billing_locked_at: string | null;
          bonus_credits_cents: number;
          created_at: string;
          email: string | null;
          id: string;
          included_credits_cents: number;
          period_end_at: string;
          period_start_at: string;
          plan_id: string;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          stripe_subscription_status: string | null;
          top_up_credits_cents: number;
        };
        SetofOptions: {
          from: "*";
          to: "profiles";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      billing_ensure_profile: {
        Args: { p_email?: string; p_subject_id: string };
        Returns: {
          billing_cadence: string;
          billing_currency: string;
          billing_lock_reason: string | null;
          billing_locked_at: string | null;
          bonus_credits_cents: number;
          created_at: string;
          email: string | null;
          id: string;
          included_credits_cents: number;
          period_end_at: string;
          period_start_at: string;
          plan_id: string;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          stripe_subscription_status: string | null;
          top_up_credits_cents: number;
        };
        SetofOptions: {
          from: "*";
          to: "profiles";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      billing_finalize_run: {
        Args: {
          p_actual_tokens_in: number;
          p_actual_tokens_out: number;
          p_billed_amount_int?: number;
          p_model_id: string;
          p_provider_reference_id?: string;
          p_reason?: string;
          p_run_id: string;
          p_status?: string;
          p_subject_id: string;
          p_usage_value_usd_int?: number;
        };
        Returns: Json;
      };
      billing_lock_subject: {
        Args: { p_locked_at?: string; p_reason: string; p_subject_id: string };
        Returns: undefined;
      };
      billing_purchase_topup_manual: {
        Args: {
          p_amount_int: number;
          p_credit_delta_int: number;
          p_currency: string;
          p_metadata?: Json;
          p_provider_reference_id?: string;
          p_reference_id?: string;
          p_subject_id: string;
        };
        Returns: {
          billing_cadence: string;
          billing_currency: string;
          billing_lock_reason: string | null;
          billing_locked_at: string | null;
          bonus_credits_cents: number;
          created_at: string;
          email: string | null;
          id: string;
          included_credits_cents: number;
          period_end_at: string;
          period_start_at: string;
          plan_id: string;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          stripe_subscription_status: string | null;
          top_up_credits_cents: number;
        };
        SetofOptions: {
          from: "*";
          to: "profiles";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      billing_release_hold: {
        Args: {
          p_provider_reference_id?: string;
          p_reason?: string;
          p_run_id: string;
          p_subject_id: string;
        };
        Returns: Json;
      };
      billing_reset_period_if_needed: {
        Args: { p_subject_id: string };
        Returns: {
          billing_cadence: string;
          billing_currency: string;
          billing_lock_reason: string | null;
          billing_locked_at: string | null;
          bonus_credits_cents: number;
          created_at: string;
          email: string | null;
          id: string;
          included_credits_cents: number;
          period_end_at: string;
          period_start_at: string;
          plan_id: string;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          stripe_subscription_status: string | null;
          top_up_credits_cents: number;
        };
        SetofOptions: {
          from: "*";
          to: "profiles";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      billing_set_currency: {
        Args: {
          p_currency: string;
          p_provider_reference_id?: string;
          p_reference_id?: string;
          p_subject_id: string;
        };
        Returns: {
          billing_cadence: string;
          billing_currency: string;
          billing_lock_reason: string | null;
          billing_locked_at: string | null;
          bonus_credits_cents: number;
          created_at: string;
          email: string | null;
          id: string;
          included_credits_cents: number;
          period_end_at: string;
          period_start_at: string;
          plan_id: string;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          stripe_subscription_status: string | null;
          top_up_credits_cents: number;
        };
        SetofOptions: {
          from: "*";
          to: "profiles";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      billing_start_run: {
        Args: {
          p_est_tokens_in: number;
          p_est_tokens_out: number;
          p_is_auto: boolean;
          p_mode?: string;
          p_model_id: string;
          p_plan_id?: string;
          p_provider_reference_id?: string;
          p_requested_model_id?: string;
          p_run_id: string;
          p_subject_id: string;
        };
        Returns: Json;
      };
      billing_unlock_subject: {
        Args: { p_subject_id: string };
        Returns: undefined;
      };
      user_has_workspace_access: {
        Args: { target_workspace_id: string };
        Returns: boolean;
      };
    };
    Enums: {
      billing_bucket:
        | "included_plan"
        | "included_auto"
        | "bonus"
        | "overage"
        | "reversal";
      message_role: "user" | "assistant" | "system";
      run_status:
        | "running"
        | "completed"
        | "failed"
        | "queued"
        | "streaming"
        | "done"
        | "error";
      workspace_role: "owner" | "member";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      billing_bucket: [
        "included_plan",
        "included_auto",
        "bonus",
        "overage",
        "reversal",
      ],
      message_role: ["user", "assistant", "system"],
      run_status: [
        "running",
        "completed",
        "failed",
        "queued",
        "streaming",
        "done",
        "error",
      ],
      workspace_role: ["owner", "member"],
    },
  },
} as const;
