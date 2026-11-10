// Datos de demostración. Todas las cuentas usan la contraseña "demo1234".
// Son ficticias: los nombres de establecimientos y personas no corresponden a colegios reales.

import { derivarHash, generarSalt } from '../core/auth.js';

export const PASSWORD_DEMO = 'demo1234';

const ahora = new Date();
const enDias = (dias, hora = '15:00') => {
  const f = new Date(ahora);
  f.setDate(f.getDate() + dias);
  const [h, m] = hora.split(':');
  f.setHours(Number(h), Number(m), 0, 0);
  return f.toISOString();
};

async function usuario(id, datos) {
  const salt = await generarSalt();
  const passwordHash = await derivarHash(PASSWORD_DEMO, salt);
  return { id, activo: true, salt, passwordHash, ...datos };
}

const NOMBRES = ['Sofía', 'Matías', 'Isidora', 'Vicente', 'Florencia', 'Joaquín', 'Antonella', 'Benjamín', 'Catalina', 'Martín', 'Javiera', 'Tomás', 'Trinidad', 'Agustín', 'Renata', 'Lucas', 'Emilia', 'Felipe', 'Constanza', 'Gabriel', 'Francisca', 'Ignacio', 'Amanda', 'Maximiliano'];
const APELLIDOS = ['Muñoz', 'Rojas', 'Díaz', 'Pérez', 'Soto', 'Contreras', 'Silva', 'Martínez', 'Sepúlveda', 'Morales', 'Vergara', 'Fuentes', 'Hernández', 'Torres', 'Araya', 'Flores', 'Espinoza', 'Valenzuela', 'Castillo', 'Reyes', 'Millaleo', 'Painemal', 'Huenchul', 'Caniupán'];
const SIN_TILDES = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// Notas deterministas entre 2,5 y 6,5 (sin azar, para que las pruebas sean estables)
function notaDe(i, asignatura) {
  const valor = 4.0 + (((i + 1) * (asignatura + 3) * 7) % 31) / 10 - 1.5;
  return Math.round(Math.min(7, Math.max(1, valor)) * 10) / 10;
}

// Crea un curso completo: estudiantes, notas por asignatura, tutorías, inscripciones y asistencia.
async function generarCursos() {
  const grupos = [
    { curso: 'cur-4a', establecimiento: 'est-urbano', cantidad: 28, prefijo: 'a' },
    { curso: 'cur-4b', establecimiento: 'est-urbano', cantidad: 26, prefijo: 'b' },
    { curso: 'cur-4r', establecimiento: 'est-rural', cantidad: 14, prefijo: 'r' },
  ];
  const asignaturas = ['asg-len', 'asg-mat', 'asg-cie'];
  const out = { usuarios: [], resultados: [], inscripciones: [], asistencias: [], tutorias: [] };
  let n = 0;
  for (const g of grupos) {
    const ids = [];
    for (let k = 0; k < g.cantidad; k++) {
      n += 1;
      const nombre = `${NOMBRES[(n * 5) % NOMBRES.length]} ${APELLIDOS[n % APELLIDOS.length]} ${APELLIDOS[(n * 7 + 3) % APELLIDOS.length]}`;
      const id = `usr-est-${g.prefijo}${String(k + 1).padStart(2, '0')}`;
      ids.push(id);
      out.usuarios.push(await usuario(id, {
        nombre, correo: `${SIN_TILDES(nombre.split(' ')[0])}.${g.prefijo}${k + 1}@edured.cl`,
        rol: 'estudiante', establecimientoId: g.establecimiento, cursoIds: [g.curso],
      }));
      asignaturas.forEach((asg, a) => out.resultados.push({
        id: `res-${id}-${a}`, estudianteId: id, asignaturaId: asg, periodo: '2026-1', nota: notaDe(n, a),
      }));
    }
    // Dos tutorías por curso (una por asignatura de apoyo), con inscripción de la mitad del curso
    const tutorias = [
      { asg: 'asg-len', titulo: 'Refuerzo de comprensión lectora', dias: 4, hora: '15:00' },
      { asg: 'asg-mat', titulo: 'Resolución de problemas', dias: 6, hora: '14:00' },
    ];
    const docente = g.establecimiento === 'est-rural' ? 'usr-docente-rural' : 'usr-docente';
    tutorias.forEach((t, j) => {
      const tid = `tut-${g.prefijo}${j + 1}`;
      out.tutorias.push({
        id: tid, titulo: t.titulo, asignaturaId: t.asg, docenteId: docente, cursoId: g.curso,
        inicio: enDias(t.dias, t.hora), cupos: 30, establecimientoId: g.establecimiento,
      });
      ids.filter((_, k) => (k + j) % 2 === 0).forEach((est, k) => {
        out.inscripciones.push({ id: `ins-${tid}-${k}`, tutoriaId: tid, estudianteId: est });
        out.asistencias.push({
          id: `asi-${tid}-${k}`, tutoriaId: tid, estudianteId: est,
          presente: (k % 5) !== 0, fecha: enDias(-7 + j),
        });
      });
    });
  }
  return out;
}

