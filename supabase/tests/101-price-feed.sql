-- Precios automáticos: las dos RPC son solo del servidor y respetan las restricciones de ref.prices.
begin;
select plan(15);

select tests.create_user('alicia@example.test') as alicia \gset
select tests.authenticate_as(:'alicia');
select public.create_space('A') as sp \gset
insert into public.assets (space_id, kind, name, ticker, currency, asset_class)
values (:'sp', 'crypto', 'Bitcoin', 'btc', 'EUR', 'crypto'),
       (:'sp', 'crypto', 'Ether', 'ETH', 'EUR', 'crypto'),
       (:'sp', 'crypto', 'Cosa rara', 'no es un ticker', 'EUR', 'crypto'),
       (:'sp', 'crypto', 'Sin ticker', null, 'EUR', 'crypto'),
       (:'sp', 'etf', 'Un ETF', 'XYZ', 'EUR', 'equity');

-- Un usuario autenticado y anon no pueden ejecutarlas
select throws_ok($$select * from public.crypto_tickers()$$, '42501', null, 'un usuario no lista criptoactivos');
select throws_ok($$select public.upsert_ref_prices('[]'::jsonb)$$, '42501', null, 'un usuario no escribe precios');
select tests.as_anon();
select throws_ok($$select * from public.crypto_tickers()$$, '42501', null, 'anon no lista criptoactivos');
select throws_ok($$select public.upsert_ref_prices('[]'::jsonb)$$, '42501', null, 'anon no escribe precios');

-- Con el rol del servidor
select tests.as_postgres();
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select results_eq($$select ticker from public.crypto_tickers()$$, $$values ('BTC'), ('ETH')$$,
  'solo tickers de criptoactivos válidos, en mayúsculas y sin repetir');

select is(public.upsert_ref_prices(jsonb_build_array(
  jsonb_build_object('instrument', 'BTC', 'as_of', '2026-10-28', 'price', '60123.45', 'currency', 'EUR', 'source', 'binance:spot'),
  jsonb_build_object('instrument', 'ETH', 'as_of', '2026-10-28', 'price', '2500.1', 'currency', 'EUR', 'source', 'binance:spot'))),
  2, 'inserta dos precios');
select is(public.upsert_ref_prices(jsonb_build_array(
  jsonb_build_object('instrument', 'BTC', 'as_of', '2026-10-28', 'price', '61000', 'currency', 'EUR', 'source', 'binance:spot'))),
  1, 'repetir el mismo día actualiza en lugar de duplicar');
select results_eq($$select instrument, price::text from ref.prices order by instrument$$,
  $$values ('BTC', '61000.0000000000'), ('ETH', '2500.1000000000')$$, 'la última escritura del día gana');

select throws_ok($$select public.upsert_ref_prices('{}'::jsonb)$$, '22023', null, 'las filas deben ser un array');
select throws_ok(
  $$select public.upsert_ref_prices((select jsonb_agg(jsonb_build_object('instrument', 'A' || g, 'as_of', '2026-10-28', 'price', '1', 'currency', 'EUR', 'source', 's')) from generate_series(1, 501) g))$$,
  '22023', null, 'más de 500 precios se rechazan');
select throws_ok($$select public.upsert_ref_prices('[{"instrument":"BTC","as_of":"2026-10-29","price":"0","currency":"EUR","source":"s"}]'::jsonb)$$,
  '23514', null, 'un precio cero se rechaza');
select throws_ok($$select public.upsert_ref_prices('[{"instrument":"btc!","as_of":"2026-10-29","price":"1","currency":"EUR","source":"s"}]'::jsonb)$$,
  '23514', null, 'un instrumento mal formado se rechaza');
select throws_ok($$select public.upsert_ref_prices('[{"instrument":"BTC","as_of":"2026-10-29","price":"1","currency":"ZZZ","source":"s"}]'::jsonb)$$,
  '23503', null, 'una moneda desconocida se rechaza');
select throws_ok($$select public.upsert_ref_prices('[{"instrument":"BTC","as_of":"2026-10-29","price":"1","currency":"EUR","source":""}]'::jsonb)$$,
  '23514', null, 'sin fuente se rechaza');
select is((select count(*)::int from ref.prices), 2, 'los rechazos no dejan precios a medias');

select * from finish();
rollback;
