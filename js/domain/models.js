// Modelo de dominio de EduRed Araucanía.
// Cada clase representa una entidad de la BBDD (ver docs/modelo-datos.md).

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

const ROLES = ['estudiante', 'apoderado', 'docente', 'directivo'];

class Entidad {
  constructor(datos = {}) {
    this.id = datos.id ?? crypto.randomUUID();
    this.creadoEn = datos.creadoEn ?? new Date().toISOString();
  }

  toJSON() {
    return { ...this };
  }

  static desdeJSON(datos) {
    return new this(datos);
  }
}

export class Establecimiento extends Entidad {
  constructor(datos = {}) {
    super(datos);
    this.nombre = datos.nombre;
    this.zona = datos.zona; // 'urbana' | 'rural'
    this.comuna = datos.comuna ?? 'Temuco';
    this.validar();
  }

  validar() {
    if (!this.nombre) throw new ValidationError('El establecimiento necesita nombre.');
    if (!['urbana', 'rural'].includes(this.zona)) throw new ValidationError('Zona inválida.');
  }
}

export class Usuario extends Entidad {
  constructor(datos = {}) {
    super(datos);
    this.nombre = datos.nombre;
    this.correo = datos.correo?.toLowerCase();
    this.rol = datos.rol;
    this.establecimientoId = datos.establecimientoId;
    this.cursoIds = datos.cursoIds ?? []; // docentes: cursos que imparten; estudiantes: su curso
    this.estudianteIds = datos.estudianteIds ?? []; // apoderados: estudiantes a cargo
    this.passwordHash = datos.passwordHash;
    this.salt = datos.salt;
    this.activo = datos.activo ?? true;
    this.validar();
  }

  validar() {
    if (!this.nombre) throw new ValidationError('El usuario necesita nombre.');
    if (!this.correo?.includes('@')) throw new ValidationError('Correo inválido.');
    if (!ROLES.includes(this.rol)) throw new ValidationError(`Rol desconocido: ${this.rol}.`);
  }

  toPublico() {
    const { passwordHash, salt, ...publico } = this;
    return publico;
  }
}

export class Curso extends Entidad {
  constructor(datos = {}) {
    super(datos);
    this.nombre = datos.nombre;
    this.nivel = datos.nivel; // p. ej. '4° básico'
    this.establecimientoId = datos.establecimientoId;
  }
}

export class Asignatura extends Entidad {
  constructor(datos = {}) {
    super(datos);
    this.nombre = datos.nombre;
    this.nivel = datos.nivel;
  }
}

export class Recurso extends Entidad {
  static TIPOS = ['guia', 'video', 'ejercicio'];
  static ESTADOS = ['pendiente', 'aprobado', 'rechazado'];

  constructor(datos = {}) {
    super(datos);
    this.titulo = datos.titulo;
    this.tipo = datos.tipo;
    this.nivel = datos.nivel;
    this.asignaturaId = datos.asignaturaId;
    this.creadoPor = datos.creadoPor;
    this.aprobadoPor = datos.aprobadoPor ?? null;
    this.estado = datos.estado ?? 'pendiente';
    this.tamanoKb = datos.tamanoKb ?? 0; // tamaño comprimido para descarga offline
    this.validar();
  }

  validar() {
    if (!this.titulo) throw new ValidationError('El recurso necesita título.');
    if (!Recurso.TIPOS.includes(this.tipo)) throw new ValidationError('Tipo de recurso inválido.');
    if (!Recurso.ESTADOS.includes(this.estado)) throw new ValidationError('Estado inválido.');
  }

  aprobar(aprobadorId) {
    this.estado = 'aprobado';
    this.aprobadoPor = aprobadorId;
  }
}

export class Tutoria extends Entidad {
  constructor(datos = {}) {
    super(datos);
    this.titulo = datos.titulo;
    this.asignaturaId = datos.asignaturaId;
    this.docenteId = datos.docenteId;
    this.cursoId = datos.cursoId;
    this.inicio = datos.inicio; // ISO
    this.cupos = Number(datos.cupos ?? 20);
    this.establecimientoId = datos.establecimientoId;
    this.validar();
  }

  validar() {
    if (!this.titulo) throw new ValidationError('La tutoría necesita título.');
    if (!this.inicio || Number.isNaN(Date.parse(this.inicio))) throw new ValidationError('Fecha de inicio inválida.');
    if (!(this.cupos > 0)) throw new ValidationError('La tutoría necesita al menos un cupo.');
  }
}

export class Inscripcion extends Entidad {
  constructor(datos = {}) {
    super(datos);
    this.tutoriaId = datos.tutoriaId;
    this.estudianteId = datos.estudianteId;
  }
}

export class Asistencia extends Entidad {
  constructor(datos = {}) {
    super(datos);
    this.tutoriaId = datos.tutoriaId;
    this.estudianteId = datos.estudianteId;
    this.presente = Boolean(datos.presente);
    this.fecha = datos.fecha ?? new Date().toISOString();
  }
}

export class Resultado extends Entidad {
  static APROBACION = 4.0; // escala chilena 1,0 a 7,0

  constructor(datos = {}) {
    super(datos);
    this.estudianteId = datos.estudianteId;
    this.asignaturaId = datos.asignaturaId;
    this.periodo = datos.periodo; // p. ej. '2026-1'
    this.nota = Number(datos.nota);
    this.validar();
  }

  validar() {
    if (!(this.nota >= 1 && this.nota <= 7)) throw new ValidationError('La nota debe estar entre 1,0 y 7,0.');
  }
}

export class Regla extends Entidad {
  constructor(datos = {}) {
    super(datos);
    this.nombre = datos.nombre;
    this.asignaturaId = datos.asignaturaId;
    this.umbral = Number(datos.umbral ?? Resultado.APROBACION); // se recomienda si la nota está por debajo
    this.recursoId = datos.recursoId;
    this.aprobadaPor = datos.aprobadaPor ?? null; // las reglas deben estar aprobadas por un docente
    this.activa = datos.activa ?? true;
  }

  estaVigente() {
    return this.activa && Boolean(this.aprobadaPor);
  }
}

export class Recomendacion extends Entidad {
  constructor(datos = {}) {
    super(datos);
    this.estudianteId = datos.estudianteId;
    this.reglaId = datos.reglaId;
    this.recursoId = datos.recursoId;
    this.motivo = datos.motivo ?? '';
    this.estado = datos.estado ?? 'sugerida'; // sugerida | vista | descartada
  }
}

export class Informe extends Entidad {
  constructor(datos = {}) {
    super(datos);
    this.tipo = datos.tipo; // 'estudiante' | 'apoderado' | 'docente' | 'directivo'
    this.generadoPor = datos.generadoPor;
    this.periodo = datos.periodo;
    this.filas = datos.filas ?? [];
  }
}

export const COLECCIONES = {
  establecimientos: Establecimiento,
  usuarios: Usuario,
  cursos: Curso,
  asignaturas: Asignatura,
  recursos: Recurso,
  tutorias: Tutoria,
  inscripciones: Inscripcion,
  asistencias: Asistencia,
  resultados: Resultado,
  reglas: Regla,
  recomendaciones: Recomendacion,
  informes: Informe,
};

export { ROLES };
