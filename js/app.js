// Punto de entrada: sesión, enrutado por hash, render de la interfaz y acciones.

import { Almacen, ColaSincronizacion } from './core/sync.js';
import { iniciarSesion } from './core/auth.js';
import * as S from './domain/servicios.js';
import { cargarDemo, PASSWORD_DEMO } from './data/seed.js';
import { esc, toast, encabezado } from './ui/componentes.js';
import {
  VISTAS, vistaPermitida, alternarOffline, exportarInforme,
} from './ui/vistas.js';

const SESION = 'edured:sesion';
const SIMULAR_OFFLINE = 'edured:simularOffline';
const app = document.getElementById('app');

// ---------- Almacenamiento y estado ----------

const storage = window.localStorage;
const almacen = Almacen.crear({
  storage,
  servidorStorage: storage,
  cola: new ColaSincronizacion(storage),
  estaEnLinea: () => navigator.onLine && storage.getItem(SIMULAR_OFFLINE) !== '1',
});

const estado = {
  usuario: null,
  filtros: {},
};

function sesionGuardada() {
  const id = sessionStorage.getItem(SESION);
  return id ? almacen.buscar('usuarios', id) : null;
}

function ctx() {
  return { usuario: estado.usuario, almacen, filtros: estado.filtros };
}

// ---------- Login ----------

function vistaLogin() {
  const cuentas = [
    ['docente@edured.cl', 'Docente', 'Marcela Painemal · aprueba recursos y registra asistencia'],
    ['docente.rural@edured.cl', 'Docente rural', 'Rodrigo Millaleo · escuela rural'],
    ['ana@edured.cl', 'Estudiante', 'Ana Quilodrán · 4° A'],
    ['apoderada@edured.cl', 'Apoderado', 'Patricia Quilodrán · apoderada de Ana'],
    ['directiva@edured.cl', 'Directivo', 'Carolina Soto · establecimiento urbano'],
  ];
  app.innerHTML = `
    <section class="login">
      <div class="login-caja">
        <div class="login-marca">
          <div class="logo"><img src="assets/logo.png" alt="Logo de EduRed"></div>
          <h1>EduRed Araucanía</h1>
          <p class="suave">Plataforma de apoyo educativo para escuelas públicas del SLEP Araucanía. Funciona aunque no haya internet.</p>
          <p class="suave">Cuentas de demostración con la contraseña <code>${esc(PASSWORD_DEMO)}</code>.</p>
        </div>
        <div class="tarjeta">
          <h2>Ingresar</h2>
          <div class="chips"><span class="chip">📱 Funciona sin internet</span><span class="chip">🔐 Acceso por rol</span><span class="chip">📚 5 módulos</span></div>
          <form data-form="login">
            <label>Correo<input name="correo" type="email" autocomplete="username" required></label>
            <label>Contraseña<input name="password" type="password" autocomplete="current-password" required></label>
            <p id="error-login" class="badge peligro" hidden></p>
            <button class="primario" type="submit" style="width:100%">Entrar</button>
          </form>
          <div class="cuentas" aria-label="Cuentas de demostración">
            ${cuentas.map(([correo, rol, detalle]) => `
              <button class="cuenta" data-action="cuentaDemo" data-correo="${esc(correo)}">
                <span><strong>${esc(rol)}</strong><small>${esc(detalle)}</small></span>
                <span class="flecha" aria-hidden="true">→</span>
              </button>`).join('')}
          </div>
        </div>
      </div>
    </section>`;
}

// ---------- Shell ----------

function navegacion() {
  const claves = Object.keys(VISTAS).filter((k) => vistaPermitida(estado.usuario, k));
  const actual = rutaActual();
  return claves.map((k) => `
    <a href="#/${k}" ${k === actual ? 'aria-current="page"' : ''}>
      <span class="icono" aria-hidden="true">${VISTAS[k].icono}</span>
      <span>${esc(VISTAS[k].titulo)}</span>
    </a>`).join('');
}

function rutaActual() {
  return location.hash.replace('#/', '') || 'inicio';
}

