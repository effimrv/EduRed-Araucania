// Vistas de la plataforma. Cada vista recibe el contexto de sesión y devuelve HTML.
// Las acciones (botones y formularios) se resuelven en app.js con data-action / data-form.

import { PERMISOS, puede, estudiantesVisibles } from '../core/rbac.js';
import { construirInforme, aCSV } from '../domain/reports.js';
import * as S from '../domain/servicios.js';
import { ultimasNotas } from '../domain/rules.js';
import { badge, descargar, encabezado, esc, estadoRecurso, formatearFecha, kpi, tabla, vacio } from './componentes.js';

const LS_OFFLINE = 'edured:offline';

export const NIVELES = ['4° básico'];

// ---------- Utilidades de datos ----------

export function nombreDe(almacen, id) {
  return almacen.buscar('usuarios', id)?.nombre ?? 'Sin nombre';
}

function asignaturaDe(almacen, id) {
  return almacen.buscar('asignaturas', id)?.nombre ?? '—';
}

function opciones(lista, valorActual = '') {
  return lista.map((o) => `<option value="${esc(o.value)}" ${o.value === valorActual ? 'selected' : ''}>${esc(o.label)}</option>`).join('');
}

function cursoDe(almacen, usuario) {
  const cursos = almacen.todos('cursos');
  return usuario.cursoIds.map((id) => cursos.find((c) => c.id === id)?.nombre).filter(Boolean).join(', ') || '—';
}

function estaSinConexion(id) {
  try {
    return JSON.parse(localStorage.getItem(LS_OFFLINE) ?? '[]').includes(id);
  } catch {
    return false;
  }
}

export function alternarOffline(id) {
  const lista = JSON.parse(localStorage.getItem(LS_OFFLINE) ?? '[]');
  const nueva = lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id];
  localStorage.setItem(LS_OFFLINE, JSON.stringify(nueva));
}

// ---------- Inicio ----------

export function vistaInicio(ctx) {
  const { usuario, almacen } = ctx;
  const visibles = estudiantesVisibles(usuario, almacen);
  const recursosAprobados = almacen.filtrar('recursos', (r) => r.estado === 'aprobado').length;
  const pendientes = almacen.filtrar('recursos', (r) => r.estado === 'pendiente').length;
  const sugeridas = almacen.filtrar(
    'recomendaciones',
    (r) => r.estado === 'sugerida' && visibles.some((e) => e.id === r.estudianteId),
  ).length;
  const notas = almacen.todos('resultados').filter((r) => visibles.some((e) => e.id === r.estudianteId));
  const promedio = notas.length ? (notas.reduce((a, r) => a + r.nota, 0) / notas.length).toFixed(1).replace('.', ',') : '—';

  const proximas = almacen
    .todos('tutorias')
    .filter((t) => (usuario.rol === 'estudiante' ? usuario.cursoIds.includes(t.cursoId) : true))
    .sort((a, b) => a.inicio.localeCompare(b.inicio))
    .slice(0, 3);

  const bienvenida = {
    estudiante: 'Revisa tus recursos, tutorías y recomendaciones.',
    apoderado: 'Aquí ves el avance de tu hijo o hija.',
    docente: 'Aprueba recursos, organiza tutorías y registra asistencia.',
    directivo: 'Visión general del establecimiento y de los informes.',
  }[usuario.rol];

  return `
    ${encabezado(`Hola, ${usuario.nombre.split(' ')[0]}`, bienvenida)}
    <section class="grid kpis" aria-label="Indicadores">
      ${kpi('Recursos aprobados', recursosAprobados)}
      ${usuario.rol === 'docente' ? kpi('Pendientes de aprobar', pendientes) : ''}
      ${kpi('Estudiantes a cargo', visibles.length)}
      ${kpi('Promedio general', promedio)}
      ${kpi('Recomendaciones sugeridas', sugeridas)}
    </section>
    <section class="grid dos" style="margin-top:var(--gutter)">
      <div class="tarjeta">
        <h2>Próximas tutorías</h2>
        ${proximas.length
          ? proximas.map((t) => `
              <div style="padding:.6rem 0;border-bottom:1px solid var(--borde)">
                <strong>${esc(t.titulo)}</strong>
                <div class="suave">${esc(asignaturaDe(almacen, t.asignaturaId))} · ${esc(formatearFecha(t.inicio))}</div>
              </div>`).join('')
          : vacio('No hay tutorías programadas.')}
      </div>
      <div class="tarjeta">
        <h2>Tu alcance</h2>
        <p>Tu rol es <strong>${esc(usuario.rol)}</strong>. Solo ves la información que corresponde a tu rol (control de acceso por rol).</p>
        <div class="acciones">${badge(`Establecimiento: ${almacen.buscar('establecimientos', usuario.establecimientoId)?.nombre ?? '—'}`, 'primario')}</div>
      </div>
    </section>`;
}

