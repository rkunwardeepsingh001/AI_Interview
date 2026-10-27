from __future__ import annotations

import json
import os
import secrets
import smtplib
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from typing import Any
from uuid import uuid4
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import DateTime, String, Text, create_engine, inspect, select, text
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    google_api_key: str = ""
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"
    recruiter_token: str = "dev-recruiter-token-change-me"
    # database_url: str = "sqlite:///./interviews.db"
    DATABASE_URL = os.getenv(
    "DATABASE_URL", "sqlite:///./interviews.db"
)

    # Render PostgreSQL URLs can use the default postgres scheme.
    # Use the installed psycopg v3 driver explicitly.
    if DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace(
            "postgres://", "postgresql+psycopg://", 1
        )
    elif DATABASE_URL.startswith("postgresql://"):
        DATABASE_URL = DATABASE_URL.replace(
            "postgresql://", "postgresql+psycopg://", 1
        )
    frontend_origin: str = "http://localhost:5173"
    frontend_public_url: str = "http://localhost:5173"
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from_email: str = ""
    smtp_use_tls: bool = True


settings = Settings()
engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False} if settings.database_url.startswith("sqlite") else {},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class Interview(Base):
    __tablename__ = "interviews"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    candidate_name: Mapped[str] = mapped_column(String(160))
    candidate_email: Mapped[str] = mapped_column(String(254), default="")
    role: Mapped[str] = mapped_column(String(160), default="Python Developer")
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    timezone_name: Mapped[str] = mapped_column(String(80), default="UTC")
    status: Mapped[str] = mapped_column(String(24), default="scheduled")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    transcript: Mapped[str] = mapped_column(Text, default="[]")
    evaluation: Mapped[str | None] = mapped_column(Text, nullable=True)
    current_question: Mapped[str] = mapped_column(Text, default="")
    question_asked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


Base.metadata.create_all(engine)
# Add fields to local SQLite databases created by earlier app versions.
if settings.database_url.startswith("sqlite"):
    with engine.begin() as connection:
        existing_columns = {column["name"] for column in inspect(engine).get_columns("interviews")}
        if "scheduled_at" not in existing_columns:
            connection.execute(text("ALTER TABLE interviews ADD COLUMN scheduled_at DATETIME"))
        if "timezone_name" not in existing_columns:
            connection.execute(text("ALTER TABLE interviews ADD COLUMN timezone_name VARCHAR(80) NOT NULL DEFAULT 'UTC'"))
        if "question_asked_at" not in existing_columns:
            connection.execute(text("ALTER TABLE interviews ADD COLUMN question_asked_at DATETIME"))
app = FastAPI(title="Python Interview API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "X-Recruiter-Token"],
)


class CreateInterview(BaseModel):
    candidate_name: str = Field(min_length=1, max_length=160)
    candidate_email: EmailStr
    role: str = Field(default="Python Developer", max_length=160)
    scheduled_at: datetime
    timezone_name: str = Field(default="UTC", max_length=80)


class AnswerPayload(BaseModel):
    answer: str = Field(default="", max_length=12000)
    timed_out: bool = False


def get_db():
    with SessionLocal() as db:
        yield db


def recruiter_auth(x_recruiter_token: str | None = Header(default=None)) -> None:
    if not x_recruiter_token or not secrets.compare_digest(x_recruiter_token, settings.recruiter_token):
        raise HTTPException(status_code=401, detail="Invalid recruiter token")


def transcript_for(item: Interview) -> list[dict[str, Any]]:
    try:
        return json.loads(item.transcript or "[]")
    except json.JSONDecodeError:
        return []


