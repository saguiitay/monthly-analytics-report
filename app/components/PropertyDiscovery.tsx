'use client';

import { useEffect, useRef, useState } from 'react';
import type { DiscoveredProperty, DiscoveredPropertyDraft, PropertyDiscoveryResponse, PropertyWebsiteResponse, ServiceAccountCredentials, WorkspaceProject } from '../lib/dashboard-types';
import Icon from './Icon';

export default function PropertyDiscovery({ credentials, projects, connectionError, disabled, onChoose, onVerified }: {
  credentials: ServiceAccountCredentials;
  projects: WorkspaceProject[];
  connectionError: string | null;
  disabled: boolean;
  onChoose: (properties: DiscoveredPropertyDraft[]) => boolean;
  onVerified: () => void;
}) {
  const [result, setResult] = useState<PropertyDiscoveryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selecting, setSelecting] = useState<string[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [completed, setCompleted] = useState(0);
  const [notice, setNotice] = useState('');
  const controller = useRef<AbortController | null>(null);
  const requestId = useRef(0);
  const busy = useRef(false);
  const callbacks = useRef({ onChoose, onVerified });
  const selectAll = useRef<HTMLInputElement>(null);
  const availableSlots = Math.max(0, 12 - projects.length);
  const available = result?.properties.filter(property => !projects.some(project => project.propertyId === property.propertyId)) ?? [];
  const selected = available.filter(property => selectedIds.includes(property.propertyId));
  const firstAvailable = available.slice(0, availableSlots);
  const allSelected = firstAvailable.length > 0 && firstAvailable.every(property => selectedIds.includes(property.propertyId));

  useEffect(() => {
    if (selectAll.current) selectAll.current.indeterminate = selected.length > 0 && !allSelected;
  }, [selected.length, allSelected]);

  useEffect(() => { callbacks.current = { onChoose, onVerified }; }, [onChoose, onVerified]);

  useEffect(() => {
    setSelectedIds(current => current.filter(id => !projects.some(project => project.propertyId === id)).slice(0, Math.max(0, 12 - projects.length)));
  }, [projects]);

  useEffect(() => {
    requestId.current += 1;
    controller.current?.abort();
    busy.current = false;
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

  async function chooseProperties(properties: DiscoveredProperty[]) {
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
      if (callbacks.current.onChoose(drafts)) {
        setSelectedIds(current => current.filter(propertyId => !properties.some(property => property.propertyId === propertyId)));
        const missing = drafts.filter(property => !property.url).length;
        setNotice([
          missing ? drafts.length === 1
            ? 'This property has no website URL in its web data streams. Enter Site URL manually before saving.'
            : `GA4 returned no website URL for ${missing} selected ${missing === 1 ? 'property' : 'properties'}. Complete any missing Site URLs before saving.` : '',
          multipleWebsites ? 'Some properties have multiple websites. The first web stream URL is prefilled; you can edit Site URL before saving.' : '',
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
      <button type="button" className="button secondary small" disabled={disabled || loading || selecting !== null} onClick={() => void findProperties()}>
        {loading ? 'Finding GA4 properties…' : result ? 'Refresh GA4 properties' : 'Find GA4 properties'}
      </button>
      <p className="hint">{!connectionError ? 'Find properties this key can access, then add one or select several to review together.' : 'Paste the full service-account JSON, or enter both its email and private key, in Google Analytics.'}</p>
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
      {result && <div className="discovered-properties">
        <p className="hint" role="status">{result.properties.length} {result.properties.length === 1 ? 'property' : 'properties'} found{result.nextPageToken ? ' so far. More results are available.' : '.'}</p>
        {!result.properties.length && !result.nextPageToken && <p className="hint">No accessible GA4 properties were returned. Add this service account as a Viewer in GA4 Property access management, then refresh. You can also add a property manually.</p>}
        {available.length > 0 && availableSlots > 0 && <>
          <div className="property-selection-toolbar">
            <label className="property-select-all"><input ref={selectAll} type="checkbox" checked={allSelected} disabled={disabled || loading || selecting !== null} onChange={event => {
              setError('');
              setSelectedIds(event.target.checked ? firstAvailable.map(property => property.propertyId) : []);
            }} />{available.length > availableSlots ? `Select first ${availableSlots}` : 'Select all'}</label>
            <button type="button" className="button primary small" disabled={disabled || loading || selecting !== null || selected.length === 0} onClick={() => void chooseProperties(selected)}>Add {selected.length === 1 ? 'property' : 'properties'}{selected.length ? ` (${selected.length})` : ''}</button>
          </div>
          <p className="hint">Select up to {availableSlots} {availableSlots === 1 ? 'property' : 'properties'}. Review their names and URLs together before saving.</p>
        </>}
        <ul className="property-options">
          {result.properties.map(property => {
            const added = projects.some(project => project.propertyId === property.propertyId);
            return <li key={property.propertyId}>
              <label className="property-choice"><input type="checkbox" aria-label={`Select ${property.name} (${property.propertyId})`} checked={added || selectedIds.includes(property.propertyId)} disabled={added || disabled || loading || selecting !== null} onChange={event => toggleProperty(property.propertyId, event.target.checked)} /><span className="property-option-info"><strong>{property.name}</strong><span>{property.accountName} · {property.propertyId}</span></span></label>
              {added ? <span className="hint">Added</span> : <button className="text-button" type="button" disabled={disabled || loading || selecting !== null} aria-label={`Add ${property.name} (${property.propertyId})`} onClick={() => void chooseProperties([property])}>{selecting?.includes(property.propertyId) ? 'Loading website…' : 'Add property'}<Icon name="arrow" /></button>}
            </li>;
          })}
        </ul>
        {result.nextPageToken && <button className="text-button" type="button" disabled={loading || disabled || selecting !== null} onClick={() => void findProperties(true)}>Load more properties</button>}
      </div>}
    </div>
  );
}