export async function construirDatosDemo() {
  const establecimientos = [
    { id: 'est-urbano', nombre: 'Escuela Los Aromos', zona: 'urbana', comuna: 'Temuco' },
    { id: 'est-rural', nombre: 'Escuela Rural Cerro Negro', zona: 'rural', comuna: 'Freire' },
  ];

  const cursos = [
    { id: 'cur-4a', nombre: '4° A', nivel: '4° básico', establecimientoId: 'est-urbano' },
    { id: 'cur-4b', nombre: '4° B', nivel: '4° básico', establecimientoId: 'est-urbano' },
    { id: 'cur-4r', nombre: '4° único', nivel: '4° básico', establecimientoId: 'est-rural' },
  ];

  const asignaturas = [
    { id: 'asg-len', nombre: 'Lenguaje y comunicación', nivel: '4° básico' },
    { id: 'asg-mat', nombre: 'Matemática', nivel: '4° básico' },
    { id: 'asg-cie', nombre: 'Ciencias naturales', nivel: '4° básico' },
  ];

  const usuarios = [
    await usuario('usr-directiva', {
      nombre: 'Carolina Soto', correo: 'directiva@edured.cl', rol: 'directivo', establecimientoId: 'est-urbano',
    }),
    await usuario('usr-docente', {
      nombre: 'Marcela Painemal', correo: 'docente@edured.cl', rol: 'docente',
      establecimientoId: 'est-urbano', cursoIds: ['cur-4a', 'cur-4b'],
    }),
    await usuario('usr-docente-rural', {
      nombre: 'Rodrigo Millaleo', correo: 'docente.rural@edured.cl', rol: 'docente',
      establecimientoId: 'est-rural', cursoIds: ['cur-4r'],
    }),
    await usuario('usr-est-ana', {
      nombre: 'Ana Quilodrán', correo: 'ana@edured.cl', rol: 'estudiante',
      establecimientoId: 'est-urbano', cursoIds: ['cur-4a'],
    }),
    await usuario('usr-est-benjamin', {
      nombre: 'Benjamín Caniupán', correo: 'benjamin@edured.cl', rol: 'estudiante',
      establecimientoId: 'est-urbano', cursoIds: ['cur-4a'],
    }),
    await usuario('usr-est-camila', {
      nombre: 'Camila Huenchul', correo: 'camila@edured.cl', rol: 'estudiante',
      establecimientoId: 'est-urbano', cursoIds: ['cur-4b'],
    }),
    await usuario('usr-est-valentina', {
      nombre: 'Valentina Llanquileo', correo: 'valentina@edured.cl', rol: 'estudiante',
      establecimientoId: 'est-rural', cursoIds: ['cur-4r'],
    }),
    await usuario('usr-apoderada-ana', {
      nombre: 'Patricia Quilodrán', correo: 'apoderada@edured.cl', rol: 'apoderado',
      establecimientoId: 'est-urbano', estudianteIds: ['usr-est-ana'],
    }),
    await usuario('usr-apoderado-valentina', {
      nombre: 'Jorge Llanquileo', correo: 'apoderado.rural@edured.cl', rol: 'apoderado',
      establecimientoId: 'est-rural', estudianteIds: ['usr-est-valentina'],
    }),
  ];

  const recursos = [
    { id: 'rec-1', titulo: 'Guía de comprensión lectora: el cuento corto', tipo: 'guia', nivel: '4° básico', asignaturaId: 'asg-len', creadoPor: 'usr-docente', aprobadoPor: 'usr-docente', estado: 'aprobado', tamanoKb: 180 },
    { id: 'rec-2', titulo: 'Video: fracciones con material concreto', tipo: 'video', nivel: '4° básico', asignaturaId: 'asg-mat', creadoPor: 'usr-docente', aprobadoPor: 'usr-docente', estado: 'aprobado', tamanoKb: 2400 },
    { id: 'rec-3', titulo: 'Ejercicios de multiplicación (nivel 1)', tipo: 'ejercicio', nivel: '4° básico', asignaturaId: 'asg-mat', creadoPor: 'usr-docente', aprobadoPor: 'usr-docente', estado: 'aprobado', tamanoKb: 95 },
    { id: 'rec-5', titulo: 'Lectura: el ciclo de vida de la mariposa', tipo: 'guia', nivel: '4° básico', asignaturaId: 'asg-cie', creadoPor: 'usr-docente-rural', aprobadoPor: 'usr-docente', estado: 'aprobado', tamanoKb: 210 },
    { id: 'rec-4', titulo: 'Ciclo del agua: guía ilustrada', tipo: 'guia', nivel: '4° básico', asignaturaId: 'asg-cie', creadoPor: 'usr-docente-rural', aprobadoPor: null, estado: 'pendiente', tamanoKb: 320 },
  ];

  const tutorias = [
    { id: 'tut-1', titulo: 'Refuerzo de lectura', asignaturaId: 'asg-len', docenteId: 'usr-docente', cursoId: 'cur-4a', inicio: enDias(2), cupos: 10, establecimientoId: 'est-urbano' },
    { id: 'tut-3', titulo: 'Ciencias: el agua en la naturaleza', asignaturaId: 'asg-cie', docenteId: 'usr-docente-rural', cursoId: 'cur-4r', inicio: enDias(5, '11:00'), cupos: 12, establecimientoId: 'est-rural' },
    { id: 'tut-2', titulo: 'Multiplicación en grupo', asignaturaId: 'asg-mat', docenteId: 'usr-docente-rural', cursoId: 'cur-4r', inicio: enDias(3, '10:00'), cupos: 8, establecimientoId: 'est-rural' },
  ];

  const inscripciones = [
    { id: 'ins-1', tutoriaId: 'tut-1', estudianteId: 'usr-est-ana' },
    { id: 'ins-2', tutoriaId: 'tut-1', estudianteId: 'usr-est-benjamin' },
    { id: 'ins-3', tutoriaId: 'tut-2', estudianteId: 'usr-est-valentina' },
  ];

  const asistencias = [
    { id: 'asi-1', tutoriaId: 'tut-1', estudianteId: 'usr-est-ana', presente: true, fecha: enDias(-7) },
    { id: 'asi-2', tutoriaId: 'tut-1', estudianteId: 'usr-est-benjamin', presente: false, fecha: enDias(-7) },
    { id: 'asi-3', tutoriaId: 'tut-2', estudianteId: 'usr-est-valentina', presente: true, fecha: enDias(-5) },
  ];

  const resultados = [
    { id: 'res-1', estudianteId: 'usr-est-ana', asignaturaId: 'asg-len', periodo: '2026-1', nota: 3.6 },
    { id: 'res-2', estudianteId: 'usr-est-ana', asignaturaId: 'asg-mat', periodo: '2026-1', nota: 5.2 },
    { id: 'res-3', estudianteId: 'usr-est-benjamin', asignaturaId: 'asg-len', periodo: '2026-1', nota: 4.8 },
    { id: 'res-4', estudianteId: 'usr-est-benjamin', asignaturaId: 'asg-mat', periodo: '2026-1', nota: 3.4 },
    { id: 'res-5', estudianteId: 'usr-est-camila', asignaturaId: 'asg-len', periodo: '2026-1', nota: 6.1 },
    { id: 'res-6', estudianteId: 'usr-est-valentina', asignaturaId: 'asg-mat', periodo: '2026-1', nota: 3.9 },
    { id: 'res-7', estudianteId: 'usr-est-camila', asignaturaId: 'asg-mat', periodo: '2026-1', nota: 5.5 },
    { id: 'res-8', estudianteId: 'usr-est-camila', asignaturaId: 'asg-cie', periodo: '2026-1', nota: 5.0 },
    { id: 'res-9', estudianteId: 'usr-est-valentina', asignaturaId: 'asg-cie', periodo: '2026-1', nota: 3.8 },
  ];

  const reglas = [
    { id: 'reg-1', nombre: 'Comprensión lectora bajo 4,0', asignaturaId: 'asg-len', umbral: 4.0, recursoId: 'rec-1', aprobadaPor: 'usr-docente', activa: true },
    { id: 'reg-2', nombre: 'Matemática bajo 4,0', asignaturaId: 'asg-mat', umbral: 4.0, recursoId: 'rec-3', aprobadaPor: 'usr-docente', activa: true },
    { id: 'reg-3', nombre: 'Ciencias bajo 4,0 (sin aprobar)', asignaturaId: 'asg-cie', umbral: 4.0, recursoId: 'rec-4', aprobadaPor: null, activa: true },
  ];

  const cursoCompleto = await generarCursos();
  usuarios.push(...cursoCompleto.usuarios);
  resultados.push(...cursoCompleto.resultados);
  inscripciones.push(...cursoCompleto.inscripciones);
  asistencias.push(...cursoCompleto.asistencias);
  tutorias.push(...cursoCompleto.tutorias);

  return {
    establecimientos, cursos, asignaturas, usuarios, recursos, tutorias,
    inscripciones, asistencias, resultados, reglas, recomendaciones: [], informes: [],
  };
}

// Carga los datos demo en el servidor y en la caché local.
export async function cargarDemo(almacen) {
  const datos = await construirDatosDemo();
  Object.entries(datos).forEach(([coleccion, filas]) => {
    almacen.cache.reemplazarTodo(coleccion, filas);
    almacen.servidor.reemplazarTodo(coleccion, filas);
  });
  return datos;
}
