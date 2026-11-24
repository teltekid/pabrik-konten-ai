import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const GITHUB_OWNER = process.env.GITHUB_OWNER!
const GITHUB_REPO = process.env.GITHUB_REPO!
const GITHUB_PAT = process.env.GITHUB_PAT!

export async function handler(req: any, context: any) {
  if (req.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  try {
    const body = JSON.parse(req.body || '{}')
    const { topic, language = 'id-ID', voice_name = 'id-ID-ArdiNeural', destinations } = body

    if (!topic) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Topic is required' }) }
    }

    const { data: job, error: dbError } = await supabase
      .from('video_jobs')
      .insert({
        topic,
        language,
        voice_name,
        destinations: destinations || { telegram: true, gdrive: false, youtube: false },
      })
      .select()
      .single()

    if (dbError) throw dbError

    const ghRes = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${GITHUB_PAT}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          event_type: 'generate_video_job',
          client_payload: { job_id: job.id },
        }),
      },
    )

    if (!ghRes.ok) {
      const errText = await ghRes.text()
      throw new Error(`GitHub Dispatch failed: ${errText}`)
    }

    return { statusCode: 200, body: JSON.stringify({ success: true, job }) }
  } catch (error: any) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) }
  }
}