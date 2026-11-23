-- T&B Foods: shared database. Paste all of this into Supabase > SQL Editor > New query > Run.
-- Safe to run again (it updates functions and keeps your data).

create extension if not exists pgcrypto;
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

-- The household code travels in the "x-household" header from the app.
create or replace function public.tb_hh() returns text
language sql stable as $$
  select nullif(coalesce(current_setting('request.headers', true)::json->>'x-household', ''), '')
$$;

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  household text not null default public.tb_hh(),
  name text not null,
  qty numeric not null default 1,
  unit text,
  location text not null check (location in ('fridge','freezer','beko','pantry','utilities')),
  spot text,
  barcode text,
  image text,
  bought_on date not null default current_date,
  frozen_on date,
  use_by date,
  added_at timestamptz not null default now(),
  gone_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.items add column if not exists bought_on date not null default current_date;
alter table public.items add column if not exists frozen_on date;
create index if not exists items_hh on public.items (household) where gone_at is null;
alter table public.items drop constraint if exists items_location_check;
alter table public.items add constraint items_location_check check (location in ('fridge','freezer','beko','pantry','utilities'));

create table if not exists public.usage (
  id uuid primary key default gen_random_uuid(),
  household text not null default public.tb_hh(),
  name text not null,
  location text,
  qty numeric not null,
  used_at timestamptz not null default now()
);
create index if not exists usage_hh on public.usage (household, used_at);

create table if not exists public.products (
  household text not null default public.tb_hh(),
  barcode text not null,
  name text not null,
  image text,
  unit text,
  updated_at timestamptz not null default now(),
  primary key (household, barcode)
);