// ---------- Biblioteca ----------

export function vistaBiblioteca(ctx) {
  const { usuario, almacen, filtros } = ctx;
  const asignaturas = almacen.todos('asignaturas');
  const todos = almacen.todos('recursos').filter((r) => {
    if (filtros.asignaturaId && r.asignaturaId !== filtros.asignaturaId) return false;
    if (usuario.rol === 'estudiante' || usuario.rol === 'apoderado') return r.estado === 'aprobado';
    return true;
  });

  const tarjeta = (r) => {
    const puedeAprobar = puede(usuario, PERMISOS.BIBLIOTECA_APROBAR) && r.estado === 'pendiente' && r.creadoPor !== usuario.id;
    const offline = estaSinConexion(r.id);
    return `
      <article class="tarjeta recurso">
        <div class="meta">${badge(r.tipo)} ${estadoRecurso(r.estado)} ${offline ? badge('Sin conexión', 'ok') : ''}</div>
        <h3>${esc(r.titulo)}</h3>
        <small>${esc(asignaturaDe(almacen, r.asignaturaId))} · ${esc(r.nivel)} · ${r.tamanoKb} KB</small>
        <div class="acciones">
          ${puedeAprobar ? `<button class="primario" data-action="aprobarRecurso" data-id="${esc(r.id)}">Aprobar</button>` : ''}
          <button data-action="alternarOffline" data-id="${esc(r.id)}">${offline ? 'Quitar de sin conexión' : 'Guardar sin conexión'}</button>
        </div>
      </article>`;
  };

  const formularioPropuesta = puede(usuario, PERMISOS.BIBLIOTECA_PROPONER) ? `
    <details class="tarjeta" style="margin-bottom:var(--gutter)">
      <summary><strong>Proponer un recurso</strong> <span class="suave">(queda pendiente hasta que otro docente lo apruebe)</span></summary>
      <form data-form="proponerRecurso" style="margin-top:1rem" class="grid dos">
        <label>Título<input name="titulo" required maxlength="120"></label>
        <label>Tipo
          <select name="tipo">${opciones([{ value: 'guia', label: 'Guía' }, { value: 'video', label: 'Video' }, { value: 'ejercicio', label: 'Ejercicio' }])}</select>
        </label>
        <label>Asignatura
          <select name="asignaturaId">${opciones(asignaturas.map((a) => ({ value: a.id, label: a.nombre })))}</select>
        </label>
        <label>Nivel
          <select name="nivel">${opciones(NIVELES.map((n) => ({ value: n, label: n })))}</select>
        </label>
        <label>Tamaño comprimido (KB)<input name="tamanoKb" type="number" min="1" value="150"></label>
        <div class="acciones" style="align-self:end"><button class="primario" type="submit">Enviar propuesta</button></div>
      </form>
    </details>` : '';

  return `
    ${encabezado('Biblioteca de recursos', 'Guías, videos y ejercicios por nivel y asignatura.')}
    ${formularioPropuesta}
    <div class="barra-busqueda">
      <select data-filtro="asignaturaId" aria-label="Filtrar por asignatura">
        ${opciones([{ value: '', label: 'Todas las asignaturas' }, ...asignaturas.map((a) => ({ value: a.id, label: a.nombre }))], filtros.asignaturaId ?? '')}
      </select>
    </div>
    <section class="grid dos">
      ${todos.length ? todos.map(tarjeta).join('') : vacio('No hay recursos para este filtro.')}
    </section>`;
}

// ---------- Tutorías ----------

