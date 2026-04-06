// =============================================================================
// ClearFin — Database Types
// Hand-authored to match supabase/migrations/20260402000001_initial_schema.sql
// =============================================================================

// ---------------------------------------------------------------------------
// Enum-like union types for constrained text columns
// ---------------------------------------------------------------------------

export type ScrapeStatus = 'idle' | 'queued' | 'running' | 'awaiting_otp' | 'done' | 'error';

export type TransactionType = 'normal' | 'installments' | 'standing_order';

export type TransactionStatus = 'completed' | 'pending';

export type TriggeredBy = 'manual' | 'schedule';

export type JobStatus = 'queued' | 'running' | 'done' | 'error';

// ---------------------------------------------------------------------------
// Database type in Supabase format
// ---------------------------------------------------------------------------

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          locale: string;
          created_at: string;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          locale?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string | null;
          locale?: string;
          created_at?: string;
        };
      };

      categories: {
        Row: {
          id: string;
          user_id: string | null;
          name_he: string;
          name_en: string | null;
          icon: string | null;
          color: string | null;
          parent_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          name_he: string;
          name_en?: string | null;
          icon?: string | null;
          color?: string | null;
          parent_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          name_he?: string;
          name_en?: string | null;
          icon?: string | null;
          color?: string | null;
          parent_id?: string | null;
          created_at?: string;
        };
      };

      bank_accounts: {
        Row: {
          id: string;
          user_id: string;
          company_id: string;
          account_number: string | null;
          display_name: string | null;
          balance: number | null;
          balance_updated_at: string | null;
          encrypted_credentials: string;
          credentials_iv: string;
          credentials_tag: string;
          last_scraped_at: string | null;
          scrape_status: ScrapeStatus;
          scrape_error: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          company_id: string;
          account_number?: string | null;
          display_name?: string | null;
          balance?: number | null;
          balance_updated_at?: string | null;
          encrypted_credentials: string;
          credentials_iv: string;
          credentials_tag: string;
          last_scraped_at?: string | null;
          scrape_status?: ScrapeStatus;
          scrape_error?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          company_id?: string;
          account_number?: string | null;
          display_name?: string | null;
          balance?: number | null;
          balance_updated_at?: string | null;
          encrypted_credentials?: string;
          credentials_iv?: string;
          credentials_tag?: string;
          last_scraped_at?: string | null;
          scrape_status?: ScrapeStatus;
          scrape_error?: string | null;
          created_at?: string;
        };
      };

      transactions: {
        Row: {
          id: string;
          user_id: string;
          bank_account_id: string;
          external_id: string | null;
          date: string;
          processed_date: string | null;
          description: string;
          memo: string | null;
          original_amount: number | null;
          original_currency: string | null;
          charged_amount: number;
          charged_currency: string;
          type: TransactionType | null;
          status: TransactionStatus | null;
          installment_number: number | null;
          installment_total: number | null;
          category_id: string | null;
          ai_category_raw: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          bank_account_id: string;
          external_id?: string | null;
          date: string;
          processed_date?: string | null;
          description: string;
          memo?: string | null;
          original_amount?: number | null;
          original_currency?: string | null;
          charged_amount: number;
          charged_currency?: string;
          type?: TransactionType | null;
          status?: TransactionStatus | null;
          installment_number?: number | null;
          installment_total?: number | null;
          category_id?: string | null;
          ai_category_raw?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          bank_account_id?: string;
          external_id?: string | null;
          date?: string;
          processed_date?: string | null;
          description?: string;
          memo?: string | null;
          original_amount?: number | null;
          original_currency?: string | null;
          charged_amount?: number;
          charged_currency?: string;
          type?: TransactionType | null;
          status?: TransactionStatus | null;
          installment_number?: number | null;
          installment_total?: number | null;
          category_id?: string | null;
          ai_category_raw?: string | null;
          notes?: string | null;
          created_at?: string;
        };
      };

      scrape_jobs: {
        Row: {
          id: string;
          user_id: string;
          bank_account_id: string;
          triggered_by: TriggeredBy;
          status: JobStatus;
          transactions_added: number | null;
          error_message: string | null;
          started_at: string | null;
          finished_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          bank_account_id: string;
          triggered_by: TriggeredBy;
          status?: JobStatus;
          transactions_added?: number | null;
          error_message?: string | null;
          started_at?: string | null;
          finished_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          bank_account_id?: string;
          triggered_by?: TriggeredBy;
          status?: JobStatus;
          transactions_added?: number | null;
          error_message?: string | null;
          started_at?: string | null;
          finished_at?: string | null;
          created_at?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
};

// ---------------------------------------------------------------------------
// Row convenience types
// ---------------------------------------------------------------------------

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Category = Database['public']['Tables']['categories']['Row'];
export type BankAccount = Database['public']['Tables']['bank_accounts']['Row'];
export type Transaction = Database['public']['Tables']['transactions']['Row'];
export type ScrapeJob = Database['public']['Tables']['scrape_jobs']['Row'];