create table if not exists public.shops (
  id uuid primary key default gen_random_uuid(),
  household text not null default public.tb_hh(),
  shop_date date not null default current_date,
  store text not null,
  amount numeric(9,2) not null check (amount >= 0),
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.settings (
  household text primary key default public.tb_hh(),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Row level security: each household code only sees its own rows.
do $$
declare t text;
begin
  foreach t in array array['items','usage','products','shops','settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists tb_household on public.%I', t);
    execute format($p$create policy tb_household on public.%I for all to anon, authenticated
      using (length(public.tb_hh()) >= 10 and household = public.tb_hh())
      with check (length(public.tb_hh()) >= 10 and household = public.tb_hh())$p$, t);
    execute format('grant select, insert, update, delete on public.%I to anon, authenticated', t);
  end loop;
end $$;

-- ---------- Voice command parsing (shared by Siri and the app) ----------
create or replace function public.tb_parse(cmd text) returns jsonb
language plpgsql immutable as $$
declare
  t text := ' ' || lower(coalesce(cmd, '')) || ' ';
  act text := 'add';
  loc text := null;
  frz boolean := false;
  qty numeric := null;
  unit text := null;
  words text[];
  i int := 1;
  n int;
  w text;
  nm text;
  numwords jsonb := '{"a":1,"an":1,"one":1,"won":1,"two":2,"to":2,"too":2,"three":3,"four":4,"for":4,"five":5,"six":6,"seven":7,"eight":8,"nine":9,"ten":10,"eleven":11,"twelve":12,"thirteen":13,"fourteen":14,"fifteen":15,"sixteen":16,"seventeen":17,"eighteen":18,"nineteen":19,"twenty":20,"thirty":30,"forty":40,"fifty":50,"half":0.5,"couple":2,"dozen":12,"all":-1,"every":-1}';
  units jsonb := '{"portion":"portion","portions":"portion","bag":"bag","bags":"bag","pack":"pack","packs":"pack","packet":"pack","packets":"pack","tub":"tub","tubs":"tub","box":"box","boxes":"box","tin":"tin","tins":"tin","can":"tin","cans":"tin","bottle":"bottle","bottles":"bottle","tray":"tray","trays":"tray","piece":"piece","pieces":"piece","slice":"slice","slices":"slice","loaf":"loaf","loaves":"loaf","lb":"lb","lbs":"lb","pound":"lb","pounds":"lb","kg":"kg","kilo":"kg","kilos":"kg","g":"g","grams":"g","gram":"g","litre":"litre","litres":"litre","liter":"litre","liters":"litre","container":"container","containers":"container","carton":"carton","cartons":"carton","jar":"jar","jars":"jar","punnet":"punnet","punnets":"punnet","bunch":"bunch","bunches":"bunch","bowl":"bowl","bowls":"bowl","meal":"portion","meals":"portion","serving":"portion","servings":"portion","roll":"roll","rolls":"roll","can":"tin","tray-bake":"tray"}';
begin
  t := regexp_replace(t, '[’`]', '''', 'g');
  t := regexp_replace(t, '\.(?![0-9])', ' ', 'g');
  t := regexp_replace(t, '[^a-z0-9.'' -]', ' ', 'g');
  t := regexp_replace(t, '\s+', ' ', 'g');

  -- questions
  if t ~ '^ (what|whats|what''s|list|how much|how many|show|tell me)\M' then
    act := 'list';
    if t ~ '\m(eat soon|eating soon|need(s)? eating|use up|oldest|old|expir|rotate)' then loc := 'soon'; end if;
  end if;

  -- location (utilities and pantry first, then chest freezer, American freezer, fridge)
  if t ~ '\m(utilities|utility|under the sink)\M' then
    loc := coalesce(loc, 'utilities');
    t := regexp_replace(t, '\m((in|into|to|from|out of|on|at) )?((the|my|our) )?(utilities|utility|under the sink)( (room|press|cupboard|cupboards))?\M', ' ', 'g');
  elsif t ~ '\m(pantry|cupboard|cupboards|press|larder)\M' then
    loc := coalesce(loc, 'pantry');
    t := regexp_replace(t, '\m((in|into|to|from|out of|on|at) )?((the|my|our) )?(food )?(pantry|cupboard|cupboards|press|larder)\M', ' ', 'g');
  elsif t ~ '\m(beko|becko|beco|becco|bekko|beeko|beko''s|bekos|becko''s|bico|deco|chest)\M' then
    loc := coalesce(loc, 'beko');
    t := regexp_replace(t, '\m((in|into|to|from|out of|on|at) )?((the|my|our) )?(beko|becko|beco|becco|bekko|beeko|beko''s|bekos|becko''s|bico|deco|chest)( (chest|freezer|chest freezer))*\M', ' ', 'g');
  elsif t ~ '\m(fridge freezer|freezer|american freezer|big freezer|freezer drawer|freezer drawers)\M' then
    loc := coalesce(loc, 'freezer');
    t := regexp_replace(t, '\m((in|into|to|from|out of|on|at) )?((the|my|our) )?((american|big) )?(fridge )?freezer( (drawer|drawers|side))?\M', ' ', 'g');
  elsif t ~ '\m(fridge|refrigerator)\M' then
    loc := coalesce(loc, 'fridge');
    t := regexp_replace(t, '\m((in|into|to|from|out of|on|at) )?((the|my|our) )?(american )?(fridge|refrigerator)( side)?\M', ' ', 'g');
  end if;

  if act = 'list' then
    return jsonb_build_object('action', act, 'loc', loc);
  end if;

  -- freezing it today?
  if t ~ '\m(freeze|freezing|frozen|froze)\M' then
    frz := true;
    t := regexp_replace(t, '\m(i''m |i am |we''re |we are |to )?(freeze|freezing|frozen|froze)( it| them| today| now)*\M', ' ', 'g');
  end if;

  -- remove words
  if t ~ '\m(ate|eat|eaten|remove|removed|delete|deleted|used|use up|took|take|taken|finished|finish|minus|defrost|defrosted|defrosting|thaw|thawed|thawing|gone)\M' then
    act := 'remove';
    t := regexp_replace(t, '\m(we |i )?(have |had |just )*(ate|eaten|eat|removed|remove|delete|deleted|used up|use up|used|took out|take out|taken out|took|take|taken|finished|finish|minus|defrosted|defrosting|defrost|thawed|thawing|thaw|gone)( up| out| off)?\M', ' ', 'g');
  end if;
  t := regexp_replace(t, '^ (please )?(add|added|put|plus|bought|got|log|store|stored|new)( in| away)?\M', ' ', 'g');
  t := regexp_replace(t, '\m(please|thanks|thank you)\M', ' ', 'g');
  t := regexp_replace(t, '\s+', ' ', 'g');

  words := regexp_split_to_array(trim(t), ' ');
  n := coalesce(array_length(words, 1), 0);
  -- skip fillers
  while i <= n and words[i] in ('we','i','have','had','just','the','some','of','my','our','x') loop i := i + 1; end loop;
  -- quantity
  if i <= n then
    w := words[i];
    if w ~ '^[0-9]+(\.[0-9]+)?$' then qty := w::numeric; i := i + 1;
    elsif w ~ '^[0-9]+x$' then qty := left(w, -1)::numeric; i := i + 1;
    elsif numwords ? w and not (w in ('to','too','for','won') and i = n) then
      qty := (numwords->>w)::numeric; i := i + 1;
      if w in ('all','every') and i <= n and words[i] in ('the','of','our','my') then i := i + 1; end if;
      if qty = 0.5 and i <= n and words[i] in ('a','an') then i := i + 1; end if;
      if w = 'couple' and i <= n and words[i] = 'of' then i := i + 1; end if;
      if i <= n and words[i] = 'and' and i + 2 <= n and words[i+1] = 'a' and words[i+2] = 'half' then qty := qty + 0.5; i := i + 3; end if;
    end if;
  end if;
  -- unit
  if i <= n and units ? words[i] then
    unit := units->>words[i]; i := i + 1;
    while i <= n and words[i] in ('of','the','x') loop i := i + 1; end loop;
  end if;
  nm := array_to_string(words[i:n], ' ');
  nm := regexp_replace(nm, '^((of|the|some|a|an) )+', '');
  nm := regexp_replace(nm, '( (in|into|to|from|out|of|the|please|and|today|now|it|them))+$', '');
  nm := trim(nm);
  if act = 'add' and qty = -1 then qty := 1; end if;
  return jsonb_build_object('action', act, 'qty', coalesce(qty, 1), 'unit', unit, 'name', nm, 'loc', loc, 'freeze', frz);
end $$;

create or replace function public.tb_loc_name(loc text) returns text language sql immutable as $$
  select case loc when 'beko' then 'Beko' when 'freezer' then 'American freezer' when 'fridge' then 'fridge'
                  when 'pantry' then 'pantry' when 'utilities' then 'utility cupboard' else loc end
$$;

-- Where to put something when no place was said
create or replace function public.tb_guess_loc(nm text, u text) returns text language sql immutable as $$
  select case
    when nm ~* '(bleach|detergent|washing (up|powder|liquid|tablets|pods)|cleaner|cleaning|spray|toilet|loo roll|kitchen roll|bin bag|bin liner|sponge|polish|soap|dishwasher|fabric|softener|wipes|tin foil|cling film|baking paper|hand wash|shampoo|toothpaste|batter(y|ies)|light ?bulb|fairy|domestos|flash|zoflora|dettol|febreze)' then 'utilities'
    when u in ('tin','jar','roll') or nm ~* '(beans|pasta|spaghetti|penne|rice|cereal|porridge|oats|flour|sugar|tea bags|teabags|coffee|oil|vinegar|tinned|tin of|crisps|biscuit|noodle|stock cube|gravy|herbs|spice|salt|pepper|ketchup|mayo|jam|honey|peanut butter|nuts|crackers|lentils|chickpeas)' then 'pantry'
    else 'beko' end
$$;

create or replace function public.tb_qty_text(q numeric, u text, nm text) returns text language sql immutable as $$
  select trim_scale(q)::text || ' ' ||
    case when u is null then lower(nm)
         else (case when q = 1 or u in ('lb','kg','g') then u
                     when u in ('box','bunch') then u || 'es'
                     when u = 'loaf' then 'loaves'
                     else u || 's' end) || ' of ' || lower(nm) end
$$;

create or replace function public.tb_ping(code text) returns void language plpgsql security definer as $$
begin
  perform realtime.send(jsonb_build_object('at', now()), 'changed', 'tb-' || left(encode(sha256(convert_to(code, 'UTF8')), 'hex'), 16), false);
exception when others then null;
end $$;

-- Siri and the app call this: select tb_voice('add 4 portions of chilli to the beko', 'YOUR-CODE')
create or replace function public.tb_voice(cmd text, code text default null) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  hh text := coalesce(nullif(code, ''), public.tb_hh());
  p jsonb;
  loc text;
  q numeric;
  u text;
  nm text;
  frz boolean;
  existing uuid;
  total numeric;
  target text;
  remaining numeric;
  took numeric;
  r record;
  lst text;
begin
  if hh is null or length(hh) < 10 then
    return 'The household code is missing from the shortcut. Check the code field in your Shortcut.';
  end if;
  p := public.tb_parse(cmd);
  loc := p->>'loc';

  if p->>'action' = 'list' then
    if loc = 'soon' then
      select string_agg(public.tb_qty_text(qty, unit, name) || ' in the ' || public.tb_loc_name(location), ', ' order by coalesce(frozen_on, bought_on))
        into lst
        from (select * from items where household = hh and gone_at is null and qty > 0
                and ((location = 'fridge' and coalesce(use_by, bought_on + 3) <= current_date + 1)
                  or (location = 'pantry' and use_by <= current_date + 7)
                  or (location in ('freezer','beko') and coalesce(frozen_on, bought_on) <= current_date - 56))
              order by coalesce(frozen_on, bought_on) limit 8) s;
      return coalesce('Eat these soon: ' || lst || '.', 'Nothing needs eating soon. Everything is within its rotation.');
    end if;
    select string_agg(public.tb_qty_text(qty, unit, name), ', ' order by coalesce(frozen_on, bought_on))
      into lst
      from (select * from items where household = hh and gone_at is null and qty > 0 and (loc is null or location = loc)
            order by coalesce(frozen_on, bought_on) limit 12) s;
    return coalesce('In the ' || coalesce(public.tb_loc_name(loc), 'kitchen') || ', oldest first: ' || lst || '.',
                    'The ' || coalesce(public.tb_loc_name(loc), 'kitchen') || ' is empty.');
  end if;

  nm := p->>'name';
  q := (p->>'qty')::numeric;
  u := p->>'unit';
  frz := coalesce((p->>'freeze')::boolean, false);
  if nm is null or nm = '' then
    return 'Sorry, I didn''t catch the food. Try: add 4 portions of chilli to the Beko.';
  end if;

  if p->>'action' = 'add' then
    loc := coalesce(loc, public.tb_guess_loc(nm, u));
    nm := upper(left(nm, 1)) || substr(nm, 2);
    select id into existing from items
      where household = hh and gone_at is null and location = loc and lower(name) = lower(nm)
        and coalesce(unit, '') = coalesce(u, '') and bought_on = current_date
        and (frozen_on is not null) = frz
      limit 1;
    if existing is not null then
      update items set qty = qty + q, updated_at = now() where id = existing;
    else
      insert into items (household, name, qty, unit, location, bought_on, frozen_on)
      values (hh, nm, q, u, loc, current_date, case when frz and loc in ('freezer','beko') then current_date end);
    end if;
    select sum(qty) into total from items where household = hh and gone_at is null and location = loc and lower(name) = lower(nm);
    perform public.tb_ping(hh);
    return 'Added ' || public.tb_qty_text(q, u, nm) || ' to the ' || public.tb_loc_name(loc)
      || case when frz then ', frozen today' else '' end
      || '. You now have ' || trim_scale(total)::text || '.';
  end if;

  -- remove: find the best matching food, then take from the oldest batch first
  select lower(i.name) into target from items i
    where i.household = hh and i.gone_at is null and i.qty > 0 and (loc is null or i.location = loc)
      and (i.name ilike '%' || nm || '%' or nm ilike '%' || i.name || '%' or extensions.similarity(lower(i.name), nm) > 0.3
           or extensions.word_similarity(nm, lower(i.name)) > 0.5)
    order by (lower(i.name) = nm) desc, extensions.similarity(lower(i.name), nm) desc, coalesce(i.frozen_on, i.bought_on)
    limit 1;
  if target is null then
    return 'I couldn''t find ' || nm || case when loc is null then '' else ' in the ' || public.tb_loc_name(loc) end || '.';
  end if;

  remaining := q;
  for r in select * from items i
      where i.household = hh and i.gone_at is null and i.qty > 0 and lower(i.name) = target and (loc is null or i.location = loc)
      order by coalesce(i.frozen_on, i.bought_on), i.added_at
  loop
    exit when remaining = 0;
    took := case when remaining < 0 then r.qty else least(remaining, r.qty) end;
    if took >= r.qty then
      update items set qty = 0, gone_at = now(), updated_at = now() where id = r.id;
    else
      update items set qty = qty - took, updated_at = now() where id = r.id;
    end if;
    insert into usage (household, name, location, qty) values (hh, r.name, r.location, took);
    if remaining > 0 then remaining := remaining - took; end if;
    loc := coalesce(loc, r.location);
    u := coalesce(u, r.unit);
    nm := r.name;
  end loop;
  select coalesce(sum(qty), 0) into total from items where household = hh and gone_at is null and lower(name) = target and location = loc;
  perform public.tb_ping(hh);
  return 'Removed ' || case when q < 0 then 'all the ' || lower(nm) else public.tb_qty_text(case when remaining > 0 then q - remaining else q end, u, nm) end
    || ' from the ' || public.tb_loc_name(loc) || '. '
    || case when total = 0 then 'That was the last of it.' else trim_scale(total)::text || ' left.' end;
end $$;

grant execute on function public.tb_voice(text, text) to anon, authenticated;
grant execute on function public.tb_parse(text) to anon, authenticated;
grant execute on function public.tb_hh() to anon, authenticated;

notify pgrst, 'reload schema';
