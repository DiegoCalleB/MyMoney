-- ADR-0006: libro de movimientos. Cuadre por moneda, traspaso ≠ aportación, escritura solo por RPC,
-- reversiones, ventana de 24 h y cargas JSON hostiles.
begin;
select plan(37);

select tests.create_user('alicia@example.test') as alicia \gset
select tests.create_user('vic@example.test') as vic \gset
select tests.create_user('beto@example.test') as beto \gset

select tests.authenticate_as(:'alicia');
select public.create_space('Hogar') as sp \gset
select public.create_invitation(:'sp', 'vic@example.test', 'viewer') as tok \gset
select tests.authenticate_as(:'vic');
select public.accept_invitation(:'tok');
select tests.authenticate_as(:'beto');
select public.create_space('Otro') as sp_b \gset
insert into public.accounts (space_id, name, kind, currency) values (:'sp_b', 'ajena', 'current', 'EUR') returning id as acc_b \gset

select tests.authenticate_as(:'alicia');
insert into public.accounts (space_id, name, kind, currency, liquidity) values (:'sp', 'Banco', 'current', 'EUR', 'immediate') returning id as bank \gset
insert into public.accounts (space_id, name, kind, currency, tax_wrapper) values (:'sp', 'Bróker', 'brokerage', 'EUR', 'none') returning id as broker \gset
insert into public.accounts (space_id, name, kind, currency) values (:'sp', 'Cuenta USD', 'current', 'USD') returning id as usd \gset
insert into public.assets (space_id, kind, name, currency, asset_class, ter_bps) values (:'sp', 'etf', 'ETF de prueba', 'EUR', 'equity', 20) returning id as etf \gset

-- 1. Aportación válida
select public.create_transaction(:'sp', 'contribution', '2026-01-10',
  jsonb_build_array(
    jsonb_build_object('role', 'external', 'amount_minor', -100000, 'currency', 'EUR'),
    jsonb_build_object('role', 'cash', 'account_id', :'bank', 'amount_minor', 100000, 'currency', 'EUR')),
  'Aportación inicial') as tx1 \gset
select is((select balance_minor from public.account_cash_balances(:'sp') where account_id = :'bank'::uuid), 100000::bigint, 'la aportación deja 1000,00 € en el banco');

-- 2-6. Invariantes
select throws_ok(
  format($$select public.create_transaction(%L, 'contribution', '2026-01-10', jsonb_build_array(
    jsonb_build_object('role','external','amount_minor',-100,'currency','EUR'),
    jsonb_build_object('role','cash','account_id',%L,'amount_minor',99,'currency','EUR')))$$, :'sp', :'bank'),
  '23514', null, 'una transacción descuadrada se rechaza');
select throws_ok(
  format($$select public.create_transaction(%L, 'internal_transfer', '2026-01-11', jsonb_build_array(
    jsonb_build_object('role','external','amount_minor',-100,'currency','EUR'),
    jsonb_build_object('role','cash','account_id',%L,'amount_minor',100,'currency','EUR')))$$, :'sp', :'broker'),
  '23514', null, 'un traspaso interno no puede tener patas externas (no puede contarse como aportación)');
select throws_ok(
  format($$select public.create_transaction(%L, 'contribution', '2026-01-11', jsonb_build_array(
    jsonb_build_object('role','cash','account_id',%L,'amount_minor',-100,'currency','EUR'),
    jsonb_build_object('role','cash','account_id',%L,'amount_minor',100,'currency','EUR')))$$, :'sp', :'bank', :'broker'),
  '23514', null, 'una aportación sin pata externa se rechaza');
select throws_ok(
  format($$select public.create_transaction(%L, 'adjustment', '2026-01-11', jsonb_build_array(
    jsonb_build_object('role','cash','account_id',%L,'amount_minor',-100,'currency','USD'),
    jsonb_build_object('role','external','amount_minor',100,'currency','USD')))$$, :'sp', :'bank'),
  '23514', null, 'la pata de efectivo debe estar en la moneda de su cuenta');
select throws_ok(
  format($$select public.create_transaction(%L, 'adjustment', '2026-01-11', jsonb_build_array(
    jsonb_build_object('role','external','amount_minor',0,'currency','EUR')))$$, :'sp'),
  '22023', null, 'menos de dos patas se rechaza');

-- 7-8. Permisos y aislamiento
select tests.authenticate_as(:'vic');
select throws_ok(
  format($$select public.create_transaction(%L, 'adjustment', '2026-01-11', jsonb_build_array(
    jsonb_build_object('role','external','amount_minor',-100,'currency','EUR'),
    jsonb_build_object('role','cash','account_id',%L,'amount_minor',100,'currency','EUR')))$$, :'sp', :'bank'),
  '42501', null, 'solo lectura no puede crear movimientos');
