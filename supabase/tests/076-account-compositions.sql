-- ADR-0024: reparto por clase de activo de una cuenta.
begin;
select plan(16);

select tests.create_user('alicia@example.test') as alicia \gset
select tests.create_user('vic@example.test') as vic \gset
select tests.create_user('beto@example.test') as beto \gset

select tests.authenticate_as(:'alicia');
select public.create_space('Hogar') as sp \gset
select public.create_invitation(:'sp', 'vic@example.test', 'viewer') as t1 \gset
select tests.authenticate_as(:'vic'); select public.accept_invitation(:'t1');
select tests.authenticate_as(:'beto'); select public.create_space('Otro') as sp_b \gset

select tests.authenticate_as(:'alicia');
insert into public.accounts (space_id, name, kind, currency) values (:'sp', 'Bróker', 'brokerage', 'EUR') returning id as brk \gset
set constraints all immediate;

select lives_ok(format($$insert into public.account_compositions (space_id, account_id, asset_class, weight_bps) values (%L, %L, 'equity', 6000), (%L, %L, 'fixed_income', 3000)$$, :'sp', :'brk', :'sp', :'brk'),
  'se puede repartir una cuenta por clases');
select throws_ok(format($$insert into public.account_compositions (space_id, account_id, asset_class, weight_bps) values (%L, %L, 'cash', 1001)$$, :'sp', :'brk'),
  '23514', null, 'el reparto de una cuenta no puede superar el 100 %');
select lives_ok(format($$insert into public.account_compositions (space_id, account_id, asset_class, weight_bps) values (%L, %L, 'cash', 1000)$$, :'sp', :'brk'),
  'sí puede sumar exactamente el 100 %');
select throws_ok(format($$insert into public.account_compositions (space_id, account_id, asset_class, weight_bps) values (%L, %L, 'cash', 1)$$, :'sp', :'brk'),
  '23505', null, 'una clase no se repite en la misma cuenta');
select throws_ok(format($$insert into public.account_compositions (space_id, account_id, asset_class, weight_bps) values (%L, %L, 'mixed', 1)$$, :'sp', :'brk'),
  '23514', null, 'mixed no es una clase de reparto: el reparto es la mezcla');
select throws_ok(format($$update public.account_compositions set weight_bps = 10001 where account_id = %L and asset_class = 'cash'$$, :'brk'),
  '23514', null, 'el peso no puede pasar de 10000 pb');

select tests.authenticate_as(:'vic');
select is((select count(*)::int from public.account_compositions), 3, 'un lector ve el reparto');
select throws_ok(format($$insert into public.account_compositions (space_id, account_id, asset_class, weight_bps) values (%L, %L, 'crypto', 1)$$, :'sp', :'brk'),
  '42501', null, 'un lector no puede escribirlo');

select tests.authenticate_as(:'beto');
select is((select count(*)::int from public.account_compositions), 0, 'otro espacio no lo ve');
select throws_ok(format($$insert into public.account_compositions (space_id, account_id, asset_class, weight_bps) values (%L, %L, 'crypto', 1)$$, :'sp_b', :'brk'),
  '23503', null, 'ni referenciar una cuenta de otro espacio');

-- RPC de sustitución
select tests.authenticate_as(:'alicia');
select lives_ok(format($$select public.set_account_composition(%L, %L, '{"equity": 7000, "crypto": 500, "cash": 0}'::jsonb)$$, :'sp', :'brk'),
  'set_account_composition sustituye el reparto');
select is((select array_agg(asset_class || ':' || weight_bps order by asset_class) from public.account_compositions where account_id = :'brk'),
  array['crypto:500', 'equity:7000'], 'guarda las clases con peso y descarta las de peso 0');
select throws_ok(format($$select public.set_account_composition(%L, %L, '{"equity": 9000, "cash": 2000}'::jsonb)$$, :'sp', :'brk'),
  '23514', null, 'la RPC respeta el máximo del 100 %');
select lives_ok(format($$select public.set_account_composition(%L, %L, '{}'::jsonb)$$, :'sp', :'brk'),
  'un objeto vacío borra el reparto');
select is((select count(*)::int from public.account_compositions where account_id = :'brk'), 0, 'y no queda nada');
select tests.authenticate_as(:'vic');
select throws_ok(format($$select public.set_account_composition(%L, %L, '{"equity": 100}'::jsonb)$$, :'sp', :'brk'),
  '42501', null, 'un lector no puede usar la RPC');

select * from finish();
rollback;
