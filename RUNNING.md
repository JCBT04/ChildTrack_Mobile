Overview

This repo contains a React Native (Expo) mobile app and a Django REST backend.

Frontend (Expo/React Native)

- Location: project root (files like `App.js`, `package.json`).
- Node / npm: install Node.js (includes npm). Recommended: Node 18+.
- Expo SDK used: `expo` ~54 (see `package.json`).

Install and run (PowerShell)

```powershell
# from project root
npm install
# start Metro / Expo
npm start
# or run directly for a platform
npm run android
npm run ios
```

Notes
- If you don't have the Expo CLI globally installed you can use `npx expo start`.
- The mobile app reads backend URL from `config.js` (`BACKEND_URL`). Update it if your backend runs on a different host/port.

Backend (Django REST)

- Location: `backend/` (Django project). Uses SQLite by default (`db.sqlite3`).
- Python: use Python 3.10+ (3.11/3.12 should work). Create a virtual environment.

Install and run (PowerShell)

```powershell
# change to backend folder
Set-Location -Path .\backend
# create virtualenv (if you don't have one)
python -m venv .venv
# activate it
.\.venv\Scripts\Activate.ps1
# install dependencies
pip install -r requirements.txt
# apply migrations and start server
python manage.py migrate
python manage.py runserver 0.0.0.0:8000
```

If you prefer one-liners, join with `;` in PowerShell:

```powershell
Set-Location -Path .\backend; python -m venv .venv; .\.venv\Scripts\Activate.ps1; pip install -r requirements.txt; python manage.py migrate; python manage.py runserver 0.0.0.0:8000
```

Notes
- `requirements.txt` contains the minimum packages the project needs: `Django==5.1.6`, `djangorestframework`, `django-cors-headers`.
- If you add image fields later, install `Pillow`.
- `settings.py` currently enables `CORS_ALLOW_ALL_ORIGINS = True` for development. Tighten this in production.
- Media files are served from `MEDIA_ROOT` → `media/`. Ensure that folder exists and is writable.

Useful checks

- Backend listening: open `http://127.0.0.1:8000/api/` after running server (or use the API endpoints defined in `backend/api/urls.py`).
- Frontend connecting: ensure `config.js` `BACKEND_URL` matches the backend host reachable by the device/emulator.

Help / Next steps

- I can create a `docker-compose` dev setup, pin more package versions, or add a `Makefile`/PowerShell script for convenience—tell me which you'd like.