select tests.authenticate_as(:'alicia');
select throws_ok(
  format($$select public.create_transaction(%L, 'adjustment', '2026-01-11', jsonb_build_array(
    jsonb_build_object('role','external','amount_minor',-100,'currency','EUR'),
    jsonb_build_object('role','cash','account_id',%L,'amount_minor',100,'currency','EUR')))$$, :'sp', :'acc_b'),
  '23503', null, 'no se pueden usar cuentas de otro espacio en las patas');
select throws_ok(
  format($$select public.create_transaction(%L, 'adjustment', '2026-01-11', jsonb_build_array(
    jsonb_build_object('role','external','amount_minor',-100,'currency','EUR'),
    jsonb_build_object('role','cash','account_id',%L,'amount_minor',100,'currency','EUR')))$$, :'sp_b', :'acc_b'),
  '42501', null, 'no se escribe en un espacio ajeno');

-- 9. Traspaso interno: mueve efectivo sin tocar los flujos externos
select count(*) filter (where role = 'external') as ext_before from public.transaction_legs \gset
select public.create_transaction(:'sp', 'internal_transfer', '2026-01-12',
  jsonb_build_array(
    jsonb_build_object('role', 'cash', 'account_id', :'bank', 'amount_minor', -40000, 'currency', 'EUR'),
    jsonb_build_object('role', 'cash', 'account_id', :'broker', 'amount_minor', 40000, 'currency', 'EUR'))) as tx2 \gset
select is(
  (select array_agg(balance_minor order by balance_minor) from public.account_cash_balances(:'sp')),
  array[40000, 60000]::bigint[], 'el traspaso reparte 400/600 € entre las dos cuentas');
select is((select count(*) filter (where role = 'external') from public.transaction_legs), :ext_before::bigint, 'el traspaso no añade flujos externos');

-- 10. Compra con comisión y posición
select public.create_transaction(:'sp', 'buy', '2026-01-13',
  jsonb_build_array(
    jsonb_build_object('role', 'cash', 'account_id', :'broker', 'amount_minor', -10000, 'currency', 'EUR'),
    jsonb_build_object('role', 'position', 'account_id', :'broker', 'asset_id', :'etf', 'quantity', '9.95', 'amount_minor', 9950, 'currency', 'EUR'),
    jsonb_build_object('role', 'fee', 'charged_account_id', :'broker', 'amount_minor', 50, 'currency', 'EUR'))) as tx3 \gset
select results_eq(
  format($$select quantity, cost_minor from public.position_balances(%L)$$, :'sp'),
  $$values (9.95::numeric, 9950::bigint)$$, 'la compra crea una posición de 9,95 participaciones con coste 99,50 €');
select is((select balance_minor from public.account_cash_balances(:'sp') where account_id = :'broker'::uuid), 30000::bigint, 'el efectivo del bróker baja 100 € por la compra');

-- 11-12. Movimiento pendiente (traspaso entre gestoras en curso)
select public.create_transaction(:'sp', 'fund_switch', '2026-01-14',
  jsonb_build_array(
    jsonb_build_object('role', 'position', 'account_id', :'broker', 'asset_id', :'etf', 'quantity', '-1', 'amount_minor', -1000, 'currency', 'EUR'),
    jsonb_build_object('role', 'position', 'account_id', :'bank', 'asset_id', :'etf', 'quantity', '1', 'amount_minor', 1000, 'currency', 'EUR')),
  'Traspaso en curso', 'pending') as tx4 \gset
select is((select count(*)::int from public.position_balances(:'sp') where account_id = :'bank'::uuid), 0, 'un traspaso pendiente no cuenta por defecto');
select is((select count(*)::int from public.position_balances(:'sp', null, true) where account_id = :'bank'::uuid), 1, 'ni se oculta si se pide incluir pendientes');
update public.transactions set status = 'settled' where id = :'tx4';
select is((select count(*)::int from public.position_balances(:'sp') where account_id = :'bank'::uuid), 1, 'al liquidarse, entra en los saldos');
select throws_ok(format($$update public.transactions set status = 'pending' where id = %L$$, :'tx4'), '23514', null, 'un movimiento liquidado no vuelve a pendiente');

-- 13-16. Inmutabilidad y escritura solo por RPC
select throws_ok(
  format($$insert into public.transactions (space_id, kind, occurred_on) values (%L, 'adjustment', '2026-01-01')$$, :'sp'),
  '42501', null, 'no se inserta directamente en transactions');
select throws_ok(format($$delete from public.transactions where id = %L$$, :'tx1'), '42501', null, 'no se borra directamente en transactions');
select throws_ok(format($$update public.transaction_legs set amount_minor = 1 where transaction_id = %L$$, :'tx1'), '42501', null, 'no se modifican patas directamente');
select throws_ok(format($$update public.transactions set kind = 'sell' where id = %L$$, :'tx1'), '42501', null, 'el tipo de una transacción no se edita');

