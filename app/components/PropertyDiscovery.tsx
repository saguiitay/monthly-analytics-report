'use client';

import { useEffect, useRef, useState } from 'react';
import type { DiscoveredProperty, DiscoveredPropertyDraft, PropertyDiscoveryResponse, PropertyWebsiteResponse, ServiceAccountCredentials, WorkspaceProject } from '../lib/dashboard-types';
import Icon from './Icon';

export default function PropertyDiscovery({ credentials, projects, connectionError, disabled, onAdd, onVerified }: {
  credentials: ServiceAccountCredentials;
  projects: WorkspaceProject[];
  connectionError: string | null;
  disabled: boolean;
  onAdd: (properties: DiscoveredPropertyDraft[]) => string | null;
  onVerified: () => void;
}) {
  const [result, setResult] = useState<PropertyDiscoveryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selecting, setSelecting] = useState<string[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [completed, setCompleted] = useState(0);
  const [notice, setNotice] = useState('');
  const [expanded, setExpanded] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const requestId = useRef(0);
  const busy = useRef(false);
  const callbacks = useRef({ onAdd, onVerified });
  const selectAll = useRef<HTMLInputElement>(null);
  const availableSlots = Math.max(0, 12 - projects.length);
  const available = result?.properties.filter(property => !projects.some(project => project.propertyId === property.propertyId)) ?? [];
  const selected = available.filter(property => selectedIds.includes(property.propertyId));
  const firstAvailable = available.slice(0, availableSlots);
  const allSelected = firstAvailable.length > 0 && firstAvailable.every(property => selectedIds.includes(property.propertyId));

  useEffect(() => {
    if (selectAll.current) selectAll.current.indeterminate = selected.length > 0 && !allSelected;
  }, [selected.length, allSelected]);

  useEffect(() => { callbacks.current = { onAdd, onVerified }; }, [onAdd, onVerified]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Manual project changes can invalidate selections and reduce available capacity.
    setSelectedIds(current => current.filter(id => !projects.some(project => project.propertyId === id)).slice(0, Math.max(0, 12 - projects.length)));
  }, [projects]);

  useEffect(() => {
    requestId.current += 1;
    controller.current?.abort();
    busy.current = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Discard discovery state when credentials change, alongside aborting its requests.
    setResult(null);
    setLoading(false);
    setError('');
    setSelecting(null);
    setSelectedIds([]);
    setNotice('');
    return () => {
      requestId.current += 1;
      controller.current?.abort();
    };
  }, [credentials]);

  async function findProperties(more = false) {
    if (busy.current || disabled) return;
    if (connectionError) {
      setError(connectionError);
      return;
    }
    busy.current = true;
    setLoading(true);
    setError('');
    setNotice('');
    if (!more) { setResult(null); setSelectedIds([]); }
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const id = ++requestId.current;
    try {
      const response = await fetch('/api/properties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        signal: abort.signal,
        body: JSON.stringify({
          credentials: {
            client_email: credentials.client_email.trim(),
            private_key: credentials.private_key,
          },
          ...(more && result?.nextPageToken ? { pageToken: result.nextPageToken } : {}),
        }),
      });
      const data = await response.json() as PropertyDiscoveryResponse & { error?: string };
      if (id !== requestId.current || abort.signal.aborted) return;
      if (!response.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Could not find properties. Check the key and enable the Google Analytics Admin API, then retry.');
        return;
      }
      if (!Array.isArray(data.properties) || (data.nextPageToken !== null && typeof data.nextPageToken !== 'string') ||
        data.properties.some(property => !property || typeof property.name !== 'string' || typeof property.accountName !== 'string' ||
          typeof property.propertyId !== 'string' || !/^[1-9]\d{0,19}$/.test(property.propertyId))) {
        throw new Error('Invalid discovery response');
      }
      setResult(previous => ({
        properties: [...new Map([...(more ? previous?.properties ?? [] : []), ...data.properties].map(property => [property.propertyId, property])).values()],
        nextPageToken: data.nextPageToken,
      }));
      setExpanded(true);
      callbacks.current.onVerified();
    } catch {
      if (id === requestId.current && !abort.signal.aborted) setError('Could not reach property discovery. Check your connection, then try again.');
    } finally {
      if (id === requestId.current) {
        busy.current = false;
        setLoading(false);
      }
    }
  }

  function toggleProperty(propertyId: string, checked: boolean) {
    if (checked && selected.length >= availableSlots) {
      setError(`You can add ${availableSlots} more ${availableSlots === 1 ? 'project' : 'projects'}. Deselect a property or remove a saved project first.`);
      return;
    }
    setError('');
    setSelectedIds(current => checked ? [...current, propertyId] : current.filter(id => id !== propertyId));
  }

  async function addProperties(properties: DiscoveredProperty[]) {
    if (busy.current || disabled) return;
    if (connectionError) { setError(connectionError); return; }
    if (projects.length + properties.length > 12) {
      setError('Your workspace supports up to 12 projects. Remove a project or select fewer properties.');
      return;
    }
    busy.current = true;
    setSelecting(properties.map(property => property.propertyId));
    setCompleted(0);
    setError('');
    setNotice('');
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const id = ++requestId.current;
    let failureMessage = '';
    try {
      const drafts: DiscoveredPropertyDraft[] = new Array(properties.length);
      let cursor = 0;
      let done = 0;
      let multipleWebsites = false;
      await Promise.all(Array.from({ length: Math.min(3, properties.length) }, async () => {
        while (cursor < properties.length) {
          const index = cursor++;
          const property = properties[index];
          const response = await fetch('/api/property-website', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store',
            signal: abort.signal,
            body: JSON.stringify({ credentials, propertyId: property.propertyId }),
          });
          const data = await response.json() as PropertyWebsiteResponse & { error?: string };
          if (id !== requestId.current || abort.signal.aborted) return;
          if (!response.ok) {
            failureMessage ||= `${property.name}: ${typeof data.error === 'string' ? data.error : 'Could not read this property’s website. Try again or add the project manually.'}`;
            throw new Error('Property website lookup failed');
          }
          if (!Array.isArray(data.urls) || data.urls.some(url => typeof url !== 'string' || url.length > 2048 || !/^https?:\/\//i.test(url))) {
            throw new Error('Invalid property website response');
          }
          drafts[index] = { ...property, url: data.urls[0] ?? '' };
          multipleWebsites ||= data.urls.length > 1;
          setCompleted(++done);
        }
      }));
      if (id !== requestId.current) return;
      callbacks.current.onVerified();
      const addError = callbacks.current.onAdd(drafts);
      if (addError) {
        setError(addError);
      } else {
        setSelectedIds(current => current.filter(propertyId => !properties.some(property => property.propertyId === propertyId)));
        setExpanded(false);
        const missing = drafts.filter(property => !property.url).length;
        setNotice([
          `Added ${drafts.length} ${drafts.length === 1 ? 'property' : 'properties'}.`,
          missing ? `${missing} ${missing === 1 ? 'property has' : 'properties have'} no website URL. Reporting still works; use Edit to add an optional URL.` : '',
          multipleWebsites ? 'For properties with multiple websites, the first web stream URL was used. You can change it with Edit.' : '',
        ].filter(Boolean).join(' '));
      }
    } catch {
      if (id === requestId.current && !abort.signal.aborted) {
        setError(failureMessage || 'Could not read the selected properties’ websites. Check your connection and retry, or add projects manually.');
        abort.abort();
      }
    } finally {
      if (id === requestId.current) {
        busy.current = false;
        setSelecting(null);
      }
    }
  }

  return (
    <div className="property-discovery">
      <div className="property-discovery-heading">
      <button type="button" className="button secondary small" disabled={disabled || loading || selecting !== null} onClick={() => void findProperties()}>
        {loading ? 'Finding GA4 properties…' : result ? 'Refresh GA4 properties' : 'Find GA4 properties'}
      </button>
      <p className="hint">{!connectionError ? 'Find properties this key can access. Add one or select several.' : 'Paste the full service-account JSON, or enter both its email and private key, in Google Analytics.'}</p>
      </div>
      {projects.length >= 12 && <p className="hint">Your workspace has 12 projects. Remove one before adding another discovered property.</p>}
      {loading && <p className="hint" role="status">Reading accessible properties from Google Analytics…</p>}
      {selecting && <div className="property-lookup-progress"><p className="hint" role="status">Reading website URLs: {completed} of {selecting.length} {selecting.length === 1 ? 'property' : 'properties'}…</p><button className="text-button" type="button" onClick={() => {
        requestId.current += 1;
        controller.current?.abort();
        busy.current = false;
        setSelecting(null);
        setCompleted(0);
        setNotice('Website lookup canceled. Your property selection is unchanged.');
      }}>Cancel lookup</button></div>}
      {error && <p className="inline-error" role="alert">{error}</p>}
      {notice && <p className="hint" role="status">{notice}</p>}
      {result && <details className="discovered-properties" open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}>
        <summary><Icon name="chevron" />{expanded ? 'Available GA4 properties' : 'Show GA4 properties'}<span className="count-badge">{result.properties.length}</span></summary>
        <p className="hint" role="status">{result.properties.length} {result.properties.length === 1 ? 'property' : 'properties'} found{result.nextPageToken ? ' so far. More results are available.' : '.'}</p>
        {!result.properties.length && !result.nextPageToken && <p className="hint">No accessible GA4 properties were returned. Add this service account as a Viewer in GA4 Property access management, then refresh. You can also add a property manually.</p>}
        {available.length > 0 && availableSlots > 0 && <>
          <div className="property-selection-toolbar">
            <label className="property-select-all"><input ref={selectAll} type="checkbox" checked={allSelected} disabled={disabled || loading || selecting !== null} onChange={event => {
              setError('');
              setSelectedIds(event.target.checked ? firstAvailable.map(property => property.propertyId) : []);
            }} />{available.length > availableSlots ? `Select first ${availableSlots}` : 'Select all'}</label>
            <button type="button" className="button primary small" disabled={disabled || loading || selecting !== null || selected.length === 0} onClick={() => void addProperties(selected)}>Add {selected.length === 1 ? 'property' : 'properties'}{selected.length ? ` (${selected.length})` : ''}</button>
          </div>
          <p className="hint">Add up to {availableSlots} more {availableSlots === 1 ? 'property' : 'properties'}. No extra save step.</p>
        </>}
        <ul className="property-options">
          {result.properties.map(property => {
            const added = projects.some(project => project.propertyId === property.propertyId);
            return <li key={property.propertyId}>
              <label className="property-choice"><input type="checkbox" aria-label={`Select ${property.name} (${property.propertyId})`} checked={added || selectedIds.includes(property.propertyId)} disabled={added || disabled || loading || selecting !== null} onChange={event => toggleProperty(property.propertyId, event.target.checked)} /><span className="property-option-info"><strong>{property.name}</strong><span>{property.accountName} · {property.propertyId}</span></span></label>
              {added ? <span className="hint">Added</span> : <button className="text-button" type="button" disabled={disabled || loading || selecting !== null} aria-label={`Add ${property.name} (${property.propertyId})`} onClick={() => void addProperties([property])}>{selecting?.includes(property.propertyId) ? 'Loading website…' : 'Add property'}<Icon name="arrow" /></button>}
            </li>;
          })}
        </ul>
        {result.nextPageToken && <button className="text-button" type="button" disabled={loading || disabled || selecting !== null} onClick={() => void findProperties(true)}>Load more properties</button>}
      </details>}
    </div>
  );
}
