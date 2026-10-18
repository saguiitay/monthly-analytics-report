'use client';

import { useEffect, useRef, useState } from 'react';
import type { DiscoveredProperty, PropertyDiscoveryResponse, PropertyWebsiteResponse, ServiceAccountCredentials, WorkspaceProject } from '../lib/dashboard-types';
import Icon from './Icon';

export default function PropertyDiscovery({ credentials, projects, connectionError, disabled, onChoose, onVerified }: {
  credentials: ServiceAccountCredentials;
  projects: WorkspaceProject[];
  connectionError: string | null;
  disabled: boolean;
  onChoose: (property: DiscoveredProperty, url: string) => boolean;
  onVerified: () => void;
}) {
  const [result, setResult] = useState<PropertyDiscoveryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selecting, setSelecting] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const controller = useRef<AbortController | null>(null);
  const requestId = useRef(0);
  const busy = useRef(false);
  const callbacks = useRef({ onChoose, onVerified });

  useEffect(() => { callbacks.current = { onChoose, onVerified }; }, [onChoose, onVerified]);

  useEffect(() => {
    requestId.current += 1;
    controller.current?.abort();
    busy.current = false;
    setResult(null);
    setLoading(false);
    setError('');
    setSelecting(null);
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
    if (!more) setResult(null);
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
      if (id !== requestId.current) return;
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

  async function chooseProperty(property: DiscoveredProperty) {
    if (busy.current || disabled) return;
    if (connectionError) { setError(connectionError); return; }
    if (projects.length >= 12) {
      setError('Your workspace has 12 projects. Remove one before adding another discovered property.');
      return;
    }
    busy.current = true;
    setSelecting(property.propertyId);
    setError('');
    setNotice('');
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const id = ++requestId.current;
    try {
      const response = await fetch('/api/property-website', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        signal: abort.signal,
        body: JSON.stringify({ credentials, propertyId: property.propertyId }),
      });
      const data = await response.json() as PropertyWebsiteResponse & { error?: string };
      if (id !== requestId.current) return;
      if (!response.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Could not read this property’s website. Try again or add the project manually.');
        return;
      }
      if (!Array.isArray(data.urls) || data.urls.some(url => typeof url !== 'string' || url.length > 2048 || !/^https?:\/\//i.test(url))) {
        throw new Error('Invalid property website response');
      }
      callbacks.current.onVerified();
      if (callbacks.current.onChoose(property, data.urls[0] ?? '')) {
        setNotice(data.urls.length > 1
          ? 'This property has multiple websites. The first web stream URL is prefilled; you can edit Site URL before saving.'
          : data.urls.length === 0 ? 'This property has no website URL in its web data streams. Enter Site URL manually before saving.' : '');
      }
    } catch {
      if (id === requestId.current && !abort.signal.aborted) setError('Could not read this property’s website. Check your connection and retry, or add the project manually.');
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
      <p className="hint">{!connectionError ? 'Find properties this key can access. Selecting one fills in its name, property ID and website URL.' : 'Paste the full service-account JSON, or enter both its email and private key, in Google Analytics.'}</p>
      {projects.length >= 12 && <p className="hint">Your workspace has 12 projects. Remove one before adding another discovered property.</p>}
      {loading && <p className="hint" role="status">Reading accessible properties from Google Analytics…</p>}
      {error && <p className="inline-error" role="alert">{error}</p>}
      {notice && <p className="hint" role="status">{notice}</p>}
      {result && <div className="discovered-properties">
        <p className="hint" role="status">{result.properties.length} {result.properties.length === 1 ? 'property' : 'properties'} found{result.nextPageToken ? ' so far. More results are available.' : '.'}</p>
        {!result.properties.length && !result.nextPageToken && <p className="hint">No accessible GA4 properties were returned. Add this service account as a Viewer in GA4 Property access management, then refresh. You can also add a property manually.</p>}
        <ul className="property-options">
          {result.properties.map(property => {
            const added = projects.some(project => project.propertyId === property.propertyId);
            return <li key={property.propertyId}>
              <div><strong>{property.name}</strong><span>{property.accountName} · {property.propertyId}</span></div>
              {added ? <span className="hint">Added</span> : <button className="text-button" type="button" disabled={disabled || loading || selecting !== null} aria-label={`Use ${property.name} (${property.propertyId})`} onClick={() => void chooseProperty(property)}>{selecting === property.propertyId ? 'Loading website…' : 'Use property'}<Icon name="arrow" /></button>}
            </li>;
          })}
        </ul>
        {result.nextPageToken && <button className="text-button" type="button" disabled={loading || disabled || selecting !== null} onClick={() => void findProperties(true)}>Load more properties</button>}
      </div>}
    </div>
  );
}
