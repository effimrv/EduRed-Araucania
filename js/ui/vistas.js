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

const LIMITE_RIESGO = 4.0;

function notasDe(almacen, estudianteId) {
  const asignaturas = new Map(almacen.todos('asignaturas').map((a) => [a.id, a.nombre]));
  return [...ultimasNotas(almacen.todos('resultados'), estudianteId).values()]
    .map((r) => ({ asignatura: asignaturas.get(r.asignaturaId) ?? '—', nota: r.nota, periodo: r.periodo }))
    .sort((a, b) => a.asignatura.localeCompare(b.asignatura));
}

function promedioDe(notas) {
  if (notas.length === 0) return null;
  return notas.reduce((acc, n) => acc + n.nota, 0) / notas.length;
}

function asistenciaDe(almacen, estudianteId) {
  const registros = almacen.filtrar('asistencias', (a) => a.estudianteId === estudianteId);
  if (registros.length === 0) return null;
  return Math.round((registros.filter((a) => a.presente).length / registros.length) * 100);
}

function formatoNota(n) {
  return n === null ? '—' : n.toFixed(1).replace('.', ',');
}

function actividadReciente(almacen, usuario, visibles, limite = 6) {
  const ids = new Set(visibles.map((e) => e.id));
  const items = [];
  almacen.todos('recursos').forEach((r) => {
    if (usuario.rol === 'estudiante' || usuario.rol === 'apoderado') {
      if (r.estado !== 'aprobado') return;
    }
    items.push({ fecha: r.creadoEn, texto: `Recurso "${r.titulo}" · ${r.estado}` });
  });
  almacen.todos('tutorias').forEach((t) => items.push({ fecha: t.creadoEn, texto: `Tutoría "${t.titulo}" programada` }));
  almacen.todos('recomendaciones')
    .filter((r) => ids.has(r.estudianteId))
    .forEach((r) => items.push({ fecha: r.creadoEn, texto: `Recomendación para ${nombreDe(almacen, r.estudianteId)}` }));
  almacen.todos('asistencias')
    .filter((a) => ids.has(a.estudianteId))
    .forEach((a) => items.push({ fecha: a.fecha, texto: `Asistencia de ${nombreDe(almacen, a.estudianteId)}: ${a.presente ? 'presente' : 'ausente'}` }));
  return items.sort((a, b) => (a.fecha < b.fecha ? 1 : -1)).slice(0, limite);
}

function listaActividad(items) {
  if (items.length === 0) return vacio('Todavía no hay actividad para mostrar.');
  return `<ul class="lista-actividad">${items.map((i) => `
    <li><span class="punto-act"></span><div><div>${esc(i.texto)}</div><small class="suave">${esc(formatearFecha(i.fecha))}</small></div></li>`).join('')}</ul>`;
}

function proximasTutorias(almacen, usuario, limite = 3) {
  return almacen.todos('tutorias')
    .filter((t) => (usuario.rol === 'estudiante' ? usuario.cursoIds.includes(t.cursoId) : true))
    .sort((a, b) => a.inicio.localeCompare(b.inicio))
    .slice(0, limite);
}

function bloqueTutorias(almacen, usuario) {
  const lista = proximasTutorias(almacen, usuario);
  return lista.length
    ? lista.map((t) => `
        <div class="fila-simple">
          <div><strong>${esc(t.titulo)}</strong>
          <div class="suave">${esc(asignaturaDe(almacen, t.asignaturaId))} · ${esc(formatearFecha(t.inicio))}</div></div>
        </div>`).join('')
    : vacio('No hay tutorías programadas.');
}

function filasNotas(notas) {
  if (notas.length === 0) return vacio('Todavía no hay notas registradas.');
  return notas.map((n) => `
    <div class="fila-simple">
      <span>${esc(n.asignatura)} <small class="suave">periodo ${esc(n.periodo)}</small></span>
      <span class="badge ${n.nota < LIMITE_RIESGO ? 'peligro' : 'ok'}">${formatoNota(n.nota)}</span>
    </div>`).join('');
}

