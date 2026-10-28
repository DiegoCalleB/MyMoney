-- ADR-0023: carga del IPC solo por service_role y de forma idempotente.
begin;
select plan(10);

select tests.create_user('alicia@example.test') as alicia \gset

select tests.authenticate_as(:'alicia');
select throws_ok($$select public.upsert_inflation_index('ES', 'IPC251852', '[{"period":"2026-01-01","index":"100"}]'::jsonb)$$,
  '42501', null, 'un usuario autenticado no puede cargar el IPC');
select tests.as_anon();
select throws_ok($$select public.upsert_inflation_index('ES', 'IPC251852', '[{"period":"2026-01-01","index":"100"}]'::jsonb)$$,
  '42501', null, 'anon tampoco');

select tests.as_postgres();
set local role service_role;
select is(public.upsert_inflation_index('ES', 'IPC251852',
  '[{"period":"2026-01-01","index":"100"},{"period":"2026-02-01","index":"100.5"},{"period":"2026-03-01","index":"101.25"}]'::jsonb),
  3, 'service_role inserta las observaciones nuevas');
select is(public.upsert_inflation_index('ES', 'IPC251852',
  '[{"period":"2026-01-01","index":"100"},{"period":"2026-02-01","index":"100.5"}]'::jsonb),
  0, 'repetir la carga no cambia nada');
select is(public.upsert_inflation_index('ES', 'IPC251852',
  '[{"period":"2026-02-01","index":"100.6"},{"period":"2026-04-01","index":"102"}]'::jsonb),
  2, 'un valor revisado se actualiza y un mes nuevo se añade');
select throws_ok($$select public.upsert_inflation_index('ES', 'IPC251852', '[]'::jsonb)$$,
  '22023', null, 'una lista vacía se rechaza');
select throws_ok($$select public.upsert_inflation_index('ES', 'IPC251852', '{"period":"2026-01-01"}'::jsonb)$$,
  '22023', null, 'algo que no es una lista se rechaza');
select throws_ok($$select public.upsert_inflation_index('ES', 'IPC251852', '[{"period":"2026-05-15","index":"100"}]'::jsonb)$$,
  '23514', null, 'el periodo debe ser el primer día del mes');
select throws_ok($$select public.upsert_inflation_index('ES', 'IPC251852', '[{"period":"2026-05-01","index":"0"}]'::jsonb)$$,
  '23514', null, 'el índice debe ser positivo');

reset role;
select tests.authenticate_as(:'alicia');
select is((select index_value from public.inflation_index where country = 'ES' and period = '2026-02-01'),
  100.6000::numeric, 'un usuario autenticado lee el valor actualizado en la vista');

select * from finish();
rollback;