export function vistaTutorias(ctx) {
  const { usuario, almacen } = ctx;
  const tutorias = almacen.todos('tutorias').filter((t) => {
    if (usuario.rol === 'estudiante') return usuario.cursoIds.includes(t.cursoId);
    if (usuario.rol === 'docente') return t.docenteId === usuario.id;
    return t.establecimientoId === usuario.establecimientoId;
  });
  const inscripciones = almacen.todos('inscripciones');
  const asistencias = almacen.todos('asistencias');
  const cursos = almacen.todos('cursos');
  const asignaturas = almacen.todos('asignaturas');

  const formCrear = puede(usuario, PERMISOS.TUTORIAS_GESTIONAR) ? `
    <details class="tarjeta" style="margin-bottom:var(--gutter)">
      <summary><strong>Programar una tutoría</strong></summary>
      <form data-form="crearTutoria" class="grid dos" style="margin-top:1rem">
        <label>Título<input name="titulo" required maxlength="120"></label>
        <label>Asignatura<select name="asignaturaId">${opciones(asignaturas.map((a) => ({ value: a.id, label: a.nombre })))}</select></label>
        <label>Curso<select name="cursoId">${opciones(cursos.filter((c) => usuario.cursoIds.includes(c.id)).map((c) => ({ value: c.id, label: c.nombre })))}</select></label>
        <label>Inicio<input name="inicio" type="datetime-local" required></label>
        <label>Cupos<input name="cupos" type="number" min="1" value="10"></label>
        <div class="acciones" style="align-self:end"><button class="primario" type="submit">Crear tutoría</button></div>
      </form>
    </details>` : '';

  const tarjeta = (t) => {
    const inscritos = inscripciones.filter((i) => i.tutoriaId === t.id);
    const yoInscrito = inscritos.some((i) => i.estudianteId === usuario.id);
    const cupoLleno = inscritos.length >= t.cupos;
    const accion = usuario.rol === 'estudiante' && !yoInscrito
      ? `<button class="primario" data-action="inscribirse" data-id="${esc(t.id)}" ${cupoLleno ? 'disabled' : ''}>${cupoLleno ? 'Sin cupos' : 'Inscribirme'}</button>`
      : '';
    const asistenciaDocente = usuario.rol === 'docente' && t.docenteId === usuario.id ? panelAsistencia(t, inscritos, asistencias, almacen) : '';
    return `
      <article class="tarjeta">
        <div class="meta">${badge(asignaturaDe(almacen, t.asignaturaId), 'primario')} ${yoInscrito ? badge('Inscrito', 'ok') : ''}</div>
        <h3 style="margin-top:.5rem">${esc(t.titulo)}</h3>
        <small>${esc(formatearFecha(t.inicio))} · ${inscritos.length}/${t.cupos} cupos · ${esc(nombreDe(almacen, t.docenteId))}</small>
        <div class="acciones" style="margin-top:.6rem">${accion}</div>
        ${asistenciaDocente}
      </article>`;
  };

  return `
    ${encabezado('Tutorías y asistencia', 'Programación, inscripción y registro de asistencia.')}
    ${formCrear}
    <section class="grid dos">${tutorias.length ? tutorias.map(tarjeta).join('') : vacio('No hay tutorías para tu rol todavía.')}</section>`;
}

function panelAsistencia(tutoria, inscritos, asistencias, almacen) {
  if (inscritos.length === 0) return `<p class="suave" style="margin-top:.75rem">Aún no hay estudiantes inscritos.</p>`;
  const filas = inscritos.map((i) => {
    const previa = asistencias.find((a) => a.tutoriaId === tutoria.id && a.estudianteId === i.estudianteId);
    return `
      <label style="display:flex;align-items:center;gap:.5rem;font-weight:400;margin:.35rem 0">
        <input type="checkbox" name="presente" value="${esc(i.estudianteId)}" ${previa?.presente ? 'checked' : ''} style="width:auto">
        ${esc(nombreDe(almacen, i.estudianteId))}
      </label>`;
  }).join('');
  return `
    <details style="margin-top:.75rem">
      <summary><strong>Registrar asistencia</strong></summary>
      <form data-form="guardarAsistencia" data-tutoria="${esc(tutoria.id)}" style="margin-top:.5rem">
        ${filas}
        <button class="primario" type="submit" style="margin-top:.5rem">Guardar asistencia</button>
      </form>
    </details>`;
}

// ---------- Seguimiento ----------