def interview_dict(item: Interview, include_detail: bool = False) -> dict[str, Any]:
    data: dict[str, Any] = {
        "id": item.id,
        "candidate_name": item.candidate_name,
        "candidate_email": item.candidate_email,
        "role": item.role,
        "scheduled_at": as_utc(item.scheduled_at).isoformat() if item.scheduled_at else None,
        "timezone_name": item.timezone_name,
        "status": item.status,
        "created_at": as_utc(item.created_at).isoformat() if item.created_at else None,
        "started_at": as_utc(item.started_at).isoformat() if item.started_at else None,
        "ended_at": as_utc(item.ended_at).isoformat() if item.ended_at else None,
        "meeting_url": f"/interview/{item.id}",
        "score": None,
    }
    if item.evaluation:
        try:
            data["score"] = json.loads(item.evaluation).get("overall_score")
        except (json.JSONDecodeError, AttributeError):
            pass
    if include_detail:
        data["transcript"] = transcript_for(item)
        data["evaluation"] = json.loads(item.evaluation) if item.evaluation else None
    return data


def ask_gemini(prompt: str) -> str:
    api_key = settings.google_api_key or settings.gemini_api_key
    if not api_key:
        raise RuntimeError("Gemini is not configured. Set GOOGLE_API_KEY in backend/.env.")
    from langchain_google_genai import ChatGoogleGenerativeAI

    llm = ChatGoogleGenerativeAI(model=settings.gemini_model, google_api_key=api_key)
    response = llm.invoke(prompt)
    content = response.content
    if isinstance(content, str):
        return content.strip()
    return " ".join(str(part.get("text", "")) if isinstance(part, dict) else str(part) for part in content).strip()


def as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def send_invitation_email(item: Interview) -> bool:
    if not all((settings.smtp_host, settings.smtp_from_email, item.candidate_email)):
        return False
    scheduled = as_utc(item.scheduled_at) if item.scheduled_at else None
    try:
        scheduled_local = scheduled.astimezone(ZoneInfo(item.timezone_name)) if scheduled else None
    except ZoneInfoNotFoundError:
        scheduled_local = scheduled
    if scheduled_local:
        date_text = scheduled_local.strftime("%A, %B %d, %Y").replace(" 0", " ")
        clock_text = scheduled_local.strftime("%I:%M %p %Z").lstrip("0")
        time_text = f"{date_text} at {clock_text}"
    else:
        time_text = "your scheduled time"
    meeting_url = f"{settings.frontend_public_url.rstrip('/')}/interview/{item.id}"
    message = EmailMessage()
    message["Subject"] = f"Your AI Python Developer interview is scheduled for {time_text}"
    message["From"] = settings.smtp_from_email
    message["To"] = item.candidate_email
    message.set_content(
        f"Hello {item.candidate_name},\n\n"
        f"Your {item.role} AI interview is scheduled for {time_text}.\n\n"
        f"Join your 30-minute interview here: {meeting_url}\n\n"
        "The link will become available at the scheduled time. Please use a supported browser and allow microphone access.\n"
    )
    if settings.smtp_use_tls:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as server:
            server.starttls()
            if settings.smtp_username:
                server.login(settings.smtp_username, settings.smtp_password)
            server.send_message(message)
    else:
        with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=20) as server:
            if settings.smtp_username:
                server.login(settings.smtp_username, settings.smtp_password)
            server.send_message(message)
    return True


