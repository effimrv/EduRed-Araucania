// Casos de uso de la plataforma. Cada función verifica el permiso antes de tocar datos.

import { exigir, estudiantesVisibles, PERMISOS, PermisoDenegadoError, puede } from '../core/rbac.js';
import { ValidationError } from './models.js';
import { evaluarReglas } from './rules.js';

// ---------- Biblioteca de recursos ----------

export function proponerRecurso(usuario, almacen, datos) {
  exigir(usuario, PERMISOS.BIBLIOTECA_PROPONER);
  return almacen.insertar('recursos', { ...datos, creadoPor: usuario.id, estado: 'pendiente' });
}

export function aprobarRecurso(usuario, almacen, recursoId) {
  exigir(usuario, PERMISOS.BIBLIOTECA_APROBAR);
  const recurso = almacen.buscar('recursos', recursoId);
  if (!recurso) throw new ValidationError('Recurso no encontrado.');
  if (recurso.estado !== 'pendiente') throw new ValidationError('Solo se aprueban recursos pendientes.');
  if (recurso.creadoPor === usuario.id) {
    throw new PermisoDenegadoError('Nadie aprueba su propio recurso.');
  }
  return almacen.actualizar('recursos', recursoId, { estado: 'aprobado', aprobadoPor: usuario.id });
}

// ---------- Tutorías y asistencia ----------

export function crearTutoria(usuario, almacen, datos) {
  exigir(usuario, PERMISOS.TUTORIAS_GESTIONAR);
  return almacen.insertar('tutorias', {
    ...datos,
    docenteId: usuario.id,
    establecimientoId: usuario.establecimientoId,
  });
}

export function inscribirse(usuario, almacen, tutoriaId) {
  exigir(usuario, PERMISOS.TUTORIAS_INSCRIBIRSE);
  const tutoria = almacen.buscar('tutorias', tutoriaId);
  if (!tutoria) throw new ValidationError('Tutoría no encontrada.');
  if (!usuario.cursoIds.includes(tutoria.cursoId)) {
    throw new PermisoDenegadoError('La tutoría es para otro curso.');
  }
  const inscritos = almacen.filtrar('inscripciones', (i) => i.tutoriaId === tutoriaId);
  if (inscritos.some((i) => i.estudianteId === usuario.id)) throw new ValidationError('Ya estás inscrito.');
  if (inscritos.length >= tutoria.cupos) throw new ValidationError('No quedan cupos.');
  return almacen.insertar('inscripciones', { tutoriaId, estudianteId: usuario.id });
}

export function registrarAsistencia(usuario, almacen, tutoriaId, marcas) {
  exigir(usuario, PERMISOS.ASISTENCIA_REGISTRAR);
  const tutoria = almacen.buscar('tutorias', tutoriaId);
  if (!tutoria) throw new ValidationError('Tutoría no encontrada.');
  if (tutoria.docenteId !== usuario.id) throw new PermisoDenegadoError('Solo el docente de la tutoría registra asistencia.');

  const inscritos = new Set(
    almacen.filtrar('inscripciones', (i) => i.tutoriaId === tutoriaId).map((i) => i.estudianteId),
  );
  marcas.forEach(({ estudianteId, presente }) => {
    if (!inscritos.has(estudianteId)) throw new ValidationError('Hay un estudiante que no está inscrito.');
    const previa = almacen.filtrar(
      'asistencias',
      (a) => a.tutoriaId === tutoriaId && a.estudianteId === estudianteId,
    )[0];
    if (previa) {
      almacen.actualizar('asistencias', previa.id, { presente: Boolean(presente) });
    } else {
      almacen.insertar('asistencias', { tutoriaId, estudianteId, presente: Boolean(presente) });
    }
  });
  return marcas.length;
}

// ---------- Seguimiento académico ----------

export function registrarResultado(usuario, almacen, datos) {
  exigir(usuario, PERMISOS.SEGUIMIENTO_CURSO);
  const visibles = estudiantesVisibles(usuario, almacen).map((e) => e.id);
  if (!visibles.includes(datos.estudianteId)) throw new PermisoDenegadoError('Estudiante fuera de tu alcance.');
  return almacen.insertar('resultados', datos);
}

// ---------- Reglas y recomendaciones ----------

export function guardarRegla(usuario, almacen, datos) {
  exigir(usuario, PERMISOS.REGLAS_GESTIONAR);
  return almacen.insertar('reglas', { ...datos, aprobadaPor: usuario.id, activa: true });
}

export function generarRecomendaciones(usuario, almacen, estudianteId) {
  exigir(usuario, PERMISOS.RECOMENDACIONES_VER);
  const estudiante = almacen.buscar('usuarios', estudianteId);
  if (!estudiante) throw new ValidationError('Estudiante no encontrado.');
  const visibles = estudiantesVisibles(usuario, almacen).map((e) => e.id);
  if (!visibles.includes(estudianteId)) throw new PermisoDenegadoError('Estudiante fuera de tu alcance.');

  const nuevas = evaluarReglas({
    estudiante,
    reglas: almacen.todos('reglas'),
    resultados: almacen.todos('resultados'),
    recomendaciones: almacen.todos('recomendaciones'),
  });
  nuevas.forEach((rec) => almacen.insertar('recomendaciones', rec.toJSON()));
  return nuevas;
}

export function marcarRecomendacion(usuario, almacen, recomendacionId, estado) {
  const rec = almacen.buscar('recomendaciones', recomendacionId);
  if (!rec) throw new ValidationError('Recomendación no encontrada.');
  const esPropia = rec.estudianteId === usuario.id;
  if (!esPropia && !puede(usuario, PERMISOS.SEGUIMIENTO_CURSO)) {
    throw new PermisoDenegadoError('No puedes modificar esta recomendación.');
  }
  if (!['sugerida', 'vista', 'descartada'].includes(estado)) throw new ValidationError('Estado inválido.');
  return almacen.actualizar('recomendaciones', recomendacionId, { estado });
}
