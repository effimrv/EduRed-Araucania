// Control de acceso por rol (RBAC).
// Cuatro roles del caso: estudiante, apoderado, docente y directivo.

export const PERMISOS = Object.freeze({
  BIBLIOTECA_VER: 'biblioteca:ver',
  BIBLIOTECA_PROPONER: 'biblioteca:proponer',
  BIBLIOTECA_APROBAR: 'biblioteca:aprobar',
  TUTORIAS_VER: 'tutorias:ver',
  TUTORIAS_GESTIONAR: 'tutorias:gestionar',
  TUTORIAS_INSCRIBIRSE: 'tutorias:inscribirse',
  ASISTENCIA_REGISTRAR: 'asistencia:registrar',
  SEGUIMIENTO_PROPIO: 'seguimiento:propio',
  SEGUIMIENTO_CURSO: 'seguimiento:curso',
  SEGUIMIENTO_ESTABLECIMIENTO: 'seguimiento:establecimiento',
  REGLAS_GESTIONAR: 'reglas:gestionar',
  RECOMENDACIONES_VER: 'recomendaciones:ver',
  INFORMES_GENERAR: 'informes:generar',
});

const P = PERMISOS;

export const MATRIZ_ROLES = Object.freeze({
  estudiante: [P.BIBLIOTECA_VER, P.TUTORIAS_VER, P.TUTORIAS_INSCRIBIRSE, P.SEGUIMIENTO_PROPIO, P.RECOMENDACIONES_VER, P.INFORMES_GENERAR],
  apoderado: [P.BIBLIOTECA_VER, P.SEGUIMIENTO_PROPIO, P.INFORMES_GENERAR],
  docente: [
    P.BIBLIOTECA_VER, P.BIBLIOTECA_PROPONER, P.BIBLIOTECA_APROBAR,
    P.TUTORIAS_VER, P.TUTORIAS_GESTIONAR, P.ASISTENCIA_REGISTRAR,
    P.SEGUIMIENTO_CURSO, P.REGLAS_GESTIONAR, P.RECOMENDACIONES_VER, P.INFORMES_GENERAR,
  ],
  directivo: [
    P.BIBLIOTECA_VER, P.TUTORIAS_VER, P.SEGUIMIENTO_ESTABLECIMIENTO, P.INFORMES_GENERAR,
  ],
});

export function puede(usuario, permiso) {
  if (!usuario || !usuario.activo) return false;
  return (MATRIZ_ROLES[usuario.rol] ?? []).includes(permiso);
}

export function exigir(usuario, permiso) {
  if (!puede(usuario, permiso)) {
    throw new PermisoDenegadoError(`El rol ${usuario?.rol ?? 'sin sesión'} no tiene el permiso ${permiso}.`);
  }
}

export class PermisoDenegadoError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PermisoDenegadoError';
  }
}

// Alcance de datos: qué estudiantes puede ver cada rol.
export function estudiantesVisibles(usuario, repo) {
  const estudiantes = repo.todos('usuarios').filter((u) => u.rol === 'estudiante' && u.activo);
  switch (usuario.rol) {
    case 'estudiante':
      return estudiantes.filter((e) => e.id === usuario.id);
    case 'apoderado':
      return estudiantes.filter((e) => usuario.estudianteIds.includes(e.id));
    case 'docente':
      return estudiantes.filter((e) => e.cursoIds.some((c) => usuario.cursoIds.includes(c)));
    case 'directivo':
      return estudiantes.filter((e) => e.establecimientoId === usuario.establecimientoId);
    default:
      return [];
  }
}