def parse_json_response(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[1].rsplit("```", 1)[0].strip()
    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass
    return {}


def finish_interview(item: Interview, db: Session) -> None:
    entries = transcript_for(item)
    transcript_text = "\n".join(f"{row['speaker']}: {row['text']}" for row in entries)
    try:
        evaluation = parse_json_response(ask_gemini(
            "Evaluate this Python Developer interview fairly and concisely. Return only JSON with keys "
            "overall_score (integer 1-5), recommendation (one of Strong yes, Yes, Mixed, No), "
            "summary (string), strengths (array of strings), areas_to_improve (array of strings), "
            "technical_score (integer 1-5), communication_score (integer 1-5). "
            "Score only evidence in the transcript, do not infer protected traits.\n\n" + transcript_text
        ))
        if not evaluation:
            raise ValueError("Gemini returned invalid evaluation JSON")
    except Exception as exc:
        evaluation = {
            "overall_score": 3,
            "recommendation": "Mixed",
            "summary": f"Automatic evaluation was unavailable ({type(exc).__name__}). Review the transcript manually.",
            "strengths": [],
            "areas_to_improve": ["Complete a manual review before making a hiring decision."],
            "technical_score": 3,
            "communication_score": 3,
            "needs_manual_review": True,
        }
    item.status = "completed"
    item.ended_at = datetime.now(timezone.utc)
    item.evaluation = json.dumps(evaluation)
    db.commit()


@app.get("/api/health")
def health():
    return {"status": "ok", "gemini_configured": bool(settings.google_api_key or settings.gemini_api_key)}


@app.post("/api/recruiter/interviews", dependencies=[Depends(recruiter_auth)])
def create_interview(payload: CreateInterview, db: Session = Depends(get_db)):
    try:
        ZoneInfo(payload.timezone_name)
    except ZoneInfoNotFoundError as exc:
        raise HTTPException(status_code=422, detail="Invalid timezone") from exc
    scheduled_at = as_utc(payload.scheduled_at)
    if scheduled_at <= datetime.now(timezone.utc):
        raise HTTPException(status_code=422, detail="Interview time must be in the future")
    item = Interview(
        candidate_name=payload.candidate_name.strip(),
        candidate_email=payload.candidate_email.strip(),
        role=payload.role.strip() or "Python Developer",
        scheduled_at=scheduled_at,
        timezone_name=payload.timezone_name,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    data = interview_dict(item)
    try:
        data["email_sent"] = send_invitation_email(item)
        data["email_status"] = "sent" if data["email_sent"] else "not_configured"
    except Exception:
        # Keep the invitation and link even if the mail provider is unavailable.
        data["email_sent"] = False
        data["email_status"] = "failed"
    return data


@app.get("/api/recruiter/interviews", dependencies=[Depends(recruiter_auth)])
def list_interviews(db: Session = Depends(get_db)):
    items = db.scalars(select(Interview).order_by(Interview.created_at.desc())).all()
    return [interview_dict(item) for item in items]


@app.get("/api/recruiter/interviews/{interview_id}", dependencies=[Depends(recruiter_auth)])
def get_interview(interview_id: str, db: Session = Depends(get_db)):
    item = db.get(Interview, interview_id)
    if not item:
        raise HTTPException(status_code=404, detail="Interview not found")
    return interview_dict(item, include_detail=True)


@app.get("/api/candidate/{token}")
def candidate_interview(token: str, db: Session = Depends(get_db)):
    item = db.get(Interview, token)
    if not item:
        raise HTTPException(status_code=404, detail="Meeting link not found")
    if item.status == "scheduled":
        return {
            "status": item.status,
            "candidate_name": item.candidate_name,
            "role": item.role,
            "duration_minutes": 30,
            "scheduled_at": as_utc(item.scheduled_at).isoformat() if item.scheduled_at else None,
            "timezone_name": item.timezone_name,
        }
    return {
        "status": item.status,
        "candidate_name": item.candidate_name,
        "role": item.role,
        "duration_minutes": 30,
        "started_at": as_utc(item.started_at).isoformat() if item.started_at else None,
        "question_asked_at": as_utc(item.question_asked_at).isoformat() if item.question_asked_at else None,
        "current_question": item.current_question,
        "transcript": transcript_for(item),
    }


@app.post("/api/candidate/{token}/start")
def start_interview(token: str, db: Session = Depends(get_db)):
    item = db.get(Interview, token)
    if not item:
        raise HTTPException(status_code=404, detail="Meeting link not found")
    if item.status == "completed":
        raise HTTPException(status_code=409, detail="This interview has ended")
    if item.status == "scheduled":
        if item.scheduled_at and datetime.now(timezone.utc) < as_utc(item.scheduled_at):
            raise HTTPException(status_code=409, detail="This interview is not available yet")
        item.status = "in_progress"
        item.started_at = datetime.now(timezone.utc)
        item.question_asked_at = item.started_at
        item.current_question = (
            f"Welcome, {item.candidate_name}. We have 30 minutes for your {item.role} interview. "
            "To start, could you introduce yourself and describe a Python project you are proud of?"
        )
        item.transcript = json.dumps([{"speaker": "AI interviewer", "text": item.current_question, "at": datetime.now(timezone.utc).isoformat()}])
        db.commit()
    return {
        "status": item.status,
        "question": item.current_question,
        "started_at": as_utc(item.started_at).isoformat(),
        "question_asked_at": as_utc(item.question_asked_at).isoformat() if item.question_asked_at else None,
    }


@app.post("/api/candidate/{token}/answer")
def submit_answer(token: str, payload: AnswerPayload, db: Session = Depends(get_db)):
    item = db.get(Interview, token)
    if not item:
        raise HTTPException(status_code=404, detail="Meeting link not found")
    if item.status != "in_progress" or not item.started_at:
        raise HTTPException(status_code=409, detail="Interview is not active")
    now = datetime.now(timezone.utc)
    started = item.started_at if item.started_at.tzinfo else item.started_at.replace(tzinfo=timezone.utc)
    question_started = as_utc(item.question_asked_at or item.started_at)
    question_expired = now - question_started >= timedelta(minutes=2)
    if not payload.answer.strip() and not (payload.timed_out and question_expired):
        raise HTTPException(status_code=422, detail="Answer is required unless the two-minute timer has expired")
    if payload.answer.strip() and question_expired:
        raise HTTPException(status_code=409, detail="The two-minute limit for this question has expired")
    entries = transcript_for(item)
    answer_text = payload.answer.strip() or "No response (2-minute question limit reached)."
    entries.append({"speaker": "Candidate", "text": answer_text, "at": now.isoformat()})
    if now - started >= timedelta(minutes=30):
        item.transcript = json.dumps(entries)
        db.commit()
        finish_interview(item, db)
        return {"status": "completed", "message": "Your 30-minute interview is complete."}

    # Persist the candidate turn before requesting the next generated question so
    # transient Gemini failures cannot discard a submitted answer.
    item.transcript = json.dumps(entries)
    db.commit()

    history = "\n".join(f"{row['speaker']}: {row['text']}" for row in entries[-12:])
    prompt = (
        "You are a professional, supportive interviewer assessing a Python Developer candidate. "
        "Ask exactly one concise spoken follow-up or next question, adaptive to the candidate's last answer. "
        "Increase/decrease difficulty based on demonstrated skill. Cover Python fundamentals, data structures, "
        "testing, APIs, debugging, and design over the session. Avoid trick questions and protected-characteristic "
        "inferences. Keep the question natural for speech. Return only JSON: {\"question\": string}.\n\n"
        f"Role: {item.role}\nRecent transcript:\n{history}"
    )
    try:
        result = parse_json_response(ask_gemini(prompt))
        question = str(result.get("question", "")).strip()
        if not question:
            raise ValueError("Gemini returned no question")
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Interviewer could not respond: {type(exc).__name__}. Check Gemini configuration.") from exc
    item.current_question = question
    # Give the candidate a 2.5 second transition before the next question starts.
    item.question_asked_at = datetime.now(timezone.utc) + timedelta(seconds=2.5)
    entries.append({"speaker": "AI interviewer", "text": question, "at": datetime.now(timezone.utc).isoformat()})
    item.transcript = json.dumps(entries)
    db.commit()
    return {
        "status": "in_progress",
        "question": question,
        "question_asked_at": as_utc(item.question_asked_at).isoformat(),
        "transcript": entries,
    }


@app.post("/api/candidate/{token}/finish")
def candidate_finish(token: str, db: Session = Depends(get_db)):
    item = db.get(Interview, token)
    if not item:
        raise HTTPException(status_code=404, detail="Meeting link not found")
    if item.status == "in_progress":
        finish_interview(item, db)
    return {"status": item.status, "message": "Interview complete. Thank you."}
