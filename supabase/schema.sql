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

-- RLS
ALTER TABLE public.video_jobs ENABLE ROW LEVEL SECURITY;

-- anon: read-only
DROP POLICY IF EXISTS "anon read video_jobs" ON public.video_jobs;
CREATE POLICY "anon read video_jobs"
  ON public.video_jobs FOR SELECT
  TO anon
  USING (true);

-- service_role: full akses (insert/update/delete)
DROP POLICY IF EXISTS "service full video_jobs" ON public.video_jobs;
CREATE POLICY "service full video_jobs"
  ON public.video_jobs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);