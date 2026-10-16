import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

// Internal-only "messages destroyed" counter, bumped once per game start.
// Not shown anywhere in the game; read it in the Neon console (wd_counters).
export async function POST() {
  try {
    await sql`insert into wd_counters (name, value) values ('messages', 1)
              on conflict (name) do update set value = wd_counters.value + 1`;
  } catch (e) {
    console.error('counter bump failed', e);
  }
  return new Response(null, { status: 204 });
}