-- 17-20. Reversión
select public.reverse_transaction(:'tx3') as rev3 \gset
select is((select balance_minor from public.account_cash_balances(:'sp') where account_id = :'broker'::uuid), 40000::bigint, 'la reversión devuelve el efectivo de la compra');
select is((select quantity from public.position_balances(:'sp') where account_id = :'broker'::uuid and asset_id = :'etf'::uuid), -1::numeric, 'y deshace la posición comprada (solo queda la salida del traspaso: -1)');
select throws_ok(format($$select public.reverse_transaction(%L)$$, :'tx3'), '23514', 'El movimiento ya fue revertido', 'no se revierte dos veces');
select throws_ok(format($$select public.reverse_transaction(%L)$$, :'rev3'), '23514', null, 'una reversión no se revierte');

-- 21-23. Borrado: solo 24 h, y no si tiene reversión
select throws_ok(format($$select public.delete_transaction(%L)$$, :'tx3'), '23514', null, 'no se borra un movimiento revertido');
select lives_ok(format($$select public.delete_transaction(%L)$$, :'tx2'), 'se borra un movimiento reciente');
select tests.as_postgres();
set constraints all immediate; -- ejecuta los disparadores diferidos pendientes antes de alterar la tabla
alter table public.transactions disable trigger transactions_guard; -- solo en este test: simula el paso del tiempo
update public.transactions set created_at = now() - interval '25 hours' where id = :'tx1';
alter table public.transactions enable trigger transactions_guard;
set constraints all deferred;
select tests.authenticate_as(:'alicia');
select throws_ok(format($$select public.delete_transaction(%L)$$, :'tx1'), '23514', null, 'no se borra un movimiento de hace más de 24 h');

-- 24. Fecha de un liquidado antiguo: inmutable
select throws_ok(format($$update public.transactions set occurred_on = '2026-02-01' where id = %L$$, :'tx1'), '23514', null, 'la fecha de un movimiento antiguo no se cambia');

-- 25. La descripción sí se edita
select lives_ok(format($$update public.transactions set description = 'Corregida' where id = %L$$, :'tx1'), 'la descripción se puede corregir siempre');

-- 26-28. Cargas JSON hostiles
select public.create_transaction(:'sp', 'adjustment', '2026-01-20',
  jsonb_build_array(
    jsonb_build_object('role', 'external', 'amount_minor', '-999999999999999', 'currency', 'EUR', 'space_id', :'sp_b'),
    jsonb_build_object('role', 'cash', 'account_id', :'bank', 'amount_minor', '999999999999999', 'currency', 'EUR', 'space_id', :'sp_b'))) as tx5 \gset
select is((select sum(amount_minor) from public.transaction_legs where transaction_id = :'tx5' and role = 'cash'), 999999999999999::numeric, 'importes de hasta 10^15 llegan intactos como cadenas JSON');
select is((select count(*)::int from public.transaction_legs where transaction_id = :'tx5' and space_id = :'sp'::uuid), 2, 'el JSON no puede elegir el espacio de las patas (mass assignment)');
select throws_ok(
  format($$select public.create_transaction(%L, 'adjustment', '2026-01-20', jsonb_build_array(
    jsonb_build_object('role','external','amount_minor',-1000000000000001,'currency','EUR'),
    jsonb_build_object('role','cash','account_id',%L,'amount_minor',1000000000000001,'currency','EUR')))$$, :'sp', :'bank'),
  '23514', null, 'los importes absurdos fuera de rango se rechazan');
select throws_ok(
  format($$select public.create_transaction(%L, 'adjustment', '2026-01-20', '{"no":"array"}'::jsonb)$$, :'sp'),
  '22023', null, 'p_legs debe ser un array');
select throws_ok(
  format($$select public.create_transaction(%L, 'adjustment', '2026-01-20', jsonb_build_array(
    jsonb_build_object('role','position','account_id',%L,'amount_minor',-5,'currency','EUR'),
    jsonb_build_object('role','external','amount_minor',5,'currency','EUR')))$$, :'sp', :'bank'),
  '23514', null, 'una pata de posición sin activo ni cantidad se rechaza');

-- Auditoría de reversión y borrado, sin importes
select tests.as_postgres();
select ok((select count(*) = 2 from audit.events where space_id = :'sp' and action in ('transaction.reversed', 'transaction.deleted')), 'la reversión y el borrado quedan auditados');
select is((select count(*)::int from audit.events e where e.action like 'transaction.%'
  and exists (select 1 from jsonb_object_keys(e.metadata) k where k not in ('kind', 'reverses'))), 0, 'la auditoría de movimientos solo guarda tipo y enlace (sin importes ni descripciones)');

select * from finish();
rollback;
