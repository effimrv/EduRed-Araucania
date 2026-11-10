// Autenticación con contraseñas derivadas con PBKDF2 (SHA-256). Nunca se guarda la contraseña.

export const ITERACIONES = 100000;

const encoder = new TextEncoder();

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function generarSalt() {
  return toHex(crypto.getRandomValues(new Uint8Array(16)).buffer);
}

export async function derivarHash(password, salt, iteraciones = ITERACIONES) {
  const base = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations: iteraciones },
    base,
    256,
  );
  return toHex(bits);
}

export class CredencialesInvalidasError extends Error {
  constructor() {
    super('Correo o contraseña incorrectos.');
    this.name = 'CredencialesInvalidasError';
  }
}

export async function iniciarSesion(almacen, correo, password) {
  const usuario = almacen.filtrar('usuarios', (u) => u.correo === correo.trim().toLowerCase())[0];
  if (!usuario || !usuario.activo) throw new CredencialesInvalidasError();
  const hash = await derivarHash(password, usuario.salt);
  if (hash !== usuario.passwordHash) throw new CredencialesInvalidasError();
  return usuario;
}
