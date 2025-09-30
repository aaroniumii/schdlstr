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
python main.py  # Inicializa base de datos y relays.json
uvicorn main:app --reload  # Inicia el servidor
#uvicorn main:app --host 0.0.0.0 --port 8000 --reload

```

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

