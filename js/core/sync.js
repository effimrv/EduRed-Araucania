// Operación offline-first.
// Las lecturas y escrituras van primero a la caché local (dispositivo).
// Si no hay red, cada escritura queda en la cola de sincronización y se envía al
// servidor cuando vuelve la conexión. En esta versión el "servidor" es un
// repositorio separado en el navegador; la API real queda como trabajo futuro.

import { Repositorio } from './repository.js';

export class ColaSincronizacion {
  constructor(storage, clave = 'edured:cola') {
    this.storage = storage;
    this.clave = clave;
  }

  _leer() {
    const raw = this.storage.getItem(this.clave);
    return raw ? JSON.parse(raw) : [];
  }

  _escribir(ops) {
    this.storage.setItem(this.clave, JSON.stringify(ops));
  }

  encolar(op) {
    const ops = this._leer();
    ops.push({ ...op, encoladoEn: new Date().toISOString() });
    this._escribir(ops);
  }

  pendientes() {
    return this._leer();
  }

  cantidad() {
    return this._leer().length;
  }

  quitar(cantidad) {
    this._escribir(this._leer().slice(cantidad));
  }
}

export class Almacen {
  constructor({ cache, servidor, cola, estaEnLinea = () => true }) {
    this.cache = cache;
    this.servidor = servidor;
    this.cola = cola;
    this.estaEnLinea = estaEnLinea;
  }

  todos(coleccion) {
    return this.cache.todos(coleccion);
  }

  buscar(coleccion, id) {
    return this.cache.buscar(coleccion, id);
  }

  filtrar(coleccion, predicado) {
    return this.cache.filtrar(coleccion, predicado);
  }

  insertar(coleccion, datos) {
    const instancia = this.cache.insertar(coleccion, datos);
    this._propagar({ op: 'insertar', coleccion, datos: instancia.toJSON() });
    return instancia;
  }

  actualizar(coleccion, id, cambios) {
    const instancia = this.cache.actualizar(coleccion, id, cambios);
    this._propagar({ op: 'actualizar', coleccion, id, cambios });
    return instancia;
  }

  _propagar(op) {
    if (this.estaEnLinea()) {
      this._aplicar(this.servidor, op);
    } else {
      this.cola.encolar(op);
    }
  }

  _aplicar(repo, op) {
    if (op.op === 'insertar') {
      // Idempotente: si el registro ya llegó al servidor, no se duplica.
      if (!repo.buscar(op.coleccion, op.datos.id)) repo.insertar(op.coleccion, op.datos);
    } else if (op.op === 'actualizar') {
      repo.actualizar(op.coleccion, op.id, op.cambios);
    }
  }

  // Envía al servidor las operaciones pendientes. Devuelve cuántas se enviaron.
  sincronizar() {
    const pendientes = this.cola.pendientes();
    pendientes.forEach((op) => this._aplicar(this.servidor, op));
    this.cola.quitar(pendientes.length);
    return pendientes.length;
  }

  static crear({ storage, servidorStorage, cola, estaEnLinea }) {
    return new Almacen({
      cache: new Repositorio(storage, 'edured'),
      servidor: new Repositorio(servidorStorage, 'edured-servidor'),
      cola,
      estaEnLinea,
    });
  }
}
