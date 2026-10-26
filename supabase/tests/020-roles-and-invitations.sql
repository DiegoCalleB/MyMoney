-- HU-02 / HU-03: roles, invitaciones de un solo uso, asesor con caducidad, último propietario y AAL2.
begin;
select plan(29);

select tests.create_user('alicia@example.test') as alicia \gset
select tests.create_user('eva@example.test') as eva \gset
select tests.create_user('vic@example.test') as vic \gset
select tests.create_user('aser@example.test') as aser \gset
select tests.create_user('intruso@example.test') as intruso \gset

select tests.authenticate_as(:'alicia');
select public.create_space('Familia') as space \gset
select public.create_invitation(:'space', 'EVA@example.test', 'editor') as tok_eva \gset
select public.create_invitation(:'space', 'vic@example.test', 'viewer') as tok_vic \gset
select public.create_invitation(:'space', 'aser@example.test', 'advisor', 7::smallint) as tok_aser \gset

select is((select count(*)::int from public.space_invitations where space_id = :'space'), 3, 'la propietaria ve sus invitaciones');
select throws_ok('select token_hash from public.space_invitations', '42501', null, 'ni la propietaria puede leer los hashes de los tokens');
select throws_ok('select email_normalized from public.space_invitations', '42501', null, 'los correos invitados no se exponen por la API');

-- Aceptación: correo distinto, token mal formado, correcto, reutilización.
select tests.authenticate_as(:'intruso');
select throws_ok(format('select public.accept_invitation(%L)', :'tok_eva'), '22023', 'Invitación no válida o caducada', 'otro correo no puede usar la invitación');
select throws_ok($$select public.accept_invitation('esto no es base64 %%%')$$, '22023', 'Invitación no válida o caducada', 'un token mal formado da el mismo error genérico');

select tests.authenticate_as(:'eva');
select is(public.accept_invitation(:'tok_eva'), :'space'::uuid, 'Eva acepta su invitación (correo sin distinguir mayúsculas)');
select throws_ok(format('select public.accept_invitation(%L)', :'tok_eva'), '22023', 'Invitación no válida o caducada', 'la invitación es de un solo uso');

select tests.authenticate_as(:'vic');
select lives_ok(format('select public.accept_invitation(%L)', :'tok_vic'), 'Vic acepta como solo lectura');
select tests.authenticate_as(:'aser');
select lives_ok(format('select public.accept_invitation(%L)', :'tok_aser'), 'el asesor acepta');

select tests.as_postgres();
select is((select email_normalized from public.space_invitations where accepted_by = :'eva'), null, 'el correo se borra al aceptar');
select ok((select expires_at between now() + interval '6 days' and now() + interval '8 days'
             from public.space_members where user_id = :'aser'), 'el acceso de asesor caduca en los días concedidos');

-- Permisos por rol.
select tests.authenticate_as(:'eva');
select is_empty(format($$update public.spaces set name = 'x' where id = %L returning 1$$, :'space'), 'un editor no puede cambiar el espacio');
select is_empty(format($$update public.space_members set role = 'owner' where space_id = %L and user_id = %L returning 1$$, :'space', :'eva'), 'un editor no puede ascenderse');
select throws_ok(format($$select public.create_invitation(%L, 'x@example.test', 'owner')$$, :'space'), '42501', 'Solo un propietario puede invitar', 'un editor no puede invitar');
select is((select count(*)::int from public.space_members), 4, 'un editor ve a todos los miembros');

select tests.authenticate_as(:'vic');
select is_empty(format($$update public.spaces set name = 'x' where id = %L returning 1$$, :'space'), 'solo lectura no puede cambiar el espacio');
select is((select count(*)::int from public.profiles), 4, 'solo lectura ve los perfiles de los miembros no asesores y el suyo');

select tests.authenticate_as(:'aser');
select results_eq('select user_id from public.space_members', array[:'aser'::uuid], 'el asesor solo ve su propia membresía');
select results_eq('select user_id from public.profiles', array[:'aser'::uuid], 'el asesor no ve los perfiles de la familia');
select is((select count(*)::int from public.spaces), 1, 'el asesor vigente ve el espacio');

-- Caducidad del asesor: sin procesos programados, la RLS deja de concederle acceso.
select tests.as_postgres();
update public.space_members set expires_at = now() - interval '1 second' where user_id = :'aser';
select tests.authenticate_as(:'aser');
select is((select count(*)::int from public.spaces), 0, 'el asesor caducado no ve nada');

select tests.as_postgres();
select throws_ok(format($$update public.space_members set expires_at = null where user_id = %L$$, :'aser'), '23514', null, 'un asesor siempre tiene caducidad');

-- Último propietario.
select tests.authenticate_as(:'alicia');
select throws_ok(format('delete from public.space_members where space_id = %L and user_id = %L', :'space', :'alicia'),
  '23514', 'Un espacio debe tener al menos un propietario', 'la última propietaria no puede irse dejando miembros');
select throws_ok(format($$update public.space_members set role = 'editor' where space_id = %L and user_id = %L$$, :'space', :'alicia'),
  '23514', 'Un espacio debe tener al menos un propietario', 'la última propietaria no puede degradarse');
select is((select count(*)::int from (
  select 1 from public.space_members where space_id = :'space' and user_id = :'vic') x), 1, 'Vic sigue en el espacio');
select ok(exists(select 1 from public.space_members where user_id = :'alicia' and role = 'owner'), 'Alicia sigue siendo propietaria');

-- AAL2: con MFA verificado, las acciones sensibles exigen sesión aal2.
select tests.verify_mfa(:'alicia');
select tests.authenticate_as(:'alicia', 'aal1');
select is_empty(format($$update public.spaces set name = 'Renombrado' where id = %L returning 1$$, :'space'), 'con MFA y sesión aal1 no se cambia el espacio');
select tests.authenticate_as(:'alicia', 'aal2');
select isnt_empty(format($$update public.spaces set name = 'Renombrado' where id = %L returning 1$$, :'space'), 'con sesión aal2 sí');

-- Un espacio que se queda sin miembros se borra.
select tests.authenticate_as(:'intruso');
select public.create_space('Solo') as solo \gset
delete from public.space_members where space_id = :'solo';
select tests.as_postgres();
select is((select count(*)::int from public.spaces where id = :'solo'), 0, 'un espacio sin miembros desaparece');

select * from finish();
rollback;
