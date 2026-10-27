import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Route, Routes, useParams } from 'react-router-dom';
import { Activity, ArrowDown, ArrowLeft, ArrowUpRight, AudioLines, Bell, Check, ChevronDown, CircleHelp, Clock3, Copy, FileText, Headphones, Link2, LoaderCircle, LockKeyhole, Mic, MicOff, MoreHorizontal, Plus, Search, Send, Settings2, ShieldCheck, Sparkles, Users, Volume2, X } from 'lucide-react';
import { api } from './api.js';

const initialCandidates = [];
const DEFAULT_RECRUITER_TOKEN = 'dev-recruiter-token-change-me';
const statusLabel = { scheduled: 'Invited', in_progress: 'In progress', completed: 'Completed' };
const initials = (name = '') => name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase() || 'C';
const localDateTimeValue = (date) => {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};
const newInterviewForm = () => ({
  candidate_name: '',
  candidate_email: '',
  role: 'Python Developer',
  scheduled_at: localDateTimeValue(new Date(Date.now() + 60 * 60 * 1000)),
});

function App() {
  const { token } = useParams();
  return <Routes><Route path="/interview/:token" element={<CandidateInterview />} /><Route path="*" element={<Dashboard />} /></Routes>;
}

function Dashboard() {
  const [token, setToken] = useState(localStorage.getItem('recruiterToken') || DEFAULT_RECRUITER_TOKEN);
  const [authenticated, setAuthenticated] = useState(false);
  const [candidates, setCandidates] = useState(initialCandidates);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState(newInterviewForm);

  const refresh = useCallback(async (key = token) => {
    if (!key) return;
    setLoading(true); setError('');
    try {
      const rows = await api('/api/recruiter/interviews', { token: key });
      setCandidates(rows); setAuthenticated(true); localStorage.setItem('recruiterToken', key);
    } catch (e) { setAuthenticated(false); setError(e.message); }
    finally { setLoading(false); }
  }, [token]);
  useEffect(() => { refresh(token); }, []);

  async function createInterview(event) {
    event.preventDefault(); setError('');
    try {
      const timezone_name = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const scheduled_at = new Date(form.scheduled_at).toISOString();
      const result = await api('/api/recruiter/interviews', { method: 'POST', token, body: JSON.stringify({ ...form, scheduled_at, timezone_name }) });
      setShowCreate(false); setForm(newInterviewForm()); await refresh(token);
      setError(result.email_sent ? 'Interview scheduled and invitation email sent.' : result.email_status === 'failed' ? 'Interview scheduled, but email delivery failed. Check SMTP settings and copy the link manually.' : 'Interview scheduled, but email is not configured. Set SMTP settings and copy the link manually.');
    } catch (e) { setError(e.message); }
  }
  async function openReport(candidate) {
    try { setSelected(await api(`/api/recruiter/interviews/${candidate.id}`, { token })); }
    catch (e) { setError(e.message); }
  }
  async function copyLink(candidate) {
    const link = `${window.location.origin}/interview/${candidate.id}`;
    await navigator.clipboard.writeText(link);
    setError('Meeting link copied to clipboard.');
    setTimeout(() => setError(''), 2400);
  }
  const filtered = candidates.filter((row) => `${row.candidate_name} ${row.candidate_email} ${row.role}`.toLowerCase().includes(query.toLowerCase()));
  const active = candidates.filter((c) => c.status === 'in_progress').length;
  const completed = candidates.filter((c) => c.status === 'completed').length;
  const scored = candidates.filter((c) => c.status === 'completed' && typeof c.score === 'number');
  const average = scored.length ? (scored.reduce((sum, c) => sum + c.score, 0) / scored.length).toFixed(1) : '—';

  if (!authenticated) return <div className="login-screen"><div className="login-card"><div className="brand-mark"><Sparkles size={20} /></div><p className="eyebrow">INTERVIEW STUDIO</p><h1>Recruiter access</h1><p className="muted">The local development token is prefilled. If you changed RECRUITER_TOKEN in backend/.env, enter that value here.</p><form onSubmit={(e) => { e.preventDefault(); refresh(token); }}><label>Recruiter token</label><input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Your private token" autoComplete="current-password" /><button className="button primary full" type="submit">Continue <ArrowUpRight size={16} /></button></form>{error && <p className="error-text">{error}</p>}<div className="secure-note"><LockKeyhole size={14} /> Local development token only — replace before deployment</div></div></div>;

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Sparkles size={17} /></div><span>interview<span className="brand-light">studio</span></span><ChevronDown size={14} className="brand-chevron" /></div>
      <div className="workspace-label">WORKSPACE</div>
      <div className="workspace-switch"><div className="workspace-avatar">N</div><div><strong>Northstar Labs</strong><small>Recruiting team</small></div><ChevronDown size={15} /></div>
      <div className="nav-group"><div className="nav-title">RECRUIT</div><button className="nav-item active"><Users size={17} /> Interviews <span className="nav-count">{candidates.length}</span></button><button className="nav-item" onClick={() => setShowCreate(true)}><Plus size={17} /> New invitation</button></div>
      <div className="nav-group"><div className="nav-title">MANAGE</div><button className="nav-item" onClick={() => refresh()}><Activity size={17} /> Activity</button><button className="nav-item" onClick={() => setError('Evaluation reports are available from each completed interview.')}><FileText size={17} /> Reports</button></div>
      <div className="sidebar-spacer" />
      <div className="sidebar-help"><CircleHelp size={17} /><div><strong>Need a hand?</strong><small>Visit the help center</small></div><ArrowUpRight size={14} /></div>
      <div className="profile"><div className="profile-avatar">JD</div><div><strong>Jordan Davis</strong><small>Recruiter</small></div><MoreHorizontal size={19} /></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="breadcrumb">Workspace <span>/</span> <strong>Interviews</strong></div><div className="top-actions"><span className="environment-pill"><span /> API connected</span><button aria-label="Notifications" className="icon-button"><Bell size={18} /><i /></button><div className="profile-avatar small">JD</div></div></header>
      <section className="page-content">
        <div className="page-heading"><div><div className="eyebrow with-dot">TALENT WORKSPACE</div><h1>Interviews <span className="heading-count">{candidates.length}</span></h1><p>Manage candidate sessions and review AI-generated evaluations.</p></div><button className="button primary" onClick={() => setShowCreate(true)}><Plus size={17} /> Invite candidate</button></div>
        <div className="metric-grid"><Metric label="Total interviews" value={candidates.length} icon={<Users size={18} />} trend="Across all candidates" /><Metric label="In progress" value={active} icon={<AudioLines size={18} />} trend="Live sessions" accent="orange" /><Metric label="Completed" value={completed} icon={<Check size={18} />} trend="Ready for review" accent="green" /><Metric label="Avg. score" value={average} icon={<Activity size={18} />} trend="From completed reports" accent="purple" /></div>
        <div className="table-card"><div className="table-toolbar"><div><h2>All interviews</h2><p>Your candidate pipeline, at a glance.</p></div><div className="toolbar-actions"><label className="search-box"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search candidates" /></label><button className="button secondary" onClick={() => refresh()}><Settings2 size={16} /> Refresh</button></div></div>
          <div className="table-wrap"><table><thead><tr><th>CANDIDATE</th><th>ROLE</th><th>STATUS</th><th>SCHEDULED</th><th>MEETING LINK</th><th></th></tr></thead><tbody>
            {filtered.map((candidate) => <tr key={candidate.id}><td><div className="candidate-cell"><div className={`candidate-avatar color-${candidate.candidate_name.length % 4}`}>{initials(candidate.candidate_name)}</div><div><strong>{candidate.candidate_name}</strong><small>{candidate.candidate_email || 'No email provided'}</small></div></div></td><td><span className="role-label">{candidate.role}</span></td><td><span className={`status-badge ${candidate.status}`}><i />{statusLabel[candidate.status]}</span></td><td className="date-cell">{candidate.scheduled_at ? new Date(candidate.scheduled_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}</td><td><button className="link-button" onClick={() => copyLink(candidate)}><Link2 size={14} /> Copy link</button></td><td><button className="row-action" onClick={() => openReport(candidate)} aria-label="Open interview report"><ArrowUpRight size={17} /></button></td></tr>)}
            {!filtered.length && <tr><td colSpan="6"><div className="empty-state"><div className="empty-icon"><Users size={22} /></div><strong>{loading ? 'Loading interviews…' : query ? 'No matching candidates' : 'Your pipeline starts here'}</strong><p>{query ? 'Try another search.' : 'Invite a candidate to create a private 30-minute interview link.'}</p>{!query && <button className="button secondary" onClick={() => setShowCreate(true)}><Plus size={15} /> Invite candidate</button>}</div></td></tr>}
          </tbody></table></div><div className="table-footer"><span>Showing <strong>{filtered.length}</strong> of <strong>{candidates.length}</strong> interviews</span><span className="privacy-note"><ShieldCheck size={14} /> Private candidate sessions</span></div></div>
        {error && <div className="toast" role="status">{error}<button onClick={() => setError('')} aria-label="Dismiss"><X size={15} /></button></div>}
      </section>
    </main>
    {showCreate && <div className="modal-backdrop" onClick={() => setShowCreate(false)}><div className="modal" onClick={(e) => e.stopPropagation()}><div className="modal-heading"><div><p className="eyebrow">NEW SESSION</p><h2>Schedule an interview</h2></div><button className="icon-button" onClick={() => setShowCreate(false)}><X size={18} /></button></div><p className="muted">Schedule a private 30-minute session. The candidate receives the link by email and can join at the selected time.</p><form onSubmit={createInterview}><label>Candidate name</label><input required value={form.candidate_name} onChange={(e) => setForm({ ...form, candidate_name: e.target.value })} placeholder="e.g. Alex Morgan" /><label>Email address</label><input required type="email" value={form.candidate_email} onChange={(e) => setForm({ ...form, candidate_email: e.target.value })} placeholder="alex@example.com" /><label>Interview role</label><input required value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} /><label>Date and time <span className="optional">{Intl.DateTimeFormat().resolvedOptions().timeZone}</span></label><input required type="datetime-local" min={localDateTimeValue(new Date())} value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} /><div className="modal-info"><Clock3 size={16} /><span><strong>30 minutes · 2 minutes per question</strong><br />A short pause between questions. Invitation email is sent when scheduled; the link opens at the selected time.</span></div>{error && <p className="error-text">{error}</p>}<button type="submit" className="button primary full"><Plus size={16} /> Schedule and email invitation</button></form></div></div>}
    {selected && <ReportModal report={selected} onClose={() => setSelected(null)} />}
  </div>;
}