function estadoRed() {
  const enLinea = almacen.estaEnLinea();
  const pendientes = almacen.cola.cantidad();
  return `
    <div class="estado-red" role="status">
      <span class="punto ${enLinea ? '' : 'off'}" aria-hidden="true"></span>
      ${enLinea ? 'En línea' : 'Sin conexión: los cambios se guardan en este equipo'}
      ${pendientes ? `· ${pendientes} pendiente${pendientes > 1 ? 's' : ''}` : ''}
    </div>`;
}

function shell(contenidoHtml) {
  const u = estado.usuario;
  const simulando = storage.getItem(SIMULAR_OFFLINE) === '1';
  app.innerHTML = `
    <div class="shell">
      <aside class="barra-lateral" aria-label="Navegación principal">
        <div class="marca"><div class="logo"><img src="assets/logo.png" alt="Logo de EduRed"></div><span>EduRed</span></div>
        <nav class="nav">${navegacion()}</nav>
        <div style="margin-top:auto" class="suave">
          <div><strong>${esc(u.nombre)}</strong></div>
          <div>${esc(u.rol)}</div>
          <button class="fantasma" data-action="cerrarSesion" style="padding:.4rem 0;color:var(--peligro)">Cerrar sesión</button>
        </div>
      </aside>
      <div class="contenido">
        <div class="topbar">
          ${estadoRed()}
          <div class="acciones">
            <button data-action="alternarSimulacion" aria-pressed="${simulando}">${simulando ? 'Volver a en línea' : 'Simular sin conexión'}</button>
            <button data-action="sincronizar">Sincronizar</button>
          </div>
        </div>
        <main id="vista">${contenidoHtml}</main>
      </div>
      <nav class="barra-inferior" aria-label="Navegación móvil">${navegacion()}</nav>
    </div>`;
}

function renderRuta() {
  const u = estado.usuario;
  if (!u) return vistaLogin();
  const clave = rutaActual();
  if (!VISTAS[clave] || !vistaPermitida(u, clave)) {
    location.hash = '#/inicio';
    return;
  }
  try {
    shell(VISTAS[clave].render(ctx()));
  } catch (error) {
    shell(encabezado('No se pudo mostrar esta vista', error.message));
  }
}

// ---------- Acciones ----------

const acciones = {
  cuentaDemo: ({ correo }) => {
    document.querySelector('input[name="correo"]').value = correo;
    document.querySelector('input[name="password"]').value = PASSWORD_DEMO;
    document.querySelector('form[data-form="login"] button[type="submit"]').focus();
  },
  cerrarSesion: () => {
    sessionStorage.removeItem(SESION);
    estado.usuario = null;
    location.hash = '';
    renderRuta();
  },
  alternarSimulacion: () => {
    const simulando = storage.getItem(SIMULAR_OFFLINE) === '1';
    storage.setItem(SIMULAR_OFFLINE, simulando ? '0' : '1');
    toast(simulando ? 'Conexión restablecida.' : 'Modo sin conexión activado: las escrituras se encolan.');
    renderRuta();
  },
  sincronizar: () => {
    const n = almacen.sincronizar();
    toast(n ? `Se sincronizaron ${n} cambios.` : 'No hay cambios pendientes.', '');
    renderRuta();
  },
  aprobarRecurso: ({ id }) => {
    S.aprobarRecurso(estado.usuario, almacen, id);
    toast('Recurso aprobado.');
  },
  alternarOffline: ({ id }) => {
    alternarOffline(id);
    renderRuta();
  },
  inscribirse: ({ id }) => {
    S.inscribirse(estado.usuario, almacen, id);
    toast('Te inscribiste en la tutoría.');
  },
  marcarRecomendacion: ({ id, estado: nuevo }) => {
    S.marcarRecomendacion(estado.usuario, almacen, id, nuevo);
    toast('Recomendación actualizada.');
  },
  generarRecomendaciones: ({ id }) => {
    const nuevas = S.generarRecomendaciones(estado.usuario, almacen, id);
    toast(nuevas.length ? `Se generaron ${nuevas.length} recomendación(es).` : 'No hay recomendaciones nuevas para este estudiante.');
  },
  descargarInforme: () => exportarInforme(ctx()),
};

