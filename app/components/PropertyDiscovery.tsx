'use client';

import { useEffect, useRef, useState } from 'react';
import type { DiscoveredProperty, PropertyDiscoveryResponse, ServiceAccountCredentials, WorkspaceProject } from '../lib/dashboard-types';

export default function PropertyDiscovery({ credentials, projects, connectionError, disabled, selectionDisabled, onChoose }: {
  credentials: ServiceAccountCredentials;
  projects: WorkspaceProject[];
  connectionError: string | null;
  disabled: boolean;
  selectionDisabled: boolean;
  onChoose: (property: DiscoveredProperty) => void;
}) {
  const [result, setResult] = useState<PropertyDiscoveryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  const requestId = useRef(0);
  const busy = useRef(false);

  useEffect(() => {
    requestId.current += 1;
    controller.current?.abort();
    busy.current = false;
    setResult(null);
    setLoading(false);
    setError('');
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
    } catch {
      if (id === requestId.current && !abort.signal.aborted) setError('Could not reach property discovery. Check your connection, then try again.');
    } finally {
      if (id === requestId.current) {
        busy.current = false;
        setLoading(false);
      }
    }
  }

  return (
    <div className="property-discovery">
      <button type="button" className="button secondary small" disabled={disabled || loading} onClick={() => void findProperties()}>
        {loading ? 'Finding GA4 properties…' : result ? 'Refresh GA4 properties' : 'Find GA4 properties'}
      </button>
      <p className="hint">{!connectionError ? 'Find properties this key can access. Select one, then enter its site URL.' : 'Paste the full service-account JSON, or enter both its email and private key, in Google Analytics.'}</p>
      {selectionDisabled && <p className="hint">You can find properties while editing. Save or cancel your current project before selecting another property.</p>}
      {projects.length >= 12 && <p className="hint">Your workspace has 12 projects. Remove one before adding another discovered property.</p>}
      {loading && <p className="hint" role="status">Reading accessible properties from Google Analytics…</p>}
      {error && <p className="inline-error" role="alert">{error}</p>}
      {result && <div className="discovered-properties">
        <p className="hint" role="status">{result.properties.length} {result.properties.length === 1 ? 'property' : 'properties'} found{result.nextPageToken ? ' so far. More results are available.' : '.'}</p>
        {!result.properties.length && !result.nextPageToken && <p className="hint">No accessible GA4 properties were returned. Add this service account as a Viewer in GA4 Property access management, then refresh. You can also add a property manually.</p>}
        <ul className="property-options">
          {result.properties.map(property => {
            const added = projects.some(project => project.propertyId === property.propertyId);
            return <li key={property.propertyId}>
              <div><strong>{property.name}</strong><span>{property.accountName} · {property.propertyId}</span></div>
              {added ? <span className="hint">Added</span> : <button className="text-button" type="button" disabled={disabled || selectionDisabled || projects.length >= 12} aria-label={`Use ${property.name} (${property.propertyId})`} onClick={() => onChoose(property)}>Use property</button>}
            </li>;
          })}
        </ul>
        {result.nextPageToken && <button className="text-button" type="button" disabled={loading || disabled} onClick={() => void findProperties(true)}>Load more properties</button>}
      </div>}
    </div>
  );
}
