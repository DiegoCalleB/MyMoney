-- RGPD art. 17: borrado real de la cuenta, sin clave secreta en la web.
begin;
select plan(14);

select tests.create_user('alicia@example.test') as alicia \gset
select tests.create_user('beto@example.test') as beto \gset
select tests.create_user('carla@example.test') as carla \gset

-- Alicia: propietaria única de A (con otro miembro), copropietaria de C con Beto; viewer en B de Beto.
select tests.authenticate_as(:'alicia');
select public.create_space('A de Alicia') as sp_a \gset
select public.create_space('C compartido') as sp_c \gset
select public.create_invitation(:'sp_a', 'carla@example.test', 'viewer') as ta \gset
select public.create_invitation(:'sp_c', 'beto@example.test', 'owner') as tc \gset
select tests.authenticate_as(:'carla'); select public.accept_invitation(:'ta');
select tests.authenticate_as(:'beto'); select public.accept_invitation(:'tc');
select public.create_space('B de Beto') as sp_b \gset
select public.create_invitation(:'sp_b', 'alicia@example.test', 'viewer') as tb \gset
select tests.authenticate_as(:'alicia'); select public.accept_invitation(:'tb');
insert into public.accounts (space_id, name, kind, currency) values (:'sp_a', 'Cuenta', 'current', 'EUR');
select tests.as_postgres();
select is((select count(*)::int from public.profiles where user_id = :'alicia'), 1, 'Alicia tiene perfil (creado por el disparador de alta o por create_space)');

-- Anon y otros no pueden
select tests.as_anon();
select throws_ok('select public.delete_my_account()', '42501', null, 'anon no puede borrar cuentas');

-- Con MFA activado se exige AAL2
select tests.as_postgres();
select tests.verify_mfa(:'alicia');
select tests.authenticate_as(:'alicia', 'aal1');
select throws_ok('select public.delete_my_account()', '42501', 'Requiere verificación MFA reciente', 'con MFA y sesión aal1 no se borra la cuenta');

select tests.authenticate_as(:'alicia', 'aal2');
select lives_ok('select public.delete_my_account()', 'con sesión aal2 se borra la cuenta');

select tests.as_postgres();
select is((select count(*)::int from auth.users where id = :'alicia'), 0, 'el usuario desaparece de auth.users');
select is((select count(*)::int from public.profiles where user_id = :'alicia'), 0, 'y su perfil');
select is((select count(*)::int from public.space_members where user_id = :'alicia'), 0, 'y todas sus membresías');
select is((select count(*)::int from public.spaces where id = :'sp_a'), 0, 'el espacio donde era la única propietaria se borra');
select is((select count(*)::int from public.accounts where space_id = :'sp_a'), 0, 'con todos sus datos');
select is((select count(*)::int from public.space_members where space_id = :'sp_a'), 0, 'y se retira el acceso a los demás miembros');
select is((select count(*)::int from public.spaces where id = :'sp_c'), 1, 'el espacio compartido con otro propietario sigue existiendo');
select is((select count(*)::int from public.space_members where space_id = :'sp_c' and role = 'owner'), 1, 'con su otro propietario');
select is((select count(*)::int from public.spaces where id = :'sp_b'), 1, 'el espacio ajeno donde era solo lectura sigue intacto');
select ok(exists (select 1 from audit.events where action = 'account.deleted' and metadata = '{}'::jsonb), 'queda constancia seudonimizada del borrado en la auditoría');

select * from finish();
rollback;
