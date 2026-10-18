'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { DashboardRequest, DashboardResponse, DiscoveredProperty, ServiceAccountCredentials, WorkspaceProject } from './lib/dashboard-types';
import { createDemo } from './lib/demo';
import { exportData, number, projectSettings, readWorkspace, reportMarkdown, saveWorkspace, validateProject } from './lib/workspace';
import ProjectReport from './components/ProjectReport';
import PropertyDiscovery from './components/PropertyDiscovery';
import Icon from './components/Icon';
import { CREDENTIAL_SESSION_KEY, parseServiceAccountJson, readCredentialSession, resolveSessionCredentials, saveCredentialSession } from './lib/credential-session';

const blankProject = (): WorkspaceProject => ({ id: '', name: '', url: '', propertyId: '' });
const blankCredentials = (): ServiceAccountCredentials => ({ client_email: '', private_key: '' });
const today = () => new Date().toISOString().slice(0, 10);
const yesterday = () => new Date(Date.now() - 86400000).toISOString().slice(0, 10);

export default function Home() {
  const [projects, setProjects] = useState<WorkspaceProject[]>([]);
  const [activeSection, setActiveSection] = useState('overview');
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState('');
  const [editor, setEditor] = useState<WorkspaceProject | null>(null);
  const [projectError, setProjectError] = useState('');
  const [credentials, setCredentials] = useState<ServiceAccountCredentials>(blankCredentials);
  const [credentialStorageReady, setCredentialStorageReady] = useState(false);
  const [credentialStorageError, setCredentialStorageError] = useState('');
  const [jsonKey, setJsonKey] = useState('');
  const [keyError, setKeyError] = useState('');
  const [keyNotice, setKeyNotice] = useState('');
  const [fileVersion, setFileVersion] = useState(0);
  const [credentialMode, setCredentialMode] = useState<'json' | 'manual'>('json');
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [verified, setVerified] = useState(false);
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [endDate, setEndDate] = useState(yesterday);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [report, setReport] = useState<DashboardResponse | null>(null);
  const [demo, setDemo] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const requestId = useRef(0);
  const busy = useRef(false);
  const fileReadId = useRef(0);
  const editorName = useRef<HTMLInputElement>(null);
  const resultsSection = useRef<HTMLElement>(null);
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const connection = useMemo(() => {
    try {
      return { credentials: resolveSessionCredentials({ credentials, jsonKey, mode: credentialMode }), error: null };
    } catch (error) {
      return { credentials: blankCredentials(), error: error instanceof Error ? error.message : 'Check your service-account credentials.' };
    }
  }, [credentials, jsonKey, credentialMode]);

  useEffect(() => {
    const updateSection = () => setActiveSection(window.location.hash.slice(1) || 'overview');
    updateSection();
    window.addEventListener('hashchange', updateSection);
    return () => window.removeEventListener('hashchange', updateSection);
  }, []);

  useEffect(() => {
    try { setProjects(readWorkspace(window.localStorage)); }
    catch { setStorageError('Saved projects could not be read. Nothing was overwritten. You can use this workspace in memory, then save projects again.'); }
    try {
      const saved = readCredentialSession(window.sessionStorage);
      if (saved) {
        setCredentials(saved.credentials);
        setJsonKey(saved.jsonKey);
        setCredentialMode(saved.mode);
        setKeyNotice('Saved credential entry restored for this tab. Access is not verified yet.');
      }
      setCredentialStorageReady(true);
    } catch {
      setCredentialStorageError('Saved credentials could not be restored. Load your key again or choose “Clear & forget credentials.”');
    }
    setReady(true);
    return () => { controller.current?.abort(); fileReadId.current += 1; };
  }, []);

  useEffect(() => {
    if (!credentialStorageReady) return;
    try {
      saveCredentialSession(window.sessionStorage, { credentials, jsonKey, mode: credentialMode });
      setCredentialStorageError('');
    } catch {
      setCredentialStorageError(credentials.client_email || credentials.private_key || jsonKey
        ? 'Browser session storage is unavailable or full. Your entry is kept in memory but may not survive a refresh. Allow site storage and enter it again.'
        : 'Session storage could not be cleared. Remove this site’s stored data to erase any previously saved credentials.');
    }
  }, [credentials, jsonKey, credentialMode, credentialStorageReady]);

  const editorId = editor?.id;
  useEffect(() => { if (editorId !== undefined) editorName.current?.focus(); }, [editorId]);
  useEffect(() => {
    if (report) {
      resultsSection.current?.scrollIntoView({ block: 'start' });
      resultsHeading.current?.focus({ preventScroll: true });
    }
  }, [report]);

  function invalidate() {
    requestId.current += 1;
    controller.current?.abort();
    busy.current = false;
    setLoading(false);
    setReport(null);
    setDemo(false);
    setError('');
    setFeedback('');
  }

  function updateCredentials(next: ServiceAccountCredentials) {
    invalidate();
    setCredentials(next);
    setCredentialStorageReady(true);
    setVerified(false);
    setKeyError('');
    setKeyNotice('');
  }

  function forgetCredentials() {
    fileReadId.current += 1;
    setShowPrivateKey(false);
    updateCredentials(blankCredentials());
    setJsonKey('');
    setFileVersion(value => value + 1);
    try {
      window.sessionStorage.removeItem(CREDENTIAL_SESSION_KEY);
      setCredentialStorageError('');
      setKeyNotice('Credentials cleared from this tab and its session storage.');
    } catch {
      setCredentialStorageError('Credentials were cleared from memory, but browser storage could not be cleared. Remove this site’s stored data before leaving this device.');
    }
  }

  function importKey(raw: string) {
    try {
      const next = parseServiceAccountJson(raw);
      updateCredentials(next);
      setShowPrivateKey(false);
      setJsonKey(raw);
      setKeyNotice('Service-account key loaded. Access is not verified yet.');
    } catch (error) {
      setKeyError(error instanceof Error ? error.message : 'Use a complete Google service-account JSON key.');
    }
  }

  function changeCredentialMode(mode: 'json' | 'manual') {
    fileReadId.current += 1;
    invalidate();
    setCredentialMode(mode);
    setShowPrivateKey(false);
    setVerified(false);
    setKeyError('');
  }

  async function uploadKey(file: File | undefined) {
    const current = ++fileReadId.current;
    if (!file) return;
    setShowPrivateKey(false);
    updateCredentials(blankCredentials());
    setJsonKey('');
    if (file.size > 131072 || (!file.name.toLowerCase().endsWith('.json') && file.type !== 'application/json')) {
      setKeyError('Choose a JSON service-account key file smaller than 128 KB.');
      return;
    }
    try {
      const raw = await file.text();
      if (fileReadId.current === current) importKey(raw);
    } catch {
      if (fileReadId.current === current) setKeyError('This file could not be read. Try another file or paste the JSON key.');
    }
  }

  function persist(next: WorkspaceProject[]) {
    invalidate();
    setProjects(next);
    try {
      saveWorkspace(window.localStorage, next);
      setStorageError('');
    } catch {
      setStorageError('Browser storage is unavailable or full. Your changes work in this tab but will not survive a reload. Allow site storage and choose “Retry saving.”');
    }

  }

  function openEditor(project: WorkspaceProject) {
    invalidate();
    setEditor(project);
    setProjectError('');
  }

  function chooseProperty(property: DiscoveredProperty, url: string): boolean {
    if (editor && (editor.name || editor.url || editor.propertyId) &&
      !window.confirm('Replace the current project draft with this GA4 property?')) return false;
    openEditor({ id: '', name: property.name, propertyId: property.propertyId, url });
    return true;
  }

  function saveProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;
    const next = projectSettings({ ...editor, id: editor.id || crypto.randomUUID() });
    const message = validateProject(next);
    if (message) { setProjectError(message); return; }
    if (projects.some(project => project.id !== next.id && project.propertyId === next.propertyId)) {
      setProjectError('This property is already in your workspace. Edit its existing project instead.');
      return;
    }
    persist(editor.id ? projects.map(project => project.id === next.id ? next : project) : [...projects, next]);
    setEditor(null);
    setProjectError('');
  }

  async function generate(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (busy.current || demo) return;
    setFeedback('');
    if (editor) { setError('Save or cancel the project you are editing before generating a report.'); return; }
    if (!projects.length) { setError('Add at least one project to generate a report.'); return; }
    if (connection.error) { setError(connection.error); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate) || !Number.isFinite(Date.parse(`${endDate}T12:00:00Z`)) || endDate > today()) {
      setError('Choose a valid end date that is not in the future.'); return;
    }
    busy.current = true;
    setLoading(true);
    setError('');
    setReport(null);
    setVerified(false);
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const id = ++requestId.current;
    const payload: DashboardRequest = {
      projects: projects.map(projectSettings),
      credentials: connection.credentials,
      days,
      endDate,
    };
    try {
      const response = await fetch('/api/dashboard', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: abort.signal, cache: 'no-store' });
      if (id !== requestId.current) return;
      const data = await response.json() as DashboardResponse & { error?: string };
      if (!Array.isArray(data.reports) || !Array.isArray(data.errors) || typeof data.generatedAt !== 'string') throw new Error('Invalid response');
      if (id !== requestId.current) return;
      if (!response.ok) {
        if (data.errors.length) {
          setReport(data);
          setError('No projects could be loaded. Follow the guidance for each project below, then try again.');
          return;
        }
        setError(typeof data.error === 'string' ? data.error : response.status === 401 || response.status === 403
          ? 'Google did not grant access. Check your service-account key, enable the Analytics Data API, and add the service account as a Viewer on each GA4 property.'
          : response.status === 429 ? 'Too many requests. Wait a moment, then try again.'
            : response.status === 400 ? 'The request could not be accepted. Check the key format, numeric property IDs, and reporting dates.'
              : 'The report could not be generated. Check your connection and GA4 access, then try again.');
        return;
      }
      setReport(data);
      setVerified(data.reports.length > 0);
      if (data.reports.length > 0) setKeyNotice('');
      if (!data.reports.length && !data.errors.length) setError('No project results were returned. Check the selected properties and try again.');
    } catch {
      if (id === requestId.current && !abort.signal.aborted) setError('Monthly could not reach the report service. Check your connection and try again.');
    } finally {
      if (id === requestId.current) { busy.current = false; setLoading(false); }
    }
  }

  function exploreDemo() {
    invalidate();
    const date = /^\d{4}-\d{2}-\d{2}$/.test(endDate) && Number.isFinite(Date.parse(endDate)) ? endDate : yesterday();
    setReport(createDemo(days, date));
    setDemo(true);
  }

  function download(format: 'json' | 'md') {
    if (!report) return;
    try {
      const body = format === 'json' ? JSON.stringify(exportData(report, demo), null, 2) : reportMarkdown(report, demo);
      const blob = new Blob([body], { type: format === 'json' ? 'application/json' : 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `monthly-${demo ? 'demo-' : ''}${report.reports[0]?.period.endDate || endDate}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setFeedback(`${format === 'json' ? 'JSON' : 'Markdown'} download prepared. No credentials included.`);
    } catch { setFeedback('Download could not be prepared. Try copying the Markdown instead.'); }
  }

  async function copyReport() {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(reportMarkdown(report, demo));
      setFeedback('Markdown copied. No credentials included.');
    } catch { setFeedback('Clipboard access was blocked. Use the Markdown download instead.'); }
  }

  const totalPageViews = report?.reports.reduce((total, project) => total + project.metrics.pageViews.current, 0) ?? 0;
  const totalUsers = report?.reports.reduce((total, project) => total + project.metrics.activeUsers.current, 0) ?? 0;
  const hasKey = !!credentials.client_email || !!credentials.private_key || !!jsonKey;

  return (
    <div className="workspace-shell">
      <a className="skip-link" href="#main">Skip to workspace</a>
      <aside className="sidebar" aria-label="Workspace navigation">
        <a className="brand" href="#overview" aria-label="Monthly home"><span className="brand-mark" aria-hidden="true">m</span>monthly<span className="brand-period">.</span></a>
        <div className="nav-caption">YOUR WORKSPACE</div>
        <nav>{([
          ['overview', 'Overview'], ['projects', 'Projects'], ['connection', 'Connection'],
        ] as const).map(([section, label]) => <a key={section} className={`nav-item${activeSection === section ? ' active' : ''}`} href={`#${section}`} aria-current={activeSection === section ? 'location' : undefined}><Icon name={section} />{label}{section === 'projects' && <span className="nav-count">{projects.length}</span>}</a>)}</nav>
        <div className="sidebar-bottom"><span className="local-dot" /> Browser-local workspace<p>Your projects stay here.<br />Your key survives refreshes.</p><a href="#privacy">How privacy works <Icon name="external" /></a></div>
      </aside>
      <div className="workspace-body">
        <header className="topbar"><div><span className="breadcrumb">Workspace</span><Icon name="chevron" /><span>Overview</span></div><span className="private-label"><Icon name="shield" /> Your analytics. Your key.</span></header>
        <main id="main">
          <section className="page-intro" id="overview"><div><p className="eyebrow">A LITTLE PERSPECTIVE, EVERY MONTH</p><h1>Know what’s <em>moving.</em></h1><p className="intro-copy">Your projects, side by side. Less digging through analytics.<br className="desktop-break" /> More understanding what changed.</p></div><button className="button secondary demo-button" type="button" onClick={exploreDemo}>Explore demo <Icon name="external" /></button></section>

          <div className="setup-grid">
            <section className="panel projects-panel" id="projects" aria-labelledby="projects-heading">
              <div className="section-header"><div><p className="eyebrow">THE THINGS YOU’RE BUILDING</p><h2 id="projects-heading">Your projects <span className="count-badge">{projects.length}</span></h2></div><button type="button" className="button small secondary" disabled={!ready || projects.length >= 12 || !!editor} onClick={() => openEditor(blankProject())}><Icon name="plus" />Add project</button></div>
              <p className="section-copy">Saved only in this browser. Add the GA4 properties you want to compare.</p>
              <PropertyDiscovery credentials={connection.credentials} connectionError={connection.error} projects={projects} disabled={!ready} onChoose={chooseProperty} onVerified={() => { setVerified(true); setKeyNotice(''); }} />
              {!ready ? <p className="empty-inline">Opening your workspace…</p> : projects.length === 0 && !editor ? <div className="project-empty"><p>A home for your side projects.</p><span>Add your first project, or explore the demo.</span><button className="text-button" type="button" onClick={() => openEditor(blankProject())}>Add your first project <Icon name="arrow" /></button></div> : null}
              {projects.length > 0 && <ul className="saved-projects">{projects.map((project, index) => <li key={project.id}>
                <span className={`project-avatar small-avatar tone-${index % 2}`} aria-hidden="true">{project.name.slice(0, 1).toUpperCase()}</span><div className="saved-project-info"><strong>{project.name}</strong><span>{project.url}</span><span className="property-label">GA4 · {project.propertyId}</span></div><div className="project-actions"><button className="text-button" type="button" disabled={!!editor} aria-label={`Edit ${project.name}`} onClick={() => openEditor({ ...project })}>Edit</button><button className="remove-button" type="button" disabled={!!editor} aria-label={`Remove ${project.name}`} onClick={() => { if (window.confirm(`Remove ${project.name} from this browser workspace?`)) persist(projects.filter(item => item.id !== project.id)); }}><Icon name="close" /></button></div>
              </li>)}</ul>}
              {editor && <form className="project-editor" onSubmit={saveProject}>
                <h3>{editor.id ? 'Edit project' : 'Add a project'}</h3>
                <label htmlFor="project-name">Project name<input ref={editorName} id="project-name" required maxLength={100} value={editor.name} placeholder="My next good idea" onChange={event => setEditor({ ...editor, name: event.target.value })} /></label>
                <div className="form-columns"><label htmlFor="project-url">Site URL<input id="project-url" type="url" required maxLength={2048} placeholder="https://example.com" value={editor.url} onChange={event => setEditor({ ...editor, url: event.target.value })} /></label><label htmlFor="property-id">GA4 property ID<input id="property-id" inputMode="numeric" pattern="[1-9][0-9]{0,19}" required maxLength={20} placeholder="Numeric ID" value={editor.propertyId} onChange={event => setEditor({ ...editor, propertyId: event.target.value })} /></label></div>
                <p className="hint">Find the numeric ID in GA4 → Admin → Property details. Not the G- measurement ID.</p>
                {projectError && <p className="inline-error" role="alert">{projectError}</p>}
                <div className="editor-buttons"><button className="button primary small" type="submit">Save project</button><button className="button secondary small" type="button" onClick={() => { setEditor(null); setProjectError(''); }}>Cancel</button></div>
              </form>}
              {storageError && <div className="notice warning" role="alert"><p>{storageError}</p><button className="text-button" type="button" onClick={() => { try { saveWorkspace(window.localStorage, projects); setStorageError(''); } catch { setStorageError('Still unable to save. Your projects are available only in this tab.'); } }}>Retry saving</button></div>}
            </section>

            <section className="panel connection-panel" id="connection" aria-labelledby="connection-heading">
              <div className="section-header"><div><p className="eyebrow">BRING YOUR OWN KEY</p><h2 id="connection-heading">Google Analytics</h2></div><span className={`status-pill ${verified ? 'connected' : ''}`}><span className="status-dot" aria-hidden="true" />{verified ? 'Access verified' : hasKey ? connection.error ? 'Credentials incomplete' : 'Key entered · unverified' : 'Not connected'}</span></div>
              <p className="section-copy">Connect with a service-account JSON key. Credentials stay in this tab’s session storage across refreshes. Use “Clear & forget” to remove them.</p>
              <div className="input-tabs" aria-label="Credential entry method"><button type="button" aria-pressed={credentialMode === 'json'} onClick={() => changeCredentialMode('json')}>JSON key</button><button type="button" aria-pressed={credentialMode === 'manual'} onClick={() => changeCredentialMode('manual')}>Enter manually</button></div>
              {credentialMode === 'json' ? <div className="credential-fields"><label htmlFor="json-key">Paste service-account JSON<textarea className={`secret-field${showPrivateKey ? ' is-visible' : ''}`} id="json-key" rows={3} maxLength={131072} autoComplete="off" spellCheck={false} value={jsonKey} placeholder="Paste the entire JSON file, including client_email and private_key" onChange={event => { fileReadId.current += 1; updateCredentials(blankCredentials()); setJsonKey(event.target.value); }} /></label><p className="hint">A complete JSON key works immediately with Find GA4 properties. No extra load step is required.</p><div className="key-actions"><button type="button" className="button secondary small" disabled={!jsonKey.trim()} onClick={() => { fileReadId.current += 1; importKey(jsonKey); }}>Load pasted key</button><span className="hint">or</span><label className="file-label" htmlFor="key-file"><Icon name="upload" />Upload JSON<input className="sr-only" key={fileVersion} id="key-file" type="file" accept=".json,application/json" onChange={event => { void uploadKey(event.target.files?.[0]); event.target.value = ''; }} /></label></div></div> :
                <div className="credential-fields"><label htmlFor="client-email">Service-account email<input id="client-email" type="email" maxLength={254} autoComplete="off" spellCheck={false} value={credentials.client_email} placeholder="name@project.iam.gserviceaccount.com" onChange={event => { fileReadId.current += 1; updateCredentials({ ...credentials, client_email: event.target.value }); setJsonKey(''); }} /></label><label htmlFor="private-key">Private key <span className="hint">{showPrivateKey ? 'visible on screen' : 'hidden as you type'}</span><textarea className={`secret-field${showPrivateKey ? ' is-visible' : ''}`} id="private-key" rows={3} maxLength={16384} autoComplete="off" spellCheck={false} value={credentials.private_key} placeholder="-----BEGIN PRIVATE KEY-----" onChange={event => { fileReadId.current += 1; updateCredentials({ ...credentials, private_key: event.target.value }); setJsonKey(''); }} /></label><p className="hint">{'Both the email and private key are required. Actual line breaks and literal \\n sequences are supported.'}</p></div>}
              <div className="credential-actions"><button className="text-button" type="button" aria-pressed={showPrivateKey} aria-controls={credentialMode === 'json' ? 'json-key' : 'private-key'} onClick={() => setShowPrivateKey(visible => !visible)}><Icon name={showPrivateKey ? 'eyeOff' : 'eye'} />{showPrivateKey ? 'Hide private key' : 'Show private key'}</button>
              {(hasKey || jsonKey || credentialStorageError) && <button className="text-button forget-button" type="button" onClick={forgetCredentials}>Clear & forget credentials</button>}</div>
              {keyError && <p className="inline-error" role="alert">{keyError}</p>}
              {keyNotice && <p className="key-notice" role="status">{keyNotice}</p>}
              {credentialStorageError && <p className="inline-error" role="alert">{credentialStorageError}</p>}
              <details className="setup-help"><summary>How to connect your account</summary><ol><li>In Google Cloud, enable the <strong>Google Analytics Data API</strong> for reports and the <strong>Google Analytics Admin API</strong> for property discovery.</li><li>Create a service account and download a JSON key. Keep it private.</li><li>In each GA4 property, open Admin → Property access management. Add the service-account email with the <strong>Viewer</strong> role.</li><li>Load the JSON key here, choose <strong>Find GA4 properties</strong> or add a numeric property ID manually, and generate a report.</li></ol><p>A Measurement Protocol API secret cannot read reports and is not supported.</p></details>
            </section>
          </div>

          <form className="report-toolbar" onSubmit={generate} aria-label="Report settings">
            <div className="report-toolbar-title"><span className="toolbar-icon"><Icon name="calendar" /></span><div><h2>Your reporting window</h2><p>Compared with the preceding equal-length period.<br />Recent GA4 data may still be incomplete.</p></div></div>
            <div className="report-controls"><label htmlFor="report-days">Date range<select id="report-days" value={days} onChange={event => { invalidate(); setDays(Number(event.target.value) as 7 | 30 | 90); }}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select></label><label htmlFor="end-date">Ending on<input id="end-date" type="date" required max={today()} value={endDate} onChange={event => { invalidate(); setEndDate(event.target.value); }} /></label><button className="button primary generate-button" type="submit" disabled={!ready || loading || demo}>{loading ? 'Reading your analytics…' : 'Generate report'}{loading ? <span className="button-spinner" aria-hidden="true" /> : <Icon name="arrow" />}</button></div>
          </form>
          {demo && <div className="notice demo-notice" role="status"><div><strong>You’re exploring a demo.</strong><p>Two fictional projects. Deterministic synthetic data, not real analytics. Your saved projects are unchanged. No request is sent.</p></div><button className="button secondary small" type="button" onClick={invalidate}>Exit demo</button></div>}
          {error && <div className="notice error-notice" role="alert"><div><strong>Let’s get your report working.</strong><p>{error}</p></div><button className="button secondary small" type="button" onClick={() => void generate()} disabled={loading || demo}>Try again</button></div>}
          {loading && <div className="loading-state" role="status"><span className="loading-dot" /> Reading your GA4 properties. Your key is used only for this request.</div>}
          {report && <section ref={resultsSection} className="results" aria-labelledby="results-heading">
            <div className="results-header"><div><p className="eyebrow">{demo ? 'SYNTHETIC DEMO REPORT' : 'THE BIG PICTURE'}</p><h2 ref={resultsHeading} tabIndex={-1} id="results-heading">A clearer view of your projects.</h2><p className="section-copy">{report.reports.length} of {report.reports.length + report.errors.length} projects available · {demo ? 'Demo snapshot' : `Generated ${new Date(report.generatedAt).toLocaleString()}`}</p></div><div className="export-actions"><button className="button secondary small" type="button" onClick={copyReport}><Icon name="copy" />Copy Markdown</button><button className="button secondary small" type="button" aria-label="Download Markdown" onClick={() => download('md')}><Icon name="download" />Markdown</button><button className="button secondary small" type="button" aria-label="Download JSON" onClick={() => download('json')}><Icon name="download" />JSON</button></div></div>
            {feedback && <p className="export-feedback" role="status">{feedback}</p>}
            {report.reports.length > 0 && <div className="overview-strip"><div><span>Total pageviews</span><strong>{number(totalPageViews)}</strong></div><div><span>Users · sum across properties</span><strong>{number(totalUsers)}</strong></div><p>Users are <strong>not deduplicated</strong> across properties. Each project’s total is unique within that property.</p></div>}
            {report.errors.length > 0 && <div className="notice warning"><div><strong>{report.reports.length ? 'Some properties need attention.' : 'No properties could be read.'}</strong><p>{report.reports.length ? 'Available results are shown below. ' : ''}Check the service account’s Viewer access, the numeric property IDs, and that the Analytics Data API is enabled.</p><ul>{report.errors.map((failure, index) => <li key={`${failure.project.id}-${index}`}><strong>{failure.project.name}</strong> — <span>{failure.message}</span></li>)}</ul></div><button className="button secondary small" type="button" onClick={() => void generate()} disabled={loading || demo}>Retry report</button></div>}
            <div className="project-reports-grid">{report.reports.map((project, index) => <ProjectReport key={project.project.id} report={project} index={index} />)}</div>
          </section>}
          {!report && !loading && <section className="report-placeholder"><div className="placeholder-fingerprint" aria-hidden="true"><svg viewBox="0 0 320 90"><path d="M0 66 L22 60 L40 68 L58 40 L78 49 L98 33 L118 46 L138 22 L158 35 L178 30 L198 51 L218 28 L238 34 L258 13 L278 23 L300 10 L320 17" /></svg></div><p className="eyebrow">YOUR NEXT CHECK-IN STARTS HERE</p><h2>Every project has a pattern.</h2><p>Add your projects and connect Google Analytics to find yours.<br />Or <button className="text-button" type="button" onClick={exploreDemo}>explore the demo</button> — no key needed.</p></section>}
          <footer className="privacy-footer" id="privacy"><div className="footer-wordmark">monthly.</div><p><strong>Private by design, not by promise.</strong> Projects use this browser’s local storage. Credentials use this tab’s session storage so refreshing keeps your connection; the private key is hidden again after reload. Credentials are sent to this app’s server only when finding properties or generating reports, and are not intentionally stored on the server or included in exports. Session storage is readable by scripts on this site and may survive browser session restore. Use “Clear & forget credentials” on shared devices and a trusted deployment over HTTPS.</p><span>Built for the things you build.</span></footer>
        </main>
      </div>
    </div>
  );
}
