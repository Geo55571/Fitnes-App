/**
 * POST /api/analyze — reads a workout photo (e.g. an Apple Watch workout summary) with Claude
 * and returns a ScanReading (src/domain/workoutScan.ts). Runs as a Cloudflare Pages Function
 * next to the website; the app validates everything it gets back before saving.
 *
 * Switched off until an API key is set:
 *   npx wrangler pages secret put ANTHROPIC_API_KEY --project-name form-fitness
 * Without it, this answers 501 and the app offers manual logging instead.
 * Optional: ANALYZE_MODEL to use a different Claude model.
 */
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import * as z from 'zod/v4';

import { DISTANCE_UNITS, ELEVATION_UNITS, SCAN_ACTIVITIES, type ScanReading } from '../../src/domain/workoutScan';

interface Env {
  ANTHROPIC_API_KEY?: string;
  ANALYZE_MODEL?: string;
}

/** ~4.5 MB of JPEG once decoded; the app sends ~0.3–0.8 MB. */
const MAX_BASE64 = 6_000_000;
const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

const Workout = z.object({
  activity: z.enum(SCAN_ACTIVITIES).describe("Closest type; 'other' when none fit (put the real name in title)."),
  title: z.string().describe('Workout name exactly as shown, e.g. "Outdoor Cycle".'),
  duration_seconds: z.number().nullable().describe('Workout Time (not Elapsed Time) in seconds.'),
  distance: z.object({ value: z.number(), unit: z.enum(DISTANCE_UNITS) }).nullable(),
  active_kcal: z.number().nullable(),
  total_kcal: z.number().nullable(),
  avg_heart_rate: z.number().nullable(),
  max_heart_rate: z.number().nullable(),
  elevation_gain: z.object({ value: z.number(), unit: z.enum(ELEVATION_UNITS) }).nullable(),
  start_time: z.string().nullable().describe('Start time as 24-hour "HH:MM", if shown.'),
  date: z.string().nullable().describe('YYYY-MM-DD, only if a date or weekday is shown.'),
});

const Reading = z.object({
  is_workout_summary: z.boolean(),
  workouts: z.array(Workout),
  note: z.string().nullable().describe('One short sentence when something could not be read, else null.'),
});

const SYSTEM = `You read photos and screenshots of fitness-watch workout summaries (Apple Watch, the iPhone Fitness app, Garmin, Samsung, Fitbit and similar) and report exactly what is shown.

Rules:
- Only report values that are visible. Use null for anything not shown or not legible. Never estimate or calculate missing values.
- duration_seconds: the workout's active time ("Workout Time", "Total Time", "Duration"), converted to seconds. "35:12" on a summary means 35 min 12 s; "1:05:30" means 1 h 5 min 30 s.
- distance and elevation: the number and the unit exactly as displayed (KM, MI, M, YD, FT).
- active_kcal is "Active Kilocalories"/"Active Calories"/"Move"; total_kcal is "Total Kilocalories"/"Total Calories".
- If the photo shows a list of several workouts, return one entry per workout. If it shows one workout, return one entry.
- If the photo is not a workout summary (or is unreadable), set is_workout_summary to false, return no workouts, and say why in note.
- For dates shown without a year, use the most recent such date that is not after today.`;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export async function onRequestPost({ request, env }: { request: Request; env: Env }): Promise<Response> {
  if (!env.ANTHROPIC_API_KEY) return json({ error: 'not_configured' }, 501);

  const body = (await request.json().catch(() => null)) as { image?: unknown; media_type?: unknown; today?: unknown } | null;
  const image = typeof body?.image === 'string' ? body.image : '';
  const mediaType = MEDIA_TYPES.find((t) => t === body?.media_type) ?? 'image/jpeg';
  if (!image || !/^[A-Za-z0-9+/=]+$/.test(image.slice(0, 200))) return json({ error: 'bad_image' }, 400);
  if (image.length > MAX_BASE64) return json({ error: 'too_large' }, 413);
  const today = typeof body?.today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.today) ? body.today : new Date().toISOString().slice(0, 10);

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  try {
    const response = await client.beta.messages.parse({
      model: env.ANALYZE_MODEL || 'claude-opus-5-5',
      max_tokens: 16000,
      // If the main model declines, the API retries on a fallback model in the same call.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: betaZodOutputFormat(Reading) },
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
            { type: 'text', text: `Today is ${today}. Read the workout in this photo.` },
          ],
        },
      ],
    });
    if (response.stop_reason === 'refusal' || !response.parsed_output) return json({ error: 'unreadable' }, 422);
    const reading: ScanReading = response.parsed_output;
    return json(reading);
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'rate_limited' }, 429);
    if (e instanceof Anthropic.BadRequestError) return json({ error: 'unreadable' }, 422);
    if (e instanceof Anthropic.AuthenticationError) {
      console.error('analyze: the ANTHROPIC_API_KEY secret is invalid');
      return json({ error: 'server_misconfigured' }, 500);
    }
    if (e instanceof Anthropic.APIError) {
      console.error('analyze: Claude API error', e.status, e.message);
      return json({ error: 'upstream_error' }, 502);
    }
    console.error('analyze: unexpected error', e);
    return json({ error: 'server_error' }, 500);
  }
}