function Metric({ label, value, icon, trend, accent = 'blue' }) { return <div className="metric-card"><div className={`metric-icon ${accent}`}>{icon}</div><div className="metric-label">{label}</div><div className="metric-value">{value}</div><div className="metric-foot">{trend}</div></div>; }

function ReportModal({ report, onClose }) {
  const evaluation = report.evaluation;
  return <div className="modal-backdrop" onClick={onClose}><div className="modal report-modal" onClick={(e) => e.stopPropagation()}><div className="modal-heading"><div><p className="eyebrow">INTERVIEW REPORT</p><h2>{report.candidate_name}</h2><p className="muted">{report.role} · {statusLabel[report.status]}</p></div><button className="icon-button" onClick={onClose}><X size={18} /></button></div>
    {evaluation ? <div className="evaluation"><div className="score-banner"><div><small>OVERALL SCORE</small><strong>{evaluation.overall_score}<span>/5</span></strong></div><div className="recommendation">{evaluation.recommendation}</div></div><p className="report-summary">{evaluation.summary}</p><div className="score-row"><span>Technical</span><div className="score-track"><i style={{ width: `${(evaluation.technical_score || 0) * 20}%` }} /></div><strong>{evaluation.technical_score}/5</strong></div><div className="score-row"><span>Communication</span><div className="score-track"><i style={{ width: `${(evaluation.communication_score || 0) * 20}%` }} /></div><strong>{evaluation.communication_score}/5</strong></div><div className="report-columns"><ReportList title="Strengths" items={evaluation.strengths} /><ReportList title="Areas to improve" items={evaluation.areas_to_improve} /></div>{evaluation.needs_manual_review && <p className="warning-note">AI evaluation unavailable. Review the transcript and score manually.</p>}</div> : <div className="empty-report"><Clock3 size={24} /><strong>Report not ready</strong><span>Evaluation appears after the candidate completes the interview.</span></div>}
    <div className="transcript-block"><h3><FileText size={16} /> Interview transcript <span>{report.transcript?.length || 0} messages</span></h3><div className="transcript-list">{(report.transcript || []).map((turn, index) => <div className="transcript-turn" key={`${turn.at}-${index}`}><strong>{turn.speaker}</strong><p>{turn.text}</p></div>)}{!report.transcript?.length && <p className="muted">No transcript has been recorded yet.</p>}</div></div></div></div>;
}
function ReportList({ title, items = [] }) { return <div><h4>{title}</h4>{items?.length ? <ul>{items.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p className="muted">No notes</p>}</div>; }

function CandidateInterview() {
  const { token } = useParams();
  const [info, setInfo] = useState(null);
  const [status, setStatus] = useState('loading');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [seconds, setSeconds] = useState(30 * 60);
  const [questionSeconds, setQuestionSeconds] = useState(2 * 60);
  const [startedAt, setStartedAt] = useState(null);
  const [questionAskedAt, setQuestionAskedAt] = useState(null);
  const [clockNow, setClockNow] = useState(Date.now());
  const recognition = useRef(null);
  const submissionLock = useRef(false);
  const timeoutHandled = useRef(false);

  useEffect(() => { api(`/api/candidate/${token}`).then((data) => { setInfo(data); setStatus(data.status); if (data.current_question) setQuestion(data.current_question); if (data.started_at) setStartedAt(data.started_at); if (data.question_asked_at || data.started_at) setQuestionAskedAt(data.question_asked_at || data.started_at); }).catch((e) => { setStatus('error'); setError(e.message); }); }, [token]);
  useEffect(() => {
    if (status !== 'in_progress' && status !== 'scheduled') return undefined;
    const timer = setInterval(() => setClockNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [status]);
  useEffect(() => {
    if (status !== 'in_progress' || !startedAt) return;
    setSeconds(Math.min(30 * 60, Math.max(0, 30 * 60 - Math.floor((clockNow - new Date(startedAt).getTime()) / 1000))));
    if (questionAskedAt) setQuestionSeconds(Math.min(2 * 60, Math.max(0, 2 * 60 - Math.floor((clockNow - new Date(questionAskedAt).getTime()) / 1000))));
  }, [clockNow, questionAskedAt, startedAt, status]);
  useEffect(() => { if (seconds === 0 && status === 'in_progress') finish(); }, [seconds, status]);
  useEffect(() => {
    if (questionSeconds === 0 && status === 'in_progress' && !timeoutHandled.current) {
      timeoutHandled.current = true;
      if (recognition.current) recognition.current.stop();
      setListening(false);
      submitAnswer('', true);
    }
  }, [questionSeconds, status]);
  useEffect(() => () => { if (recognition.current) recognition.current.stop(); }, []);

  const speak = useCallback((text) => {
    if (!('speechSynthesis' in window) || !text) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text); utterance.rate = 0.96; utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  }, []);
  async function start() {
    setBusy(true); setError('');
    try { const result = await api(`/api/candidate/${token}/start`, { method: 'POST' }); setQuestion(result.question); setStartedAt(result.started_at); setQuestionAskedAt(result.question_asked_at); setStatus('in_progress'); speak(result.question); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function submitAnswer(value = answer, timedOut = false) {
    if ((!value.trim() && !timedOut) || submissionLock.current || (busy && !timedOut)) return;
    submissionLock.current = true;
    setBusy(true); setError(''); setAnswer('');
    try {
      if (recognition.current) recognition.current.stop();
      setListening(false);
      const result = await api(`/api/candidate/${token}/answer`, { method: 'POST', body: JSON.stringify({ answer: value.trim(), timed_out: timedOut }) });
      setStatus(result.status);
      if (result.question) {
        setQuestion(result.question);
        setQuestionAskedAt(result.question_asked_at);
        const pause = Math.max(0, new Date(result.question_asked_at).getTime() - Date.now());
        await new Promise((resolve) => setTimeout(resolve, pause));
        speak(result.question);
        timeoutHandled.current = false;
      }
    }
    catch (e) { setError(e.message); setAnswer(value); }
    finally { setBusy(false); submissionLock.current = false; }
  }
  function toggleMic() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) { setError('Speech recognition is not supported in this browser. Try Chrome, or type your answer below.'); return; }
    if (listening) { recognition.current?.stop(); setListening(false); return; }
    const instance = new Recognition(); recognition.current = instance; instance.lang = 'en-US'; instance.interimResults = true; instance.continuous = true;
    instance.onresult = (event) => { let text = ''; for (let i = 0; i < event.results.length; i++) text += event.results[i][0].transcript; setAnswer(text); };
    instance.onerror = (event) => { setListening(false); setError(event.error === 'not-allowed' ? 'Microphone access was denied. Allow microphone access in browser settings.' : 'Microphone recognition stopped. You can still type your answer.'); };
    instance.onend = () => setListening(false); instance.start(); setListening(true);
  }
  async function finish() { try { await api(`/api/candidate/${token}/finish`, { method: 'POST' }); setStatus('completed'); window.speechSynthesis?.cancel(); } catch (e) { setError(e.message); } }
  const time = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  const questionTime = `${String(Math.floor(questionSeconds / 60)).padStart(2, '0')}:${String(questionSeconds % 60).padStart(2, '0')}`;
  const scheduledDate = info?.scheduled_at ? new Date(info.scheduled_at) : null;
  const availableNow = !scheduledDate || scheduledDate.getTime() <= clockNow;

  return <div className="candidate-page"><header className="candidate-header"><Link to="/" className="candidate-brand"><div className="brand-mark"><Sparkles size={17} /></div> interview<span>studio</span></Link><div className="candidate-safe"><ShieldCheck size={15} /> Secure interview session</div></header>
    <main className="interview-main"><div className="interview-kicker"><span className="live-dot" /> AI PYTHON DEVELOPER INTERVIEW <span className="duration-pill"><Clock3 size={14} /> 30 MIN</span></div>
      {status === 'loading' && <div className="candidate-panel"><LoaderCircle className="spin" /><p>Preparing your interview…</p></div>}
      {status === 'error' && <div className="candidate-panel"><div className="error-symbol"><X /></div><h1>Link unavailable</h1><p>{error}</p></div>}
      {status === 'scheduled' && <div className="candidate-panel welcome-panel"><div className="ai-orb"><AudioLines size={30} /></div><p className="eyebrow">YOUR INTERVIEW IS SCHEDULED</p><h1>Welcome{info?.candidate_name ? `, ${info.candidate_name.split(' ')[0]}` : ''}.</h1><p className="candidate-intro">This is a 30-minute conversation for the <strong>{info?.role || 'Python Developer'}</strong> role. Your AI interviewer will ask questions aloud. Each question has a two-minute response window, followed by a short pause. Respond using your microphone, or type your answer.</p>{scheduledDate && <div className="schedule-card"><Clock3 size={17} /><span><strong>{scheduledDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</strong><br />{scheduledDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })} · your local time</span></div>}<div className="prep-list"><div><Check size={16} /> Find a quiet place and allow microphone access</div><div><Check size={16} /> Your responses are transcribed for the recruiter</div><div><Check size={16} /> You can end the interview at any time</div></div><button className="button primary start-button" onClick={start} disabled={busy || !availableNow}>{busy ? <LoaderCircle className="spin" size={17} /> : <Headphones size={17} />}{availableNow ? ' Start interview' : ' Available at scheduled time'} {availableNow && <ArrowUpRight size={16} />}</button>{!availableNow && <p className="scheduled-hint">This meeting link will open at the scheduled time.</p>}<div className="candidate-privacy"><LockKeyhole size={13} /> Your session is private and accessible only to the hiring team.</div></div>}
      {status === 'in_progress' && <div className="live-interview"><div className="live-top"><div className="live-status"><span className="live-dot" /> SESSION IN PROGRESS</div><div className="timer"><Clock3 size={15} /> {time} <span>overall</span><span className="timer-divider">·</span><Clock3 size={14} /> {questionTime} <span>this question</span></div></div><div className="interviewer-stage"><div className="ai-orb speaking"><AudioLines size={30} /></div><div className="speaking-label"><span className="sound-wave"><i /><i /><i /><i /><i /></span> AI INTERVIEWER</div><h1>{question}</h1><button className="replay-button" onClick={() => speak(question)}><Volume2 size={15} /> Replay question</button></div><div className="response-area"><label htmlFor="answer">YOUR RESPONSE · 2 MINUTES</label><textarea id="answer" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder={listening ? 'Listening… speak naturally' : 'Speak your answer, or type here…'} rows={4} disabled={busy || questionSeconds === 0} /><div className="response-controls"><div className="mic-tools"><button className={`mic-button ${listening ? 'recording' : ''}`} onClick={toggleMic} disabled={busy || questionSeconds === 0} aria-label={listening ? 'Stop microphone' : 'Start microphone'}>{listening ? <MicOff size={17} /> : <Mic size={17} />}</button><span>{listening ? 'Listening to you…' : 'Use microphone'}</span><span className="control-divider" /><span className="speech-hint">Microphone speech-to-text</span></div><button className="button primary send-button" disabled={!answer.trim() || busy || questionSeconds === 0} onClick={() => submitAnswer()}>{busy ? <LoaderCircle className="spin" size={16} /> : <>Send response <Send size={15} /></>}</button></div>{questionSeconds === 0 && busy && <p className="muted">Time is up. Preparing the next question…</p>}{error && <p className="error-text">{error}{questionSeconds === 0 && <button className="link-button" onClick={() => { timeoutHandled.current = true; submitAnswer('', true); }}> Retry next question</button>}</p>}</div><div className="live-footer"><span><LockKeyhole size={13} /> Transcript saved securely</span><button onClick={finish}>End interview</button></div></div>}
      {status === 'completed' && <div className="candidate-panel completed-panel"><div className="complete-icon"><Check size={27} /></div><p className="eyebrow">SESSION COMPLETE</p><h1>Thank you, {info?.candidate_name?.split(' ')[0] || 'you'}.</h1><p className="candidate-intro">Your interview has been submitted. The hiring team will review your responses and follow up with you.</p><div className="candidate-privacy"><ShieldCheck size={15} /> Your transcript has been securely saved.</div></div>}
    </main><footer className="candidate-footer">Powered by <strong>Interview Studio</strong><span>·</span> Thoughtful interviews, better hiring</footer>
  </div>;
}

export default App;
