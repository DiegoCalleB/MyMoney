-- ADR-0022: tu parte de una cuenta compartida.
begin;
select plan(8);

select tests.create_user('alicia@example.test') as alicia \gset
select tests.create_user('vic@example.test') as vic \gset

select tests.authenticate_as(:'alicia');
select public.create_space('A') as sp \gset
select public.create_invitation(:'sp', 'vic@example.test', 'viewer') as t1 \gset
select tests.authenticate_as(:'vic'); select public.accept_invitation(:'t1');
select tests.authenticate_as(:'alicia');
insert into public.accounts (space_id, name, kind, currency) values (:'sp', 'Propia', 'current', 'EUR') returning id as own \gset
insert into public.accounts (space_id, name, kind, currency, share_bps) values (:'sp', 'Conjunta', 'current', 'EUR', 5000) returning id as joint \gset

select throws_ok(
  format($$insert into public.accounts (space_id, name, kind, currency, share_bps) values (%L, 'X', 'current', 'EUR', 0)$$, :'sp'),
  '23514', null, 'la parte no puede ser 0');
select throws_ok(
  format($$insert into public.accounts (space_id, name, kind, currency, share_bps) values (%L, 'Y', 'current', 'EUR', 10001)$$, :'sp'),
  '23514', null, 'la parte no puede pasar del 100 %');
select is((select share_bps from public.accounts where id = :'own'), 10000, 'por defecto la cuenta es toda tuya');

select public.create_transaction(:'sp', 'expense', '2026-10-05', jsonb_build_array(
  jsonb_build_object('role', 'cash', 'account_id', :'joint', 'amount_minor', '-10001', 'currency', 'EUR'),
  jsonb_build_object('role', 'external', 'amount_minor', '10001', 'currency', 'EUR')));
select public.create_transaction(:'sp', 'expense', '2026-10-06', jsonb_build_array(
  jsonb_build_object('role', 'cash', 'account_id', :'own', 'amount_minor', '-1000', 'currency', 'EUR'),
  jsonb_build_object('role', 'external', 'amount_minor', '1000', 'currency', 'EUR')));

select is((select sum(amount_minor)::int from public.category_totals(:'sp', '2026-10-01', '2026-10-31') where flow = 'expense'),
  6001, 'los gastos cuentan tu parte (la mitad de 100,01 redondeada + 10,00)');
select is((select expense_minor::int from public.monthly_cashflow(:'sp', '2026-10-01', '2026-10-31')),
  6001, 'el resumen mensual también');

select lives_ok(format($$update public.accounts set share_bps = 6000 where id = %L$$, :'joint'), 'un editor cambia tu parte');
select tests.authenticate_as(:'vic');
select is((select count(*)::int from public.accounts where id = :'joint'), 1, 'un lector ve la cuenta');
update public.accounts set share_bps = 100 where id = :'joint'; -- sin permiso: no toca ninguna fila
select is((select share_bps from public.accounts where id = :'joint'), 6000, 'el cambio quedó guardado');

select * from finish();
rollback;
