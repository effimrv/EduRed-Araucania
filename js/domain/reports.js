// Informes por rol. Cada rol recibe solo las filas que su alcance le permite ver.

import { estudiantesVisibles, exigir, PERMISOS } from '../core/rbac.js';

export function porcentajeAsistencia(asistencias) {
  if (asistencias.length === 0) return null;
  const presentes = asistencias.filter((a) => a.presente).length;
  return Math.round((presentes / asistencias.length) * 100);
}

export function promedio(resultados) {
  if (resultados.length === 0) return null;
  const suma = resultados.reduce((acc, r) => acc + r.nota, 0);
  return Math.round((suma / resultados.length) * 10) / 10;
}

export function construirInforme(usuario, almacen) {
  exigir(usuario, PERMISOS.INFORMES_GENERAR);

  const cursos = new Map(almacen.todos('cursos').map((c) => [c.id, c]));
  const asistencias = almacen.todos('asistencias');
  const resultados = almacen.todos('resultados');
  const recomendaciones = almacen.todos('recomendaciones');

  return estudiantesVisibles(usuario, almacen).map((estudiante) => {
    const mias = (lista) => lista.filter((x) => x.estudianteId === estudiante.id);
    const curso = estudiante.cursoIds.map((id) => cursos.get(id)?.nombre).filter(Boolean)[0] ?? '—';
    return {
      estudiante: estudiante.nombre,
      curso,
      promedio: promedio(mias(resultados)),
      asistencia: porcentajeAsistencia(mias(asistencias)),
      recomendacionesSugeridas: mias(recomendaciones).filter((r) => r.estado === 'sugerida').length,
    };
  });
}

export function aCSV(filas) {
  if (filas.length === 0) return 'estudiante,curso,promedio,asistencia,recomendaciones\n';
  const columnas = ['estudiante', 'curso', 'promedio', 'asistencia', 'recomendacionesSugeridas'];
  const celda = (valor) => {
    const texto = valor === null || valor === undefined ? '' : String(valor);
    return /[",\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
  };
  const cabecera = 'estudiante,curso,promedio,asistencia_pct,recomendaciones_sugeridas';
  const cuerpo = filas.map((f) => columnas.map((c) => celda(f[c])).join(','));
  return [cabecera, ...cuerpo].join('\n') + '\n';
}