export function vistaSeguimiento(ctx) {
  const { usuario, almacen } = ctx;
  const visibles = estudiantesVisibles(usuario, almacen);
  const resultados = almacen.todos('resultados');
  const asistencias = almacen.todos('asistencias');
  const asignaturas = almacen.todos('asignaturas');
  const cursos = almacen.todos('cursos');

  const filas = visibles.map((e) => {
    const notas = [...ultimasNotas(resultados, e.id).values()];
    const asist = asistencias.filter((a) => a.estudianteId === e.id);
    const pct = asist.length ? Math.round((asist.filter((a) => a.presente).length / asist.length) * 100) : null;
    return { e, notas, pct, curso: cursos.find((c) => e.cursoIds.includes(c.id))?.nombre ?? '—' };
  });

  const formNota = puede(usuario, PERMISOS.SEGUIMIENTO_CURSO) ? `
    <details class="tarjeta" style="margin-bottom:var(--gutter)">
      <summary><strong>Registrar una nota</strong></summary>
      <form data-form="registrarResultado" class="grid dos" style="margin-top:1rem">
        <label>Estudiante<select name="estudianteId">${opciones(visibles.map((e) => ({ value: e.id, label: e.nombre })))}</select></label>
        <label>Asignatura<select name="asignaturaId">${opciones(asignaturas.map((a) => ({ value: a.id, label: a.nombre })))}</select></label>
        <label>Periodo<input name="periodo" value="2026-1" required pattern="\\d{4}-\\d"></label>
        <label>Nota (1,0 a 7,0)<input name="nota" type="number" step="0.1" min="1" max="7" required></label>
        <div class="acciones" style="align-self:end"><button class="primario" type="submit">Guardar nota</button></div>
      </form>
    </details>` : '';

  return `
    ${encabezado('Seguimiento académico', 'Avance, asistencia y últimas notas de cada estudiante.')}
    ${formNota}
    ${tabla([
      { titulo: 'Estudiante', valor: (f) => `<strong>${esc(f.e.nombre)}</strong>` },
      { titulo: 'Curso', valor: (f) => esc(f.curso) },
      { titulo: 'Notas', valor: (f) => f.notas.length ? f.notas.map((n) => `${esc(asignaturaDe(almacen, n.asignaturaId))}: <strong class="${n.nota < 4 ? 'badge peligro' : ''}">${String(n.nota.toFixed(1)).replace('.', ',')}</strong>`).join('<br>') : '<span class="suave">Sin notas</span>' },
      { titulo: 'Asistencia', valor: (f) => f.pct === null ? '—' : `${f.pct}%` },
    ], filas)}`;
}

// ---------- Recomendaciones ----------

export function vistaRecomendaciones(ctx) {
  const { usuario, almacen } = ctx;
  const visibles = estudiantesVisibles(usuario, almacen);
  const recs = almacen.todos('recomendaciones').filter((r) => visibles.some((e) => e.id === r.estudianteId));
  const reglas = almacen.todos('reglas');
  const recursos = almacen.todos('recursos');
  const asignaturas = almacen.todos('asignaturas');

  const recTarjeta = (r) => {
    const recurso = recursos.find((x) => x.id === r.recursoId);
    const acciones = usuario.rol === 'estudiante' ? `
      <div class="acciones">
        <button data-action="marcarRecomendacion" data-id="${esc(r.id)}" data-estado="vista">Marcar como vista</button>
        <button class="fantasma" data-action="marcarRecomendacion" data-id="${esc(r.id)}" data-estado="descartada">Descartar</button>
      </div>` : '';
    return `
      <article class="tarjeta">
        <div class="meta">${badge(r.estado, r.estado === 'sugerida' ? 'alerta' : 'ok')}</div>
        <h3 style="margin-top:.4rem">${esc(recurso?.titulo ?? 'Recurso')}</h3>
        <small>${esc(nombreDe(almacen, r.estudianteId))} · ${esc(r.motivo)}</small>
        ${acciones}
      </article>`;
  };

  const generar = usuario.rol === 'docente' ? `
    <div class="tarjeta" style="margin-bottom:var(--gutter)">
      <h2>Generar recomendaciones</h2>
      <p class="suave">Aplica las reglas aprobadas a las notas de cada estudiante. No es IA: solo compara notas con umbrales.</p>
      <div class="acciones">
        ${visibles.map((e) => `<button data-action="generarRecomendaciones" data-id="${esc(e.id)}">${esc(e.nombre)}</button>`).join('')}
      </div>
    </div>
    <details class="tarjeta" style="margin-bottom:var(--gutter)">
      <summary><strong>Nueva regla</strong> <span class="suave">(queda aprobada por ti al crearla)</span></summary>
      <form data-form="guardarRegla" class="grid dos" style="margin-top:1rem">
        <label>Nombre<input name="nombre" required maxlength="120"></label>
        <label>Asignatura<select name="asignaturaId">${opciones(asignaturas.map((a) => ({ value: a.id, label: a.nombre })))}</select></label>
        <label>Umbral (recomendar si la nota es menor)<input name="umbral" type="number" step="0.1" min="1" max="7" value="4.0"></label>
        <label>Recurso sugerido<select name="recursoId">${opciones(recursos.filter((r) => r.estado === 'aprobado').map((r) => ({ value: r.id, label: r.titulo })))}</select></label>
        <div class="acciones" style="align-self:end"><button class="primario" type="submit">Guardar regla</button></div>
      </form>
    </details>
    <section class="tarjeta" style="margin-bottom:var(--gutter)">
      <h2>Reglas</h2>
      ${tabla([
        { titulo: 'Regla', valor: (r) => esc(r.nombre) },
        { titulo: 'Umbral', valor: (r) => String(r.umbral.toFixed(1)).replace('.', ',') },
        { titulo: 'Estado', valor: (r) => r.estaVigente() ? badge('Vigente', 'ok') : badge('Sin aprobar', 'alerta') },
      ], reglas)}
    </section>` : '';

  return `
    ${encabezado('Recomendaciones por reglas', 'Sugerencias de recursos según el desempeño, con reglas aprobadas por docentes.')}
    ${generar}
    <section class="grid dos">${recs.length ? recs.map(recTarjeta).join('') : vacio('Todavía no hay recomendaciones.')}</section>`;
}