function encabezadoInicio(usuario, almacen) {
  const saludo = usuario.nombre.split(' ')[0];
  const frase = {
    estudiante: 'Revisa tu avance, tus próximas tutorías y lo que te recomiendan.',
    apoderado: 'Aquí ves el avance de tu hijo o hija, con notas, asistencia y recomendaciones.',
    docente: 'Aprueba recursos, organiza tutorías y revisa qué estudiantes necesitan apoyo.',
    directivo: 'Visión general del establecimiento: rendimiento, asistencia y estudiantes en riesgo.',
  }[usuario.rol];
  const establecimiento = almacen.buscar('establecimientos', usuario.establecimientoId)?.nombre ?? '—';
  return `
    <section class="hero">
      <h1>Hola, ${esc(saludo)}</h1>
      <p>${esc(frase)}</p>
      <div class="chips">
        ${badge(etiquetaRol(usuario.rol), '')}
        ${badge(establecimiento, '')}
      </div>
    </section>`;
}

function etiquetaRol(rol) {
  return { estudiante: 'Estudiante', apoderado: 'Apoderado', docente: 'Docente', directivo: 'Equipo directivo' }[rol] ?? rol;
}

function inicioEstudiante(ctx) {
  const { usuario, almacen } = ctx;
  const notas = notasDe(almacen, usuario.id);
  const prom = promedioDe(notas);
  const asist = asistenciaDe(almacen, usuario.id);
  const recs = almacen.filtrar('recomendaciones', (r) => r.estudianteId === usuario.id && r.estado === 'sugerida');
  const recursos = almacen.todos('recursos');
  return `
    ${encabezadoInicio(usuario, almacen)}
    <section class="grid kpis">
      ${kpi('Promedio', formatoNota(prom))}
      ${kpi('Asistencia', asist === null ? '—' : asist + '%')}
      ${kpi('Recomendaciones', recs.length)}
      ${kpi('Recursos disponibles', recursos.filter((r) => r.estado === 'aprobado').length)}
    </section>
    <section class="grid dos" style="margin-top:var(--gutter)">
      <div class="tarjeta"><h2>Mis notas</h2>${filasNotas(notas)}</div>
      <div class="tarjeta"><h2>Recomendado para ti</h2>${recs.length
        ? recs.map((r) => `<div class="fila-simple"><span>${esc(recursos.find((x) => x.id === r.recursoId)?.titulo ?? 'Recurso')}</span><span class="badge alerta">sugerida</span></div>`).join('')
        : vacio('No tienes recomendaciones por ahora. ¡Buen trabajo!')}</div>
      <div class="tarjeta"><h2>Próximas tutorías</h2>${bloqueTutorias(almacen, usuario)}</div>
      <div class="tarjeta"><h2>Actividad reciente</h2>${listaActividad(actividadReciente(almacen, usuario, [usuario]))}</div>
    </section>`;
}

function inicioApoderado(ctx) {
  const { usuario, almacen } = ctx;
  const hijos = estudiantesVisibles(usuario, almacen);
  const tarjetas = hijos.map((h) => {
    const notas = notasDe(almacen, h.id);
    const prom = promedioDe(notas);
    const asist = asistenciaDe(almacen, h.id);
    return `
      <div class="tarjeta">
        <h2>${esc(h.nombre)}</h2>
        <p class="suave">${esc(cursoDe(almacen, h))}</p>
        <div class="grid kpis" style="margin:.75rem 0">
          ${kpi('Promedio', formatoNota(prom))}
          ${kpi('Asistencia', asist === null ? '—' : asist + '%')}
        </div>
        <h3>Notas</h3>${filasNotas(notas)}
      </div>`;
  }).join('');
  return `
    ${encabezadoInicio(usuario, almacen)}
    <section class="grid dos">${tarjetas || vacio('No hay estudiantes asociados a tu cuenta.')}</section>
    <section class="grid dos" style="margin-top:var(--gutter)">
      <div class="tarjeta"><h2>Próximas tutorías</h2>${bloqueTutorias(almacen, usuario)}</div>
      <div class="tarjeta"><h2>Actividad reciente</h2>${listaActividad(actividadReciente(almacen, usuario, hijos))}</div>
    </section>`;
}

