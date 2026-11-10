import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MemoryStorage, Repositorio } from '../js/core/repository.js';
import { Almacen, ColaSincronizacion } from '../js/core/sync.js';
import { PERMISOS, puede, estudiantesVisibles, PermisoDenegadoError } from '../js/core/rbac.js';
import { iniciarSesion, CredencialesInvalidasError } from '../js/core/auth.js';
import { Resultado, Recurso, ValidationError, Usuario } from '../js/domain/models.js';
import { evaluarReglas, ultimasNotas } from '../js/domain/rules.js';
import { construirInforme, aCSV, promedio, porcentajeAsistencia } from '../js/domain/reports.js';
import * as S from '../js/domain/servicios.js';
import { construirDatosDemo, cargarDemo } from '../js/data/seed.js';

async function crearAlmacen(estaEnLinea = () => true) {
  const almacen = Almacen.crear({
    storage: new MemoryStorage(),
    servidorStorage: new MemoryStorage(),
    cola: new ColaSincronizacion(new MemoryStorage()),
    estaEnLinea,
  });
  await cargarDemo(almacen);
  return almacen;
}

const usuarioDe = (almacen, id) => almacen.buscar('usuarios', id);

test('validaciones de entidades', () => {
  assert.throws(() => new Resultado({ nota: 7.5 }), ValidationError);
  assert.throws(() => new Recurso({ titulo: 'x', tipo: 'pdf' }), ValidationError);
  assert.throws(() => new Usuario({ nombre: 'Ana', correo: 'sin-arroba', rol: 'estudiante' }), ValidationError);
  assert.throws(() => new Usuario({ nombre: 'Ana', correo: 'a@b.cl', rol: 'profesor' }), ValidationError);
});

test('RBAC: matriz por rol', () => {
  const estudiante = { rol: 'estudiante', activo: true };
  const docente = { rol: 'docente', activo: true };
  const apoderado = { rol: 'apoderado', activo: true };
  assert.equal(puede(estudiante, PERMISOS.BIBLIOTECA_APROBAR), false);
  assert.equal(puede(docente, PERMISOS.BIBLIOTECA_APROBAR), true);
  assert.equal(puede(apoderado, PERMISOS.TUTORIAS_INSCRIBIRSE), false);
  assert.equal(puede({ rol: 'docente', activo: false }, PERMISOS.BIBLIOTECA_VER), false);
});

test('alcance de datos: cada rol ve solo lo que le corresponde', async () => {
  const almacen = await crearAlmacen();
  const nombres = (u) => estudiantesVisibles(u, almacen).map((e) => e.id).sort();
  assert.deepEqual(nombres(usuarioDe(almacen, 'usr-est-ana')), ['usr-est-ana']);
  assert.deepEqual(nombres(usuarioDe(almacen, 'usr-apoderada-ana')), ['usr-est-ana']);
  assert.deepEqual(nombres(usuarioDe(almacen, 'usr-docente')), ['usr-est-ana', 'usr-est-benjamin', 'usr-est-camila']);
  assert.deepEqual(nombres(usuarioDe(almacen, 'usr-directiva')), ['usr-est-ana', 'usr-est-benjamin', 'usr-est-camila']);
  assert.deepEqual(nombres(usuarioDe(almacen, 'usr-docente-rural')), ['usr-est-valentina']);
});

test('autenticación: contraseña correcta, incorrecta y correo desconocido', async () => {
  const almacen = await crearAlmacen();
  const u = await iniciarSesion(almacen, 'DOCENTE@edured.cl', 'demo1234');
  assert.equal(u.id, 'usr-docente');
  await assert.rejects(iniciarSesion(almacen, 'docente@edured.cl', 'mala'), CredencialesInvalidasError);
  await assert.rejects(iniciarSesion(almacen, 'nadie@edured.cl', 'demo1234'), CredencialesInvalidasError);
  assert.equal(u.toPublico().passwordHash, undefined);
});

test('biblioteca: el autor no aprueba su propio recurso', async () => {
  const almacen = await crearAlmacen();
  const docente = usuarioDe(almacen, 'usr-docente');
  const propuesto = S.proponerRecurso(docente, almacen, {
    titulo: 'Cuento ilustrado', tipo: 'guia', nivel: '4° básico', asignaturaId: 'asg-len',
  });
  assert.equal(propuesto.estado, 'pendiente');
  assert.throws(() => S.aprobarRecurso(docente, almacen, propuesto.id), PermisoDenegadoError);

  const otro = usuarioDe(almacen, 'usr-docente-rural');
  const aprobado = S.aprobarRecurso(otro, almacen, propuesto.id);
  assert.equal(aprobado.estado, 'aprobado');
  assert.equal(aprobado.aprobadoPor, 'usr-docente-rural');
});

