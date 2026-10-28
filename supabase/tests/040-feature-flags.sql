-- ADR-0010/0011: precedencia de flags y nivel 3 desactivado por defecto.
begin;
select plan(7);

select tests.create_user('alicia@example.test') as alicia \gset
select tests.authenticate_as(:'alicia');
select public.create_space('España') as es \gset
select public.create_space('Portugal', 'household', 'PT') as pt \gset

select is(public.feature_enabled('reco.level1', :'es'), true, 'nivel 1 activado globalmente');
select is(public.feature_enabled('reco.level2', :'es'), true, 'nivel 2 activado en España');
select is(public.feature_enabled('reco.level2', :'pt'), false, 'nivel 2 desactivado en países sin plantillas');
select is(public.feature_enabled('reco.level3', :'es'), false, 'nivel 3 desactivado');

select tests.as_postgres();
insert into ref.feature_flags (key, scope_type, scope_value, enabled) values ('reco.level2', 'space', :'es', false);
select tests.authenticate_as(:'alicia');
select is(public.feature_enabled('reco.level2', :'es'), false, 'la flag de espacio tiene prioridad sobre la de país');

-- Las flags de ámbito "space" no se filtran a otros espacios (no se revelan ids ajenos)
select tests.create_user('beto@example.test') as beto \gset
select is((select count(*)::int from ref.feature_flags where scope_type = 'space'), 1, 'el miembro ve la flag de su propio espacio');
select tests.authenticate_as(:'beto');
select is((select count(*)::int from ref.feature_flags where scope_type = 'space'), 0, 'otro usuario no ve las flags de espacios ajenos');

select * from finish();
rollback;