const formularios = {
  login: async (form) => {
    const datos = new FormData(form);
    try {
      const usuario = await iniciarSesion(almacen, datos.get('correo'), datos.get('password'));
      sessionStorage.setItem(SESION, usuario.id);
      estado.usuario = usuario;
      location.hash = '#/inicio';
      renderRuta();
    } catch (error) {
      const aviso = document.getElementById('error-login');
      aviso.hidden = false;
      aviso.textContent = error.message;
    }
  },
  proponerRecurso: (form) => {
    const d = new FormData(form);
    S.proponerRecurso(estado.usuario, almacen, {
      titulo: d.get('titulo').trim(),
      tipo: d.get('tipo'),
      asignaturaId: d.get('asignaturaId'),
      nivel: d.get('nivel'),
      tamanoKb: Number(d.get('tamanoKb')) || 0,
    });
    toast('Propuesta enviada. Queda pendiente de aprobación.');
    renderRuta();
  },
  crearTutoria: (form) => {
    const d = new FormData(form);
    S.crearTutoria(estado.usuario, almacen, {
      titulo: d.get('titulo').trim(),
      asignaturaId: d.get('asignaturaId'),
      cursoId: d.get('cursoId'),
      inicio: new Date(d.get('inicio')).toISOString(),
      cupos: Number(d.get('cupos')),
    });
    toast('Tutoría creada.');
    renderRuta();
  },
  guardarAsistencia: (form) => {
    const marcados = new Set(new FormData(form).getAll('presente'));
    const inscritos = almacen.filtrar('inscripciones', (i) => i.tutoriaId === form.dataset.tutoria);
    const marcas = inscritos.map((i) => ({ estudianteId: i.estudianteId, presente: marcados.has(i.estudianteId) }));
    S.registrarAsistencia(estado.usuario, almacen, form.dataset.tutoria, marcas);
    toast('Asistencia guardada.');
    renderRuta();
  },
  registrarResultado: (form) => {
    const d = new FormData(form);
    S.registrarResultado(estado.usuario, almacen, {
      estudianteId: d.get('estudianteId'),
      asignaturaId: d.get('asignaturaId'),
      periodo: d.get('periodo'),
      nota: Number(d.get('nota')),
    });
    toast('Nota registrada.');
    renderRuta();
  },
  guardarRegla: (form) => {
    const d = new FormData(form);
    S.guardarRegla(estado.usuario, almacen, {
      nombre: d.get('nombre').trim(),
      asignaturaId: d.get('asignaturaId'),
      umbral: Number(d.get('umbral')),
      recursoId: d.get('recursoId'),
    });
    toast('Regla guardada y aprobada.');
    renderRuta();
  },
};

// Delegación de eventos: un solo listener para toda la aplicación.
document.addEventListener('click', (evento) => {
  const boton = evento.target.closest('[data-action]');
  if (!boton || boton.disabled) return;
  evento.preventDefault();
  ejecutar(() => acciones[boton.dataset.action]?.(boton.dataset));
});

document.addEventListener('submit', (evento) => {
  const form = evento.target.closest('form[data-form]');
  if (!form) return;
  evento.preventDefault();
  ejecutar(() => formularios[form.dataset.form]?.(form));
});

document.addEventListener('change', (evento) => {
  const filtro = evento.target.closest('[data-filtro]');
  if (!filtro) return;
  estado.filtros[filtro.dataset.filtro] = filtro.value;
  renderRuta();
});

function ejecutar(fn) {
  try {
    const resultado = fn();
    if (resultado instanceof Promise) resultado.catch(mostrarError);
  } catch (error) {
    mostrarError(error);
  }
}

function mostrarError(error) {
  toast(error.message || 'Ocurrió un error inesperado.', 'error');
}

// ---------- Arranque ----------

window.addEventListener('hashchange', renderRuta);
window.addEventListener('online', () => {
  const n = almacen.sincronizar();
  if (n) toast(`Conexión recuperada: se enviaron ${n} cambios.`);
  renderRuta();
});
window.addEventListener('offline', renderRuta);

async function arrancar() {
  if (!almacen.todos('usuarios').length) {
    await cargarDemo(almacen);
  }
  estado.usuario = sesionGuardada();
  renderRuta();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

arrancar();
