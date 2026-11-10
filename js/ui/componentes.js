// Piezas reutilizables de interfaz. Todo texto de usuario pasa por esc() antes de mostrarse.

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

export function badge(texto, variante = '') {
  return `<span class="badge ${variante}">${esc(texto)}</span>`;
}

export function estadoRecurso(estado) {
  const mapa = {
    aprobado: ['Aprobado', 'ok'],
    pendiente: ['Pendiente de aprobación', 'alerta'],
    rechazado: ['Rechazado', 'peligro'],
  };
  const [texto, variante] = mapa[estado] ?? [estado, ''];
  return badge(texto, variante);
}

export function kpi(etiqueta, valor) {
  return `<div class="tarjeta kpi"><div class="valor">${esc(valor)}</div><div class="etiqueta">${esc(etiqueta)}</div></div>`;
}

export function vacio(texto) {
  return `<div class="vacio">${esc(texto)}</div>`;
}

export function encabezado(titulo, subtitulo = '', acciones = '') {
  return `
    <header class="encabezado-vista">
      <div>
        <h1>${esc(titulo)}</h1>
        ${subtitulo ? `<p class="suave">${esc(subtitulo)}</p>` : ''}
      </div>
      ${acciones ? `<div class="acciones">${acciones}</div>` : ''}
    </header>`;
}

// columnas: [{ titulo, valor: (fila) => string-html }]
export function tabla(columnas, filas) {
  if (filas.length === 0) return vacio('Todavía no hay registros aquí.');
  const cabecera = columnas.map((c) => `<th>${esc(c.titulo)}</th>`).join('');
  const cuerpo = filas.map((fila) => {
    const celdas = columnas
      .map((c) => `<td data-etiqueta="${esc(c.titulo)}">${c.valor(fila)}</td>`)
      .join('');
    return `<tr>${celdas}</tr>`;
  }).join('');
  return `<div class="tabla-wrap"><table><thead><tr>${cabecera}</tr></thead><tbody>${cuerpo}</tbody></table></div>`;
}

export function toast(mensaje, tipo = '') {
  const zona = document.querySelector('.toast-zona');
  if (!zona) return;
  const el = document.createElement('div');
  el.className = `toast ${tipo}`;
  el.setAttribute('role', 'status');
  el.textContent = mensaje;
  zona.appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

export function formatearFecha(iso) {
  return new Date(iso).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' });
}

export function descargar(nombre, contenido, tipo = 'text/csv;charset=utf-8') {
  const blob = new Blob([contenido], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
