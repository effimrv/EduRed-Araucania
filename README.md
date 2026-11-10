# EduRed Araucanía

Plataforma de apoyo educativo para escuelas públicas del SLEP Araucanía. Reúne una biblioteca de recursos, tutorías y asistencia, seguimiento académico, recomendaciones por reglas e informes por rol. Está diseñada como **PWA Offline-First** porque algunos colegios rurales tienen conexión intermitente.

Proyecto del ramo Gestión de Proyectos de Software (GPY1102, DuocUC), equipo: Aracely Escobar, Lucas Ferrada y Yannella Castilla.

## Cómo ejecutarla

Requiere Node.js 20 o superior. No hay dependencias que instalar.

```bash
npm start          # sirve la app en http://localhost:8080
npm test           # ejecuta las pruebas de dominio
```

Cuentas de demostración (contraseña `demo1234`):

| Rol | Correo | Qué puede hacer |
|---|---|---|
| Docente | `docente@edured.cl` | Aprobar recursos, crear tutorías, registrar asistencia y notas, crear reglas, generar recomendaciones |
| Docente rural | `docente.rural@edured.cl` | Igual que docente, en el colegio rural |
| Estudiante | `ana@edured.cl` | Ver biblioteca, inscribirse a tutorías, ver su seguimiento y recomendaciones |
| Apoderado | `apoderada@edured.cl` | Ver el seguimiento y el informe de su hija o hijo |
| Directivo | `directiva@edured.cl` | Ver todos los estudiantes del establecimiento e informes |

Para probar el modo sin conexión, usa el botón **Simular sin conexión** en la parte superior: las escrituras quedan en cola y se envían al presionar **Sincronizar** o al volver la conexión.

## Requisitos del caso que cubre

| Requisito | Dónde |
|---|---|
| 5 funcionalidades obligatorias | Biblioteca, Tutorías, Seguimiento, Recomendaciones, Informes |
| 4 roles con permisos (RBAC) | `js/core/rbac.js` |
| Inicio de sesión con diferencia de rol | `js/core/auth.js`, `js/app.js` |
| Recomendaciones basadas en reglas y recursos aprobados por docentes | `js/domain/rules.js` |
| Uso con baja conectividad | `sw.js`, `js/core/sync.js` |
| Datos de menores protegidos | Contraseñas con PBKDF2 y sal; ningún dato sale del navegador en esta versión |

## Estructura

```
index.html · manifest.webmanifest · sw.js   Shell de la PWA
css/styles.css                              Diseño (claro y oscuro)
js/app.js                                   Sesión, rutas y acciones
js/core/        rbac · repository · sync · auth
js/domain/      models · servicios · rules · reports
js/ui/          vistas · componentes
js/data/        seed (datos de demostración)
tests/          dominio.test.js
scripts/        servidor local
```

La documentación de arquitectura (vistas 4+1, diagramas y modelo de datos) y los documentos de gestión se mantienen fuera del repositorio, en la carpeta local del proyecto.

## Alcance y limitaciones

- **Esta versión corre en el navegador.** El "servidor" es un repositorio separado en `localStorage` que simula la API y la BBDD. La API REST con PostgreSQL está diseñada en `docs/` pero no implementada.
- Las contraseñas de demostración son ficticias. Antes de un uso real hay que implementar sesiones con expiración en el servidor y HTTPS.
- Los nombres de escuelas y personas son ficticios.
- El diseño fue probado en escritorio. La vista móvil usa la barra inferior, pero no fue probada en un dispositivo físico.

## Licencia

Uso académico. Sin licencia de distribución.
