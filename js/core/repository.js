// Repositorio genérico sobre un almacenamiento clave-valor (localStorage en el navegador,
// Map en las pruebas). Cada colección se guarda como un arreglo JSON.

import { COLECCIONES, ValidationError } from '../domain/models.js';

export class MemoryStorage {
  constructor() {
    this.datos = new Map();
  }
  getItem(clave) {
    return this.datos.has(clave) ? this.datos.get(clave) : null;
  }
  setItem(clave, valor) {
    this.datos.set(clave, String(valor));
  }
  removeItem(clave) {
    this.datos.delete(clave);
  }
}

export class Repositorio {
  constructor(storage, prefijo = 'edured') {
    this.storage = storage;
    this.prefijo = prefijo;
  }

  _clave(coleccion) {
    return `${this.prefijo}:${coleccion}`;
  }

  _leer(coleccion) {
    const raw = this.storage.getItem(this._clave(coleccion));
    return raw ? JSON.parse(raw) : [];
  }

  _escribir(coleccion, filas) {
    this.storage.setItem(this._clave(coleccion), JSON.stringify(filas));
  }

  _clase(coleccion) {
    const clase = COLECCIONES[coleccion];
    if (!clase) throw new ValidationError(`Colección desconocida: ${coleccion}`);
    return clase;
  }

  todos(coleccion) {
    const clase = this._clase(coleccion);
    return this._leer(coleccion).map((fila) => new clase(fila));
  }

  buscar(coleccion, id) {
    return this.todos(coleccion).find((fila) => fila.id === id) ?? null;
  }

  filtrar(coleccion, predicado) {
    return this.todos(coleccion).filter(predicado);
  }

  insertar(coleccion, datos) {
    const clase = this._clase(coleccion);
    const instancia = new clase(datos); // valida antes de guardar
    const filas = this._leer(coleccion);
    if (filas.some((f) => f.id === instancia.id)) {
      throw new ValidationError(`Ya existe un registro con id ${instancia.id}.`);
    }
    filas.push(instancia.toJSON());
    this._escribir(coleccion, filas);
    return instancia;
  }

  actualizar(coleccion, id, cambios) {
    const clase = this._clase(coleccion);
    const filas = this._leer(coleccion);
    const indice = filas.findIndex((f) => f.id === id);
    if (indice === -1) throw new ValidationError(`No existe ${coleccion}/${id}.`);
    const instancia = new clase({ ...filas[indice], ...cambios, id });
    filas[indice] = instancia.toJSON();
    this._escribir(coleccion, filas);
    return instancia;
  }

  eliminar(coleccion, id) {
    const filas = this._leer(coleccion);
    this._escribir(coleccion, filas.filter((f) => f.id !== id));
  }

  reemplazarTodo(coleccion, filas) {
    this._escribir(coleccion, filas);
  }
}