// ---------- Informes ----------

export function vistaInformes(ctx) {
  const { usuario, almacen } = ctx;
  const filas = construirInforme(usuario, almacen);
  return `
    ${encabezado('Informes por rol', 'Solo incluyen a los estudiantes que tu rol puede ver.',
      `<button class="primario" data-action="descargarInforme">Descargar CSV</button>`)}
    <section class="tarjeta">
      ${tabla([
        { titulo: 'Estudiante', valor: (f) => `<strong>${esc(f.estudiante)}</strong>` },
        { titulo: 'Curso', valor: (f) => esc(f.curso) },
        { titulo: 'Promedio', valor: (f) => f.promedio === null ? '—' : String(f.promedio.toFixed(1)).replace('.', ',') },
        { titulo: 'Asistencia', valor: (f) => f.asistencia === null ? '—' : `${f.asistencia}%` },
        { titulo: 'Recomendaciones', valor: (f) => String(f.recomendacionesSugeridas) },
      ], filas)}
    </section>`;
}

export function exportarInforme(ctx) {
  const filas = construirInforme(ctx.usuario, ctx.almacen);
  descargar(`informe-${ctx.usuario.rol}-${new Date().toISOString().slice(0, 10)}.csv`, aCSV(filas));
}

export const VISTAS = {
  inicio: { titulo: 'Inicio', icono: '⌂', render: vistaInicio, permisos: [] },
  biblioteca: { titulo: 'Biblioteca', icono: '▤', render: vistaBiblioteca, permisos: [PERMISOS.BIBLIOTECA_VER] },
  tutorias: { titulo: 'Tutorías', icono: '✎', render: vistaTutorias, permisos: [PERMISOS.TUTORIAS_VER] },
  seguimiento: {
    titulo: 'Seguimiento', icono: '◔', render: vistaSeguimiento,
    permisos: [PERMISOS.SEGUIMIENTO_PROPIO, PERMISOS.SEGUIMIENTO_CURSO, PERMISOS.SEGUIMIENTO_ESTABLECIMIENTO],
  },
  recomendaciones: { titulo: 'Recomendaciones', icono: '★', render: vistaRecomendaciones, permisos: [PERMISOS.RECOMENDACIONES_VER] },
  informes: { titulo: 'Informes', icono: '▦', render: vistaInformes, permisos: [PERMISOS.INFORMES_GENERAR] },
};

export function vistaPermitida(usuario, clave) {
  const vista = VISTAS[clave];
  if (!vista) return false;
  return vista.permisos.length === 0 || vista.permisos.some((p) => puede(usuario, p));
}

export { estudiantesVisibles };
