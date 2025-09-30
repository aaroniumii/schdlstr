# Nostr Scheduler

Una aplicación web para programar publicaciones en Nostr. El frontend permite firmar localmente los eventos Nostr mediante una extensión compatible con NIP-07 y los envía al backend, que se encarga de publicarlos en el momento indicado, incluso si el navegador está cerrado.

---

## 📦 Requisitos

- Python 3.10+
- Node.js 18+
- SQLite3

---

## 🚀 Instalación y ejecución

### 1. Clonar el repositorio

```bash
git clone https://github.com/tuusuario/nostr-scheduler.git
cd nostr-scheduler
```

### 2. Backend (FastAPI)

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload  # Inicia el servidor
```

El backend utiliza variables de entorno (prefijo `SCHDLSTR_`) para configurar rutas de base de datos, archivo de relays y políticas de reintentos. Puedes copiar el archivo `.env.example` y ajustar los valores necesarios:

```bash
cp .env.example .env
```

Variables disponibles más relevantes:

- `SCHDLSTR_DATABASE_PATH`: ruta al archivo SQLite.
- `SCHDLSTR_RELAYS_PATH`: ruta al archivo `relays.json`.
- `SCHDLSTR_MAX_PUBLISH_ATTEMPTS`: número máximo de reintentos por evento.
- `SCHDLSTR_RETRY_BASE_SECONDS` y `SCHDLSTR_RETRY_MAX_SECONDS`: control del backoff exponencial.
- `SCHDLSTR_LOG_LEVEL`: nivel de logs (`INFO`, `DEBUG`, etc.).

### 3. Frontend (React + Vite)

```bash
cd ../frontend
npm install
npm run dev  # Acceder en http://localhost:5173
```

---

## ⚙️ Cron Job

Para publicar automáticamente eventos programados:

```bash
crontab -e
```

Agregar esta línea (ajustando las rutas):

```bash
* * * * * /ruta/a/venv/bin/python /ruta/a/backend/publisher.py >> /ruta/a/backend/cron.log 2>&1
```

El publicador gestiona reintentos automáticos con backoff exponencial y marca los eventos con estados (`scheduled`, `retrying`, `error`, `sent`). Los eventos en estado `error` pueden reintentarse manualmente desde el frontend.

---

## 🐳 Uso con Docker

El proyecto incluye `Dockerfile` separados para backend y frontend, además de `docker-compose.yml` para orquestar los servicios:

```bash
docker-compose up --build
```

Servicios incluidos:

- **backend**: API FastAPI con Uvicorn.
- **worker**: ejecuta `publisher.py` de forma continua para despachar eventos.
- **frontend**: aplicación React servida mediante Nginx.

Los volúmenes compartidos aseguran que backend y worker usen la misma base de datos y archivo de configuración de relays. Ajusta variables de entorno en `docker-compose.yml` según tu despliegue.

---

## 🧪 Prueba rápida

1. Abrí la app en tu navegador
2. Aceptá conexión desde una extensión NIP-07 como Alby
3. Escribí un mensaje y elegí una hora futura
4. Esperá que el cron lo publique
5. Verificá el evento en herramientas como [iris.to](https://iris.to) o [snort.social](https://snort.social)

---

## 📄 Licencia

MIT

