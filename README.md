# Nostr Scheduler

Nostr Scheduler is a full-stack web application that lets you draft notes, sign them locally with a NIP-05 browser extension, and queue them for automatic publication on the Nostr network. The React frontend handles note creation and signing, while the FastAPI backend stores pending events in SQLite and a worker process publishes them to your configured relays at the scheduled time—even if your browser is closed.

---

## 📦 Requirements

- Python 3.10+
- Node.js 18+
- SQLite 3

---

## 🚀 Getting started

### 1. Clone the repository

```bash
git clone https://github.com/aaroniumii/schdlstr.git
cd nostr-scheduler
```

### 2. Backend (FastAPI)

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload  # launches the API on http://localhost:8000
```

The backend reads configuration from environment variables with the `SCHDLSTR_` prefix. Create a `.env` file next to the project root or export variables manually. Key settings include:

| Variable | Description | Default |
| --- | --- | --- |
| `SCHDLSTR_DATABASE_PATH` | Path to the SQLite database file. | `backend/scheduler.db` |
| `SCHDLSTR_RELAYS_PATH` | Path to the JSON file with the relay list. | `backend/relays.json` |
| `SCHDLSTR_MAX_PUBLISH_ATTEMPTS` | Maximum retry attempts per event. | `5` |
| `SCHDLSTR_RETRY_BASE_SECONDS` | Initial retry delay (exponential backoff). | `30` |
| `SCHDLSTR_RETRY_MAX_SECONDS` | Maximum retry delay. | `1800` |
| `SCHDLSTR_LOG_LEVEL` | Log verbosity (`INFO`, `DEBUG`, ...). | `INFO` |

When the API boots it ensures the database schema exists and creates a default `relays.json` with a curated relay list if the file is missing.

### 3. Frontend (React + Vite)

```bash
cd ../frontend
npm install
npm run dev  # available at http://localhost:5173
```

Connect a NIP-05 compatible extension (such as Alby) **or** paste an Amber Bunker link when prompted to authorize the frontend. Draft your note, choose a future publication date, and the frontend will sign the event locally (via extension or Bunker remote signer) and send it to the backend.

---

## ⚙️ Background publisher

Publishing is handled by `backend/publisher.py`. It looks for due events, opens relay connections, publishes signed notes, and updates their status (`scheduled`, `retrying`, `error`, `sent`) together with the attempt counters and timestamps.

You can run the worker manually:

```bash
cd backend
python publisher.py
```

To keep it running automatically, add a cron job (adjust paths for your environment):

```bash
* * * * * /path/to/venv/bin/python /path/to/backend/publisher.py >> /path/to/backend/cron.log 2>&1
```

Events that reach the `error` state can be queued for retry from the frontend; the backend exposes an endpoint to reset their status so the worker will attempt publication again.

---

## 🖥️ API overview

The FastAPI backend exposes a minimal JSON API backed by SQLite.

| Method & Path | Description |
| --- | --- |
| `POST /schedule` | Validate and store a signed Nostr event for future publication. Rejects events scheduled in the past or without an `id`. |
| `GET /scheduled?pubkey=<hex>` | Return the scheduled events for the given public key, including status, attempt counters, last error, and retry timing. |
| `POST /scheduled/{event_id}/retry` | Reset an event in `error` state to retry it on the next worker run. |

---

## 🧱 Project structure

```
backend/
  config.py         # Settings and logging helpers
  main.py           # FastAPI application and REST endpoints
  publisher.py      # Worker that publishes scheduled notes
frontend/
  src/              # React components and styles (Vite + React 18)
Dockerfile.*        # Container definitions for backend and frontend
```

---

## 🐳 Docker usage

The repository includes Dockerfiles for both services and a `docker-compose.yml` that brings up the API, the worker, and an Nginx-served build of the frontend.

```bash
docker-compose up --build
```

Shared volumes ensure the backend API and the worker share the same database and relay configuration.

---

## 🧪 Quick manual test

1. Start the backend API and publisher worker.
2. Run `npm run dev` in the frontend and open it in your browser.
3. Connect a NIP-05 extension (or paste a Bunker link and approve it in Amber) to share your public key.
4. Write a note, pick a future datetime, and schedule it.
5. Wait for the worker to publish the event, then confirm it through a Nostr client such as [iris.to](https://iris.to) or [snort.social](https://snort.social).

---

## 📄 License

MIT
