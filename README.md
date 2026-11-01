# Bolsillo

App web progresiva (PWA) de finanzas personales: ingresos y de dónde vienen, gastos por categoría y la cartera de inversiones. Se instala en el iPhone desde Safari (Compartir → Agregar a inicio).

- HTML, CSS y JavaScript sin build ni dependencias.
- Datos en Firebase (Firestore + login con email), con caché local para que ande sin señal.
- Sin `config.js` completo funciona en **modo local** (datos solo en el navegador).
- Movimientos en dólares con el cambio real que se cobró (o, si no se carga, el dólar MEP de [dolarapi.com](https://dolarapi.com)).
- `?demo` en la URL abre la app con datos de ejemplo, guardados aparte (`demo.js`).

## Probar en la compu

```bash
python -m http.server 8768
```

y abrir <http://localhost:8768>.

## Conectar Firebase (gratis, plan Spark)

1. En <https://console.firebase.google.com> crear un proyecto (sin Google Analytics).
2. **Authentication → Comenzar → Correo electrónico/contraseña → Habilitar.**
3. **Firestore Database → Crear base de datos** → ubicación `southamerica-east1` → modo producción.
4. En **Firestore → Reglas** pegar el contenido de `firestore.rules` y publicar.
5. **Configuración del proyecto → Tus apps → Web (`</>`)** → registrar la app y copiar el objeto `firebaseConfig` a `config.js`.
6. Abrir la app, crear tu cuenta y después, en las reglas, activar la línea con tu UID (Authentication → Usuarios) para que nadie más pueda usar la base.

## Publicar (GitHub Pages)

El flujo `.github/workflows/publicar.yml` revisa el código (CI) y lo publica en GitHub Pages (CD) en cada push a `main`. En el repo: **Settings → Pages → Source: GitHub Actions**. GitHub Pages gratis requiere repositorio público; el código no tiene datos ni claves secretas (los datos están en Firebase, protegidos por las reglas).

## Traer la cartera de la bóveda

```bash
python herramientas/exportar-cartera.py
```

Genera `cartera.json` (ignorado por git) con las posiciones de `Áreas/Inversiones/Posiciones`. En la app: Ajustes → Importar archivo. Reimportar actualiza por ticker, no duplica.
