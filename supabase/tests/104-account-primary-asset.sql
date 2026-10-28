-- Producto de una cuenta: aislamiento entre espacios y permisos.
begin;
select plan(7);

select tests.create_user('alicia@example.test') as alicia \gset
select tests.create_user('vic@example.test') as vic \gset
select tests.create_user('beto@example.test') as beto \gset

create function tests.try_unlink(p uuid) returns integer language plpgsql as $$
declare n integer;
begin
  update public.accounts set primary_asset_id = null where id = p;
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function tests.try_unlink(uuid) to authenticated;

select tests.authenticate_as(:'alicia');
select public.create_space('A') as sp \gset
select public.create_invitation(:'sp', 'vic@example.test', 'viewer') as t1 \gset
select tests.authenticate_as(:'vic'); select public.accept_invitation(:'t1');
select tests.authenticate_as(:'beto'); select public.create_space('B') as sp_b \gset
insert into public.assets (space_id, kind, name, currency, asset_class) values (:'sp_b'::uuid, 'mutual_fund', 'Ajeno', 'EUR', 'mixed') returning id as ast_b \gset
select tests.authenticate_as(:'alicia');
insert into public.accounts (space_id, name, kind, currency) values (:'sp', 'Fondo', 'fund_holding', 'EUR') returning id as acc \gset
insert into public.assets (space_id, kind, name, currency, asset_class) values (:'sp', 'mutual_fund', 'Fondo', 'EUR', 'mixed') returning id as ast \gset

select lives_ok(format($$update public.accounts set primary_asset_id = %L where id = %L$$, :'ast', :'acc'), 'quien escribe vincula un activo de su espacio');
select is((select primary_asset_id from public.accounts where id = :'acc'::uuid), :'ast'::uuid, 'queda vinculado');
select throws_ok(format($$update public.accounts set primary_asset_id = %L where id = %L$$, :'ast_b', :'acc'), '23503', null, 'no se vincula un activo de otro espacio (FK compuesta)');
select tests.authenticate_as(:'vic');
select is(tests.try_unlink(:'acc'::uuid), 0, 'solo lectura no cambia nada');
select tests.authenticate_as(:'beto');
select is(tests.try_unlink(:'acc'::uuid), 0, 'otro espacio no cambia nada');
select tests.as_postgres();
delete from public.assets where id = :'ast'::uuid;
select is((select primary_asset_id from public.accounts where id = :'acc'::uuid), null, 'borrar el activo desvincula la cuenta sin borrarla');
select is((select count(*)::int from public.accounts where id = :'acc'::uuid), 1, 'y la cuenta sigue ahí');

select * from finish();
rollback;
