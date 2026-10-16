-- Word Destroyer leaderboard on Neon Postgres. Safe to run more than once.

create table if not exists wd_leaderboard (
  id         bigint generated always as identity primary key,
  initials   text        not null check (char_length(initials) between 1 and 3),
  score      integer     not null check (score >= 0),
  created_at timestamptz not null default now()
);

create index if not exists wd_leaderboard_score_idx
  on wd_leaderboard (score desc, created_at asc);

create table if not exists wd_counters (
  name  text   primary key,
  value bigint not null default 0
);
