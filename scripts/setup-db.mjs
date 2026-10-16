// One-off: create the Neon tables and copy scores over from a Supabase CSV export.
//
//   npm run db:setup                                  → create tables only
//   npm run db:setup -- scores.csv                    → also import scores
//   npm run db:setup -- scores.csv --messages=1234    → also set the counter
//
// Reads DATABASE_URL from .env.local (`vercel env pull .env.local`).
// Importing twice duplicates rows, so it refuses if the table already has scores.
import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

const MAX_SCORE = 400000; // keep in step with api/leaderboard.js

const sql = neon(process.env.DATABASE_URL);
const args = process.argv.slice(2);
const csvPath = args.find(a => !a.startsWith('--'));
const messages = args.find(a => a.startsWith('--messages='))?.split('=')[1];

const schema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
for (const stmt of schema.replace(/--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean)) {
  await sql.query(stmt);
}
console.log('Tables ready.');

if (csvPath) {
  const [{ n }] = await sql`select count(*)::int as n from wd_leaderboard`;
  if (n > 0) {
    console.error(`wd_leaderboard already has ${n} rows; not importing again.`);
    process.exit(1);
  }

  const rows = parseCsv(readFileSync(csvPath, 'utf8'));
  let imported = 0;
  const skipped = [];
  for (const r of rows) {
    const initials = String(r.initials ?? '').trim().toUpperCase();
    const score = Number(r.score);
    const ok = initials.length >= 1 && [...initials].length <= 3
      && Number.isInteger(score) && score >= 0 && score <= MAX_SCORE;
    if (!ok) { skipped.push(r); continue; }
    const createdAt = r.created_at || new Date().toISOString();
    await sql`insert into wd_leaderboard (initials, score, created_at)
              values (${initials}, ${score}, ${createdAt})`;
    imported++;
  }
  console.log(`Imported ${imported} scores.`);
  if (skipped.length) {
    console.log(`Skipped ${skipped.length} rows that break the new rules (1–3 characters, score 0–${MAX_SCORE}):`);
    for (const r of skipped) console.log('  ', JSON.stringify(r));
  }
}

if (messages !== undefined) {
  await sql`insert into wd_counters (name, value) values ('messages', ${Number(messages)})
            on conflict (name) do update set value = excluded.value`;
  console.log(`Counter set to ${messages}.`);
}

// Minimal CSV reader for Supabase's Table Editor export (quoted fields, header row).
function parseCsv(text) {
  const records = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(f => f !== '')) records.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some(f => f !== '')) records.push(row);
  const [header, ...data] = records;
  return data.map(cells => Object.fromEntries(header.map((h, i) => [h.trim(), cells[i]])));
}
