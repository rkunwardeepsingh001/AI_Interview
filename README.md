# Interview Studio

A full-stack AI Python Developer interview application. Recruiters schedule 30-minute voice-led interviews and email candidates unique links. Recruiters can review transcripts and evaluation reports.

## Stack

- React + Vite frontend
- FastAPI backend
- SQLite persistence
- Gemini API through LangChain's server-side `ChatGoogleGenerativeAI`
- Browser speech synthesis and Web Speech API speech recognition

## Requirements

- Node.js 20+ and npm
- Python 3.11+
- A Gemini API key for adaptive questions and AI-generated evaluation

## Run locally

1. In the project root, install frontend packages with `npm install`.
2. In `backend/`, create/activate a virtual environment and install backend dependencies:
	- Linux/macOS: `python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt`
	- Windows PowerShell: `py -m venv .venv; .venv\\Scripts\\Activate.ps1; pip install -r requirements.txt`
3. Copy the root `.env.example` to `.env` (the default API URL works locally).
4. Copy `backend/.env.example` to `backend/.env` and set `GOOGLE_API_KEY` to a valid Gemini API key. Since the key pasted into source/chat has been exposed, revoke it and generate a replacement before use. The frontend and browser must never receive this key. For local development, the recruiter token is preconfigured as `dev-recruiter-token-change-me`; the dashboard fills it automatically, so you do not need to create or enter a token.
5. To send candidate invitations, fill in `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, and `SMTP_FROM_EMAIL` in `backend/.env`. Use the SMTP credentials/settings supplied by your email provider. Set `FRONTEND_PUBLIC_URL` to the public frontend URL and, for remote candidates, set `VITE_API_BASE` in the root `.env` to the public backend URL. If SMTP is missing, the interview is still created and the dashboard tells you that the email was not sent, so you can copy the link manually.
6. From `backend/` with its virtual environment active, start the API with `uvicorn main:app --reload --port 8000`.
7. In another terminal at the project root, start the UI with `npm run dev` and open the URL Vite prints (usually `http://localhost:5173`).
8. Open the recruiter dashboard; on local development it authenticates with the preconfigured token. If you change `RECRUITER_TOKEN`, enter that value on the recruiter access page.

The SQLite database is created automatically as `backend/interviews.db` when the API starts. The API health check is at `/api/health` and interactive API docs are at `/docs` on the backend origin.

## Candidate flow

Schedule an invitation in the recruiter dashboard by entering the candidate name/email and a date/time in the recruiter's local timezone. The invitation email is sent immediately and includes a unique link and scheduled time. The link can be opened beforehand, but the backend only allows the candidate to start at or after the scheduled time. Configure `FRONTEND_PUBLIC_URL` to the publicly reachable app address before sending real invitations.

Each question has a two-minute response window. The frontend shows the per-question countdown; the backend enforces the limit and records a no-response marker when time expires. The interviewer pauses for about 2.5 seconds before speaking each next question. The overall interview is still limited to 30 minutes. Candidates hear questions through browser speech synthesis and respond via microphone or typed text. Speech recognition requires a supported browser (Chrome is recommended) and microphone permission. On some browsers, Web Speech recognition may use the browser vendor's recognition service.

## Security and production notes

- Gemini credentials remain on the backend and are loaded from `backend/.env` as `GOOGLE_API_KEY` (legacy `GEMINI_API_KEY` is also accepted).
- Recruiter routes require `X-Recruiter-Token`; candidate links use unguessable UUIDs and act as bearer links. The documented recruiter token is a local-development convenience only. Replace it with a strong private value before exposing the app beyond localhost.
- Configure HTTPS, production-grade recruiter authentication, managed secret storage, database backups, rate limiting, retention/deletion policies, production CORS, and a trusted SMTP/email provider before deployment. SMTP credentials remain backend-only.
- AI reports are decision support, not hiring decisions. Review the transcript and report; do not use them as the sole basis for employment decisions. Reports are grounded only in the interview transcript and request no protected-characteristic inferences.
- Transcript storage contains candidate personal data. Obtain consent, restrict access, and define a retention policy appropriate to your organization and jurisdiction.
- This project does not record or persist raw audio. The browser converts speech to text, and only submitted text answers are sent to the backend.

## Project layout

- `src/` — React recruiter dashboard and candidate interview experience
- `backend/main.py` — FastAPI routes, Gemini interviewer/evaluator, and SQLAlchemy models
- `backend/requirements.txt` — Python dependencies
