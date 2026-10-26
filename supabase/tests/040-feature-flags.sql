-- ADR-0010/0011: precedencia de flags y nivel 3 desactivado por defecto.
begin;
select plan(5);

select tests.create_user('ana@example.test') as ana \gset
select tests.authenticate_as(:'ana');
select public.create_space('España') as es \gset
select public.create_space('Portugal', 'household', 'PT') as pt \gset

select is(public.feature_enabled('reco.level1', :'es'), true, 'nivel 1 activado globalmente');
select is(public.feature_enabled('reco.level2', :'es'), true, 'nivel 2 activado en España');
select is(public.feature_enabled('reco.level2', :'pt'), false, 'nivel 2 desactivado en países sin plantillas');
select is(public.feature_enabled('reco.level3', :'es'), false, 'nivel 3 desactivado');

select tests.as_postgres();
insert into ref.feature_flags (key, scope_type, scope_value, enabled) values ('reco.level2', 'space', :'es', false);
select tests.authenticate_as(:'ana');
select is(public.feature_enabled('reco.level2', :'es'), false, 'la flag de espacio tiene prioridad sobre la de país');

select * from finish();
rollback;
