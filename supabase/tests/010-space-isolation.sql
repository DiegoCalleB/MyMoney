-- HU-02: un miembro del espacio A no puede leer, crear, modificar ni borrar nada del espacio B.
begin;
select plan(16);

select tests.create_user('ana@example.test') as ana \gset
select tests.create_user('beto@example.test') as beto \gset

select tests.authenticate_as(:'ana');
select public.create_space('Casa de Ana') as space_a \gset
select tests.authenticate_as(:'beto');
select public.create_space('Casa de Beto') as space_b \gset

-- Beto solo ve lo suyo.
select results_eq('select id from public.spaces', array[:'space_b'::uuid], 'Beto solo ve su espacio');
select is_empty(format('select 1 from public.spaces where id = %L', :'space_a'), 'Beto no ve el espacio de Ana aunque conozca su id');
select is_empty(format('select 1 from public.space_members where space_id = %L', :'space_a'), 'Beto no ve los miembros de Ana');
select is_empty(format('select 1 from public.profiles where user_id = %L', :'ana'), 'Beto no ve el perfil de Ana');

-- Intentos de escritura sobre el espacio ajeno: no afectan a ninguna fila o fallan.
select is_empty(format($$update public.spaces set name = 'pirateado' where id = %L returning 1$$, :'space_a'), 'Beto no puede renombrar el espacio de Ana');
select is_empty(format('delete from public.spaces where id = %L returning 1', :'space_a'), 'Beto no puede borrar el espacio de Ana');
select is_empty(format('delete from public.space_members where space_id = %L returning 1', :'space_a'), 'Beto no puede expulsar a Ana');
select throws_ok(
  format($$insert into public.space_members (space_id, user_id, role) values (%L, %L, 'owner')$$, :'space_a', :'beto'),
  '42501', null, 'Beto no puede añadirse como miembro de otro espacio');
select throws_ok(
  format($$select public.create_invitation(%L, 'beto2@example.test', 'editor')$$, :'space_a'),
  '42501', 'Solo un propietario puede invitar', 'Beto no puede invitar al espacio de Ana');
select throws_ok(
  $$insert into public.spaces (name) values ('directo')$$,
  '42501', null, 'nadie crea espacios saltándose la RPC');
select is(public.feature_enabled('reco.level2', :'space_a'), false, 'las flags de un espacio ajeno no se revelan');

-- Comprobación como superusuario: nada ha cambiado en el espacio de Ana.
select tests.as_postgres();
select is((select name from public.spaces where id = :'space_a'), 'Casa de Ana', 'el espacio de Ana sigue intacto');
select is((select count(*)::int from public.space_members where space_id = :'space_a'), 1, 'Ana sigue siendo la única miembro');

-- anon no puede nada.
select tests.as_anon();
select throws_ok('select 1 from public.spaces', '42501', null, 'anon no puede leer espacios');
select throws_ok($$select public.create_space('x')$$, '42501', null, 'anon no puede crear espacios');

-- Sin JWT válido (uid nulo) la RPC se niega.
select tests.as_postgres();
set local role authenticated;
select throws_ok($$select public.create_space('x')$$, '42501', 'No autenticado', 'sin usuario no se crea nada');

select * from finish();
rollback;
