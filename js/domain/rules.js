// Motor de recomendaciones por reglas.
// Una regla aprobada por un docente se activa cuando la última nota de un estudiante
// en la asignatura de la regla queda por debajo del umbral.

import { Recomendacion } from './models.js';

// Devuelve la última nota (por periodo) de cada asignatura del estudiante.
export function ultimasNotas(resultados, estudianteId) {
  const mapa = new Map();
  resultados
    .filter((r) => r.estudianteId === estudianteId)
    .forEach((r) => {
      const actual = mapa.get(r.asignaturaId);
      if (!actual || r.periodo > actual.periodo) mapa.set(r.asignaturaId, r);
    });
  return mapa;
}

// Calcula las recomendaciones nuevas para un estudiante. No guarda nada: quien llama decide.
export function evaluarReglas({ estudiante, reglas, resultados, recomendaciones = [] }) {
  const notas = ultimasNotas(resultados, estudiante.id);
  const nuevas = [];

  reglas.filter((regla) => regla.estaVigente()).forEach((regla) => {
    const resultado = notas.get(regla.asignaturaId);
    if (!resultado || resultado.nota >= regla.umbral) return;

    const yaExiste = recomendaciones.some(
      (rec) => rec.estudianteId === estudiante.id && rec.reglaId === regla.id,
    );
    if (yaExiste) return;

    nuevas.push(
      new Recomendacion({
        estudianteId: estudiante.id,
        reglaId: regla.id,
        recursoId: regla.recursoId,
        motivo: `Última nota ${resultado.nota.toFixed(1).replace('.', ',')} (periodo ${resultado.periodo}) bajo el umbral ${regla.umbral.toFixed(1).replace('.', ',')}.`,
      }),
    );
  });

  return nuevas;
}
