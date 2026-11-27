-- PABRIK KONTEN AI - Supabase schema
-- Jalankan di Supabase SQL Editor.

-- Enum status job
DO $$ BEGIN
  CREATE TYPE job_status AS ENUM ('pending', 'processing', 'completed', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Tabel job video
CREATE TABLE IF NOT EXISTS public.video_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic text NOT NULL,
  language text NOT NULL DEFAULT 'id-ID',
  voice_name text NOT NULL DEFAULT 'id-ID-ArdiNeural',
  destinations jsonb NOT NULL DEFAULT '{"telegram": true, "gdrive": false, "youtube": false}'::jsonb,
  status job_status NOT NULL DEFAULT 'pending',
  output_links jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index untuk polling & antrian
CREATE INDEX IF NOT EXISTS idx_video_jobs_created_at ON public.video_jobs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_video_jobs_status ON public.video_jobs (status);

-- Trigger auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_video_jobs_updated_at ON public.video_jobs;
CREATE TRIGGER trg_video_jobs_updated_at
  BEFORE UPDATE ON public.video_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Workspace tables (Pabrik Konten AI - Step 1)
CREATE TABLE IF NOT EXISTS public.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  review_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, slug)
);

CREATE TABLE IF NOT EXISTS public.brand_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL UNIQUE REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text,
  voice_tone text,
  writing_style text,
  target_audience text,
  key_offers jsonb NOT NULL DEFAULT '[]'::jsonb,
  hashtags text[] NOT NULL DEFAULT '{}',
  dos text[] NOT NULL DEFAULT '{}',
  donts text[] NOT NULL DEFAULT '{}',
  example_posts jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspaces_owner ON public.workspaces (owner_id);
CREATE INDEX IF NOT EXISTS idx_brand_profiles_workspace ON public.brand_profiles (workspace_id);

DROP TRIGGER IF EXISTS trg_workspaces_updated_at ON public.workspaces;
CREATE TRIGGER trg_workspaces_updated_at
  BEFORE UPDATE ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_brand_profiles_updated_at ON public.brand_profiles;
CREATE TRIGGER trg_brand_profiles_updated_at
  BEFORE UPDATE ON public.brand_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('instagram','tiktok','youtube','threads')),
  label text NOT NULL,
  handle text,
  status text NOT NULL DEFAULT 'connected' CHECK (status IN ('connected','expired','error')),
  token_enc text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_accounts_workspace ON public.accounts (workspace_id);
DROP TRIGGER IF EXISTS trg_accounts_updated_at ON public.accounts;
CREATE TRIGGER trg_accounts_updated_at BEFORE UPDATE ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service full accounts" ON public.accounts;
CREATE POLICY "service full accounts" ON public.accounts FOR ALL TO service_role USING (true) WITH CHECK (true);
ALTER TABLE public.brand_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service full workspaces" ON public.workspaces;
CREATE POLICY "service full workspaces" ON public.workspaces FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service full brand_profiles" ON public.brand_profiles;
CREATE POLICY "service full brand_profiles" ON public.brand_profiles FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TABLE IF NOT EXISTS public.posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  account_ids uuid[] NOT NULL DEFAULT '{}',
  caption text,
  media_urls text[] NOT NULL DEFAULT '{}',
  hashtags text[] NOT NULL DEFAULT '{}',
  first_comment text,
  location text,
  tags text[] NOT NULL DEFAULT '{}',
  platform_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','published','failed')),
  scheduled_at timestamptz,
  published_at timestamptz,
  error_message text,
  retry_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_posts_workspace ON public.posts (workspace_id);
CREATE INDEX IF NOT EXISTS idx_posts_status ON public.posts (status);
DROP TRIGGER IF EXISTS trg_posts_updated_at ON public.posts;
CREATE TRIGGER trg_posts_updated_at BEFORE UPDATE ON public.posts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service full posts" ON public.posts;
CREATE POLICY "service full posts" ON public.posts FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  day_of_week int NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  time_slot text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_schedules_account ON public.schedules (account_id);
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service full schedules" ON public.schedules;
CREATE POLICY "service full schedules" ON public.schedules FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- Rework SPA: kalender, tipe posting, review Telegram, auto-post
-- ============================================================

-- Tipe posting
DO $$ BEGIN
  CREATE TYPE post_type AS ENUM ('image', 'carousel', 'video_reel');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Kolom baru pada posts
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS post_type post_type NOT NULL DEFAULT 'image';
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS topic text;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS media_prompt text;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS ai_provider text;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'draft';
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS telegram_message_id text;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS published_mode text;
-- Jumlah slide untuk carousel (dideteksi dari kolom Prompt saat impor)
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS slide_count int;
DO $$ BEGIN
  ALTER TABLE public.posts ADD CONSTRAINT posts_review_status_check CHECK (review_status IN ('draft','pending','confirmed','rejected','posted','failed'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_posts_scheduled_at ON public.posts (scheduled_at);
CREATE INDEX IF NOT EXISTS idx_posts_review ON public.posts (review_status);

-- Konfigurasi Telegram per workspace
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS telegram_bot_token text;
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS telegram_chat_id text;

-- Strategi konten bebas (freetext) per workspace; dipakai AI saat generate gambar/video
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS strategy text;

-- Strategi konten opsional per job video (diteruskan ke worker)
ALTER TABLE public.video_jobs ADD COLUMN IF NOT EXISTS strategy text;

-- Saran jam posting terbaik per akun
CREATE TABLE IF NOT EXISTS public.best_times (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  day_of_week int NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  time_slot text NOT NULL,
  score numeric NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'suggestion',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, day_of_week, time_slot)
);
CREATE INDEX IF NOT EXISTS idx_best_times_account ON public.best_times (account_id);
ALTER TABLE public.best_times ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service full best_times" ON public.best_times;
CREATE POLICY "service full best_times" ON public.best_times FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Riwayat health model AI
CREATE TABLE IF NOT EXISTS public.ai_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  model text,
  kind text NOT NULL DEFAULT 'text' CHECK (kind IN ('text','image','video')),
  ok boolean NOT NULL,
  latency_ms int,
  message text,
  checked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_health_checked ON public.ai_health (checked_at DESC);
ALTER TABLE public.ai_health ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service full ai_health" ON public.ai_health;
CREATE POLICY "service full ai_health" ON public.ai_health FOR ALL TO service_role USING (true) WITH CHECK (true);
