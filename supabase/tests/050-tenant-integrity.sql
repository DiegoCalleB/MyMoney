-- Integridad entre espacios: una fila de un espacio no puede referenciar datos de otro.
-- Metatests sobre el catálogo + ataques concretos.
begin;
select plan(10);

-- Toda FK entre tablas con space_id incluye space_id (clave compuesta).
select is(
  (select coalesce(array_agg(c.conrelid::regclass::text || ' -> ' || c.confrelid::regclass::text || ' (' || c.conname || ')' order by c.conname), '{}')
     from pg_constraint c
    where c.contype = 'f' and c.connamespace = 'public'::regnamespace
      and exists (select 1 from pg_attribute a where a.attrelid = c.conrelid and a.attname = 'space_id' and not a.attisdropped)
      and exists (select 1 from pg_attribute a where a.attrelid = c.confrelid and a.attname = 'space_id' and not a.attisdropped)
      and not exists (select 1 from pg_attribute a
                       where a.attrelid = c.conrelid and a.attname = 'space_id' and a.attnum = any (c.conkey))),
  '{}'::text[],
  'toda FK entre tablas con space_id es compuesta e incluye space_id'
);

-- Toda FK tiene un índice cuyas primeras columnas son las de la FK (en cualquier orden).
select is(
  (select coalesce(array_agg(c.conrelid::regclass::text || ' (' || c.conname || ')' order by c.conname), '{}')
     from pg_constraint c
    where c.contype = 'f' and c.connamespace in ('public'::regnamespace, 'ref'::regnamespace)
      and not exists (
        select 1 from pg_index i
         where i.indrelid = c.conrelid and i.indisvalid
           and (select array_agg(k order by k)
                  from unnest((string_to_array(i.indkey::text, ' ')::int2[])[1:cardinality(c.conkey)]) k)
             = (select array_agg(k order by k) from unnest(c.conkey) k))),
  '{}'::text[],
  'toda clave foránea tiene un índice de apoyo'
);

-- Toda tabla con space_id referencia a spaces con borrado en cascada (borrar un espacio borra todo).
select is(
  (select coalesce(array_agg(t.table_name::text order by 1), '{}')
     from information_schema.columns t
    where t.table_schema = 'public' and t.column_name = 'space_id'
      and not exists (
        select 1 from pg_constraint c
         where c.conrelid = format('public.%I', t.table_name)::regclass and c.contype = 'f'
           and c.confrelid = 'public.spaces'::regclass and c.confdeltype = 'c')),
  '{}'::text[],
  'toda tabla con space_id cae en cascada al borrar su espacio'
);

-- Ataque: referenciar cuentas y activos de otro espacio.
select tests.create_user('alicia@example.test') as alicia \gset
select tests.create_user('beto@example.test') as beto \gset
select tests.authenticate_as(:'alicia');
select public.create_space('A') as space_a \gset
select tests.authenticate_as(:'beto');
select public.create_space('B') as space_b \gset

select tests.as_postgres();
insert into public.accounts (space_id, name, kind, currency) values (:'space_a', 'cuenta A', 'current', 'EUR') returning id as acc_a \gset
insert into public.accounts (space_id, name, kind, currency) values (:'space_b', 'cuenta B', 'current', 'EUR') returning id as acc_b \gset
insert into public.assets (space_id, kind, name, currency, asset_class) values (:'space_a', 'etf', 'activo A', 'EUR', 'equity') returning id as asset_a \gset
insert into public.persons (space_id, display_name, kind) values (:'space_a', 'Persona A', 'adult') returning id as person_a \gset
insert into public.transactions (space_id, kind, occurred_on) values (:'space_b', 'adjustment', '2026-01-01') returning id as tx_b \gset

select throws_ok(
  format($$insert into public.transaction_legs (transaction_id, space_id, role, account_id, amount_minor, currency) values (%L, %L, 'cash', %L, 100, 'EUR')$$, :'tx_b', :'space_b', :'acc_a'),
  '23503', null, 'una pata del espacio B no puede apuntar a una cuenta del espacio A');
select throws_ok(
  format($$insert into public.valuations (space_id, account_id, as_of, value_minor, currency) values (%L, %L, '2026-01-01', 100, 'EUR')$$, :'space_b', :'acc_a'),
  '23503', null, 'una valoración del espacio B no puede apuntar a una cuenta del espacio A');
select throws_ok(
  format($$insert into public.account_holders (account_id, person_id, space_id, share_bps) values (%L, %L, %L, 10000)$$, :'acc_b', :'person_a', :'space_b'),
  '23503', null, 'un titular de otro espacio no puede asignarse a una cuenta ajena');
select throws_ok(
  format($$insert into public.goals (space_id, kind, name, target_minor, currency, person_id) values (%L, 'custom', 'x', 1, 'EUR', %L)$$, :'space_b', :'person_a'),
  '23503', null, 'un objetivo no puede apuntar a una persona de otro espacio');

insert into public.pockets (space_id, name) values (:'space_b', 'Bolsillo B') returning id as pk_b \gset
select throws_ok(
  format($$insert into public.pocket_allocations (space_id, pocket_id, account_id, weight_bps) values (%L, %L, %L, 5000)$$, :'space_b', :'pk_b', :'acc_a'),
  '23503', null, 'un bolsillo del espacio B no puede repartir una cuenta del espacio A');
select throws_ok(
  format($$insert into public.advice_rules (space_id, template, scope, pocket_id, metric, comparator, threshold, unit) values (%L, 't', 'pocket', %L, 'm', 'lt', 1, 'count')$$, :'space_a', :'pk_b'),
  '23503', null, 'una regla del espacio A no puede apuntar a un bolsillo del espacio B');
select throws_ok(
  format($$insert into public.cash_rate_tiers (space_id, account_id, effective_from, rate_bps, currency, source) values (%L, %L, '2026-01-01', 100, 'EUR', 'f')$$, :'space_b', :'acc_a'),
  '23503', null, 'un tramo de remuneración no puede apuntar a una cuenta de otro espacio');

select * from finish();
rollback;
