-- WIN immutable, source-backed bookmaker quote evidence.
-- Review and apply manually to the intended Neon branch; this file is NOT auto-applied.

create table if not exists public.win_odds_quote_snapshots (
  quote_id text primary key,
  source_id text not null,
  source_record_id text not null,
  source_revision char(40) not null check (source_revision ~ '^[a-fA-F0-9]{40}$'),
  licence_id text not null,
  snapshot_role text not null check (snapshot_role in ('decision','closing')),
  event_id text not null,
  market_id text not null,
  selection_id text not null,
  period text not null,
  line text,
  bookmaker_id text not null,
  venue_type text not null check (venue_type in ('sportsbook','exchange','prediction_market','unknown')),
  price_type text not null check (price_type = 'decimal_back'),
  decimal_odds numeric(12,5) not null check (decimal_odds > 1 and decimal_odds <= 1000),
  source_observed_at timestamptz not null,
  ingested_at timestamptz not null,
  event_start_at timestamptz not null,
  availability_status text not null check (availability_status in ('open','suspended','closed','unknown')),
  is_live boolean not null default false,
  raw_payload jsonb not null,
  created_at timestamptz not null default now(),
  constraint win_odds_quote_ingestion_not_before_source check (ingested_at >= source_observed_at),
  constraint win_odds_quote_pre_match check (source_observed_at < event_start_at and is_live = false),
  constraint win_odds_quote_source_record_revision unique (source_id, source_record_id, source_revision)
);

create index if not exists win_odds_quote_match_lookup
  on public.win_odds_quote_snapshots
  (event_id, market_id, selection_id, bookmaker_id, source_observed_at);

create index if not exists win_odds_quote_cutoff_lookup
  on public.win_odds_quote_snapshots
  (event_id, market_id, selection_id, source_observed_at);

create table if not exists public.win_prediction_quote_bindings (
  prediction_id text primary key,
  decision_quote_id text not null references public.win_odds_quote_snapshots(quote_id),
  prediction_cutoff timestamptz not null,
  model_artifact_id text not null,
  feature_snapshot_id text not null,
  bound_at timestamptz not null default now(),
  constraint win_prediction_quote_cutoff check (bound_at >= prediction_cutoff)
);

create table if not exists public.win_clv_evaluations (
  evaluation_id text primary key,
  prediction_id text not null references public.win_prediction_quote_bindings(prediction_id),
  closing_quote_id text not null references public.win_odds_quote_snapshots(quote_id),
  evaluation_mode text not null check (evaluation_mode in ('live','retrospective')),
  odds_ratio_clv numeric(16,10) not null,
  implied_probability_delta numeric(16,10) not null,
  evaluated_at timestamptz not null default now(),
  evidence_only boolean not null default true check (evidence_only = true),
  profitability_claimed boolean not null default false check (profitability_claimed = false),
  unique (prediction_id, closing_quote_id, evaluation_mode)
);

-- Validate that the prediction-time quote was genuinely available at its cutoff.
create or replace function public.win_validate_prediction_quote_binding()
returns trigger language plpgsql as $
declare q public.win_odds_quote_snapshots%rowtype;
begin
  select * into q from public.win_odds_quote_snapshots where quote_id = new.decision_quote_id;
  if not found
     or q.snapshot_role <> 'decision'
     or q.availability_status <> 'open'
     or q.is_live
     or q.source_observed_at > new.prediction_cutoff
     or q.ingested_at > new.prediction_cutoff
     or q.source_observed_at >= q.event_start_at then
    raise exception 'WIN decision quote was not valid and available at prediction cutoff';
  end if;
  return new;
end;
$;

drop trigger if exists win_prediction_quote_binding_validate on public.win_prediction_quote_bindings;
create trigger win_prediction_quote_binding_validate
  before insert on public.win_prediction_quote_bindings
  for each row execute function public.win_validate_prediction_quote_binding();

-- Validate exact market identity and close timing before accepting a CLV record.
create or replace function public.win_validate_clv_evaluation()
returns trigger language plpgsql as $
declare d public.win_odds_quote_snapshots%rowtype;
declare c public.win_odds_quote_snapshots%rowtype;
declare cutoff_at timestamptz;
begin
  select q.*, b.prediction_cutoff into d
    from public.win_prediction_quote_bindings b
    join public.win_odds_quote_snapshots q on q.quote_id = b.decision_quote_id
    where b.prediction_id = new.prediction_id;
  if not found then
    raise exception 'WIN prediction quote binding is missing';
  end if;
  select * into c from public.win_odds_quote_snapshots where quote_id = new.closing_quote_id;
  if not found
     or c.snapshot_role <> 'closing'
     or c.availability_status <> 'open'
     or c.is_live
     or c.source_observed_at <= cutoff_at
     or c.source_observed_at <= d.source_observed_at
     or c.source_observed_at >= c.event_start_at
     or c.event_id <> d.event_id
     or c.market_id <> d.market_id
     or c.selection_id <> d.selection_id
     or c.period <> d.period
     or c.line is distinct from d.line
     or c.bookmaker_id <> d.bookmaker_id
     or c.source_id <> d.source_id
     or c.source_revision <> d.source_revision
     or c.licence_id <> d.licence_id
     or c.venue_type <> d.venue_type
     or c.price_type <> d.price_type
     or (new.evaluation_mode = 'live' and c.ingested_at > c.event_start_at) then
    raise exception 'WIN closing quote does not match decision evidence or valid close timing';
  end if;
  return new;
end;
$;

drop trigger if exists win_clv_evaluation_validate on public.win_clv_evaluations;
create trigger win_clv_evaluation_validate
  before insert on public.win_clv_evaluations
  for each row execute function public.win_validate_clv_evaluation();

-- Prevent routine UPDATE/DELETE from rewriting historical quote evidence.
create or replace function public.win_reject_odds_evidence_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'WIN odds evidence is append-only; insert a corrected source record instead';
end;
$$;

drop trigger if exists win_odds_quote_no_update on public.win_odds_quote_snapshots;
create trigger win_odds_quote_no_update
  before update or delete on public.win_odds_quote_snapshots
  for each row execute function public.win_reject_odds_evidence_mutation();

drop trigger if exists win_prediction_quote_binding_no_update on public.win_prediction_quote_bindings;
create trigger win_prediction_quote_binding_no_update
  before update or delete on public.win_prediction_quote_bindings
  for each row execute function public.win_reject_odds_evidence_mutation();

drop trigger if exists win_clv_evaluation_no_update on public.win_clv_evaluations;
create trigger win_clv_evaluation_no_update
  before update or delete on public.win_clv_evaluations
  for each row execute function public.win_reject_odds_evidence_mutation();
