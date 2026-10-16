import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

// The best possible real run: every letter hit at the highest combo is
// (letters + 1) × 1000 points, letters ≤ 160, then doubled by a 100% accuracy
// bonus → 322,000. Anything above this ceiling can't have been played.
// Raise it if the scoring rules in index.html ever change.
const MAX_SCORE = 400000;

const json = (body, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

const topTen = () =>
  sql`select initials, score from wd_leaderboard
      order by score desc, created_at asc limit 10`;

// GET  /api/leaderboard              → { scores: [{ initials, score }, …] }
// POST /api/leaderboard { initials, score } → same, with the new score saved
export async function GET() {
  try {
    return json({ scores: await topTen() });
  } catch (e) {
    console.error('leaderboard read failed', e);
    return json({ error: 'unavailable' }, 503);
  }
}

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }

  const initials = String(body?.initials ?? '').trim().toUpperCase();
  const score = body?.score;

  if (initials.length < 1 || [...initials].length > 3 || /[\u0000-\u001f]/.test(initials)) {
    return json({ error: 'initials must be 1–3 characters' }, 400);
  }
  if (!Number.isInteger(score) || score < 0 || score > MAX_SCORE) {
    return json({ error: 'score out of range' }, 400);
  }

  try {
    await sql`insert into wd_leaderboard (initials, score) values (${initials}, ${score})`;
    return json({ scores: await topTen() });
  } catch (e) {
    console.error('leaderboard write failed', e);
    return json({ error: 'unavailable' }, 503);
  }
}