test('tutorías: inscripción con cupos y asistencia solo del docente a cargo', async () => {
  const almacen = await crearAlmacen();
  const camila = usuarioDe(almacen, 'usr-est-camila');
  // Camila es de 4° B; la tutoría tut-1 es de 4° A.
  assert.throws(() => S.inscribirse(camila, almacen, 'tut-1'), PermisoDenegadoError);

  const ana = usuarioDe(almacen, 'usr-est-ana');
  assert.throws(() => S.inscribirse(ana, almacen, 'tut-1'), ValidationError); // ya inscrita

  const docente = usuarioDe(almacen, 'usr-docente');
  assert.equal(S.registrarAsistencia(docente, almacen, 'tut-1', [{ estudianteId: 'usr-est-ana', presente: true }]), 1);
  assert.throws(
    () => S.registrarAsistencia(usuarioDe(almacen, 'usr-docente-rural'), almacen, 'tut-1', []),
    PermisoDenegadoError,
  );
  assert.throws(
    () => S.registrarAsistencia(docente, almacen, 'tut-1', [{ estudianteId: 'usr-est-valentina', presente: true }]),
    ValidationError,
  );
});

test('reglas: solo reglas aprobadas por docente generan recomendaciones', async () => {
  const almacen = await crearAlmacen();
  const docente = usuarioDe(almacen, 'usr-docente');
  const benjamin = usuarioDe(almacen, 'usr-est-benjamin');

  const generadas = S.generarRecomendaciones(docente, almacen, benjamin.id);
  // Benjamín: lenguaje 4,8 (sobre umbral), matemática 3,4 (bajo) → una recomendación.
  assert.equal(generadas.length, 1);
  assert.equal(generadas[0].reglaId, 'reg-2');
  // Segunda evaluación no duplica.
  assert.equal(S.generarRecomendaciones(docente, almacen, benjamin.id).length, 0);
});

test('motor de reglas: usa la última nota por asignatura y omite reglas no vigentes', () => {
  const resultados = [
    { estudianteId: 'e1', asignaturaId: 'a1', periodo: '2026-1', nota: 3.0 },
    { estudianteId: 'e1', asignaturaId: 'a1', periodo: '2026-2', nota: 5.0 },
  ];
  assert.equal(ultimasNotas(resultados, 'e1').get('a1').nota, 5.0);

  const reglas = [
    { id: 'r1', asignaturaId: 'a1', umbral: 4.0, recursoId: 'x', estaVigente: () => true },
    { id: 'r2', asignaturaId: 'a1', umbral: 6.0, recursoId: 'y', estaVigente: () => false },
  ];
  const nuevas = evaluarReglas({ estudiante: { id: 'e1' }, reglas, resultados });
  assert.equal(nuevas.length, 0);
});

test('informes: cada rol recibe solo sus filas y el CSV escapa comas', async () => {
  const almacen = await crearAlmacen();
  const apoderada = usuarioDe(almacen, 'usr-apoderada-ana');
  const filas = construirInforme(apoderada, almacen);
  assert.equal(filas.length, 1);
  assert.equal(filas[0].estudiante, 'Ana Quilodrán');
  assert.equal(filas[0].promedio, 4.4);

  const csv = aCSV([{ estudiante: 'Pérez, Ana', curso: '4° A', promedio: 5, asistencia: 100, recomendacionesSugeridas: 0 }]);
  assert.match(csv, /"Pérez, Ana"/);

  assert.equal(promedio([]), null);
  assert.equal(porcentajeAsistencia([{ presente: true }, { presente: false }]), 50);
});

test('offline: las escrituras se encolan y se sincronizan al volver la red', async () => {
  let conectado = false;
  const almacen = await crearAlmacen(() => conectado);
  const docente = usuarioDe(almacen, 'usr-docente');
  S.proponerRecurso(docente, almacen, { titulo: 'Recurso sin red', tipo: 'guia', nivel: '4° básico', asignaturaId: 'asg-len' });

  assert.equal(almacen.cola.cantidad(), 1);
  assert.equal(almacen.servidor.filtrar('recursos', (r) => r.titulo === 'Recurso sin red').length, 0);

  conectado = true;
  assert.equal(almacen.sincronizar(), 1);
  assert.equal(almacen.servidor.filtrar('recursos', (r) => r.titulo === 'Recurso sin red').length, 1);
  assert.equal(almacen.cola.cantidad(), 0);
  // Sincronizar dos veces no duplica.
  almacen.sincronizar();
  assert.equal(almacen.servidor.filtrar('recursos', (r) => r.titulo === 'Recurso sin red').length, 1);
});

test('datos demo: todas las cuentas son válidas y el repositorio persiste', async () => {
  const datos = await construirDatosDemo();
  assert.equal(datos.usuarios.length, 9);
  const repo = new Repositorio(new MemoryStorage());
  repo.reemplazarTodo('recursos', datos.recursos);
  assert.equal(repo.todos('recursos').length, datos.recursos.length);
});
