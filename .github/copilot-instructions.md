# Interview Studio project guidance

- Keep Gemini credentials exclusively in backend environment variables; never expose keys through Vite variables or browser code.
- Keep recruiter-only routes protected by the recruiter token and do not log secrets or candidate transcripts unnecessarily.
- Treat candidate links as bearer credentials. Preserve privacy, transcript access controls, and retention considerations.
- Keep the 30-minute session limit enforced by the backend, not only the frontend timer.
- AI reports support human review; avoid protected-characteristic inferences or automated hiring decisions.
- For local development, follow the setup and run instructions in README.md.