function inicioDocente(ctx) {
  const { usuario, almacen } = ctx;
  const visibles = estudiantesVisibles(usuario, almacen);
  const pendientes = almacen.filtrar('recursos', (r) => r.estado === 'pendiente' && r.creadoPor !== usuario.id);
  const enRiesgo = visibles
    .map((e) => ({ e, prom: promedioDe(notasDe(almacen, e.id)) }))
    .filter((x) => x.prom !== null && x.prom < LIMITE_RIESGO);
  const misTutorias = almacen.todos('tutorias').filter((t) => t.docenteId === usuario.id);
  return `
    ${encabezadoInicio(usuario, almacen)}
    <section class="grid kpis">
      ${kpi('Estudiantes a cargo', visibles.length)}
      ${kpi('Por aprobar', pendientes.length)}
      ${kpi('En riesgo (promedio menor a 4,0)', enRiesgo.length)}
      ${kpi('Mis tutorías', misTutorias.length)}
    </section>
    <section class="grid dos" style="margin-top:var(--gutter)">
      <div class="tarjeta"><h2>Recursos por aprobar</h2>${pendientes.length
        ? pendientes.map((r) => `<div class="fila-simple"><span>${esc(r.titulo)}</span>${badge(r.tipo)}</div>`).join('')
        : vacio('No hay recursos esperando aprobación.')}</div>
      <div class="tarjeta"><h2>Estudiantes que necesitan apoyo</h2>${enRiesgo.length
        ? enRiesgo.map((x) => `<div class="fila-simple"><span>${esc(x.e.nombre)}</span><span class="badge peligro">${formatoNota(x.prom)}</span></div>`).join('')
        : vacio('Ningún estudiante está bajo el umbral.')}</div>
      <div class="tarjeta"><h2>Próximas tutorías</h2>${bloqueTutorias(almacen, usuario)}</div>
      <div class="tarjeta"><h2>Actividad reciente</h2>${listaActividad(actividadReciente(almacen, usuario, visibles))}</div>
    </section>`;
}

function inicioDirectivo(ctx) {
  const { usuario, almacen } = ctx;
  const visibles = estudiantesVisibles(usuario, almacen);
  const notas = almacen.todos('resultados').filter((r) => visibles.some((e) => e.id === r.estudianteId));
  const prom = promedioDe(notas.map((n) => ({ nota: n.nota })));
  const asistencias = almacen.todos('asistencias').filter((a) => visibles.some((e) => e.id === a.estudianteId));
  const pct = asistencias.length ? Math.round((asistencias.filter((a) => a.presente).length / asistencias.length) * 100) : null;
  const asignaturas = almacen.todos('asignaturas');
  const porAsignatura = asignaturas.map((a) => {
    const lista = notas.filter((n) => n.asignaturaId === a.id);
    return { nombre: a.nombre, prom: promedioDe(lista.map((n) => ({ nota: n.nota }))) };
  }).filter((x) => x.prom !== null);
  const enRiesgo = visibles.filter((e) => {
    const p = promedioDe(notasDe(almacen, e.id));
    return p !== null && p < LIMITE_RIESGO;
  });
  return `
    ${encabezadoInicio(usuario, almacen)}
    <section class="grid kpis">
      ${kpi('Estudiantes', visibles.length)}
      ${kpi('Promedio general', formatoNota(prom))}
      ${kpi('Asistencia general', pct === null ? '—' : pct + '%')}
      ${kpi('En riesgo', enRiesgo.length)}
    </section>
    <section class="grid dos" style="margin-top:var(--gutter)">
      <div class="tarjeta"><h2>Rendimiento por asignatura</h2>${porAsignatura.length
        ? porAsignatura.map((x) => `<div class="fila-simple"><span>${esc(x.nombre)}</span><span class="badge ${x.prom < LIMITE_RIESGO ? 'peligro' : 'ok'}">${formatoNota(x.prom)}</span></div>`).join('')
        : vacio('Todavía no hay notas.')}</div>
      <div class="tarjeta"><h2>Próximas tutorías</h2>${bloqueTutorias(almacen, usuario)}</div>
      <div class="tarjeta"><h2>Estudiantes que necesitan apoyo</h2>${enRiesgo.length
        ? enRiesgo.map((e) => `<div class="fila-simple"><span>${esc(e.nombre)}</span><span class="badge peligro">${formatoNota(promedioDe(notasDe(almacen, e.id)))}</span></div>`).join('')
        : vacio('Ningún estudiante está bajo el umbral.')}</div>
      <div class="tarjeta"><h2>Actividad reciente</h2>${listaActividad(actividadReciente(almacen, usuario, visibles))}</div>
    </section>`;
}

export function vistaInicio(ctx) {
  const { usuario } = ctx;
  switch (usuario.rol) {
    case 'estudiante': return inicioEstudiante(ctx);
    case 'apoderado': return inicioApoderado(ctx);
    case 'docente': return inicioDocente(ctx);
    case 'directivo': return inicioDirectivo(ctx);
    default: return vacio('Sin contenido para este rol.');
  }
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
      <p class="suave">Aplica las reglas aprobadas a las notas de cada estudiante. Compara cada nota con su umbral.</p>
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
