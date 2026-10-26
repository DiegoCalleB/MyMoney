-- ADR-0008: idempotencia de importaciones (archivo y fila) y políticas del bucket privado "imports".
begin;
select plan(15);

select tests.create_user('alicia@example.test') as alicia \gset
select tests.create_user('vic@example.test') as vic \gset
select tests.create_user('aser@example.test') as aser \gset
select tests.create_user('beto@example.test') as beto \gset

select tests.authenticate_as(:'alicia');
select public.create_space('A') as sp \gset
select public.create_invitation(:'sp', 'vic@example.test', 'viewer') as t1 \gset
select public.create_invitation(:'sp', 'aser@example.test', 'advisor', 5::smallint) as t2 \gset
select tests.authenticate_as(:'vic'); select public.accept_invitation(:'t1');
select tests.authenticate_as(:'aser'); select public.accept_invitation(:'t2');
select tests.authenticate_as(:'beto'); select public.create_space('B') as sp_b \gset

select tests.authenticate_as(:'alicia');
insert into public.accounts (space_id, name, kind, currency) values (:'sp', 'Cuenta', 'current', 'EUR') returning id as acc \gset

-- Nivel archivo
insert into public.import_batches (space_id, account_id, file_sha256, storage_path)
  values (:'sp', :'acc', decode(repeat('aa', 32), 'hex'), :'sp' || '/extracto.csv') returning id as batch \gset
select throws_ok(
  format($$insert into public.import_batches (space_id, account_id, file_sha256, storage_path) values (%L, %L, decode(repeat('aa', 32), 'hex'), %L)$$, :'sp', :'acc', :'sp' || '/otro.csv'),
  '23505', null, 'el mismo archivo no se importa dos veces en la misma cuenta');
select throws_ok(
  format($$insert into public.import_batches (space_id, account_id, file_sha256, storage_path) values (%L, %L, decode(repeat('bb', 32), 'hex'), %L)$$, :'sp', :'acc', :'sp_b' || '/robado.csv'),
  '23514', null, 'la ruta del archivo debe colgar de la carpeta de su espacio');
select throws_ok(
  format($$insert into public.import_batches (space_id, account_id, file_sha256, storage_path) values (%L, %L, decode('abcd', 'hex'), %L)$$, :'sp', :'acc', :'sp' || '/x.csv'),
  '23514', null, 'el hash de archivo debe ser SHA-256 (32 bytes)');

-- Nivel fila
insert into public.import_rows (batch_id, space_id, account_id, row_index, fingerprint, status)
  values (:'batch', :'sp', :'acc', 0, decode(repeat('f1', 32), 'hex'), 'imported');
select throws_ok(
  format($$insert into public.import_rows (batch_id, space_id, account_id, row_index, fingerprint, status) values (%L, %L, %L, 1, decode(repeat('f1', 32), 'hex'), 'imported')$$, :'batch', :'sp', :'acc'),
  '23505', null, 'una fila ya importada no se importa dos veces (misma huella)');
select lives_ok(
  format($$insert into public.import_rows (batch_id, space_id, account_id, row_index, fingerprint, status) values (%L, %L, %L, 2, decode(repeat('f1', 32), 'hex'), 'duplicate')$$, :'batch', :'sp', :'acc'),
  'la misma huella se registra como duplicada sin chocar');
select throws_ok(
  format($$insert into public.import_rows (batch_id, space_id, account_id, row_index, fingerprint, status) values (%L, %L, %L, 0, decode(repeat('f2', 32), 'hex'), 'new')$$, :'batch', :'sp', :'acc'),
  '23505', null, 'cada posición de fila es única dentro del archivo');

-- Permisos de las tablas de importación
select tests.authenticate_as(:'vic');
select is((select count(*)::int from public.import_batches), 1, 'solo lectura ve las importaciones');
select throws_ok(format($$insert into public.import_mappings (space_id, name, mapping) values (%L, 'x', '{}')$$, :'sp'), '42501', null, 'pero no crea mapeos');
select tests.authenticate_as(:'aser');
select is((select count(*)::int from public.import_batches), 0, 'el asesor no ve las importaciones');

-- Storage
select tests.authenticate_as(:'alicia');
select lives_ok(format($$insert into storage.objects (bucket_id, name, owner) values ('imports', %L, %L)$$, :'sp' || '/extracto.csv', :'alicia'), 'un editor sube un archivo a la carpeta de su espacio');
select throws_ok(format($$insert into storage.objects (bucket_id, name, owner) values ('imports', %L, %L)$$, :'sp_b' || '/intruso.csv', :'alicia'), '42501', null, 'no puede subir a la carpeta de otro espacio');
select throws_ok(format($$insert into storage.objects (bucket_id, name, owner) values ('imports', 'suelto.csv', %L)$$, :'alicia'), '42501', null, 'ni a la raíz del bucket');
select tests.authenticate_as(:'vic');
select is((select count(*)::int from storage.objects where bucket_id = 'imports'), 1, 'solo lectura puede descargar archivos de su espacio');
select tests.authenticate_as(:'aser');
select is((select count(*)::int from storage.objects where bucket_id = 'imports'), 0, 'el asesor no ve los archivos importados');
select tests.authenticate_as(:'beto');
select is((select count(*)::int from storage.objects where bucket_id = 'imports'), 0, 'otro espacio tampoco');

select * from finish();
rollback;
