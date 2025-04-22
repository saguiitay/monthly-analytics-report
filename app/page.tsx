'use client';

import { useState } from 'react';
import { ProjectConfig } from './lib/types';

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ markdown: string;  } | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    // Example project config
    const projects: ProjectConfig[] = [
      {
        name: 'Calculation Hub',
        url: 'https://calculation-hub.com/',
        gaPropertyId: '479179989',
        gscSiteUrl: 'sc-domain:calculation-hub.com',
        domain: 'calculation-hub.com'
      },
      {
        name: 'Rangom Generatr',
        url: 'https://randomgeneratr.com/',
        gaPropertyId: '405238687',
        gscSiteUrl: 'sc-domain:randomgeneratr.com',
        domain: 'randomgeneratr.com'
      },
      {
        name: 'Shibutz',
        url: 'https://shibutz.com/',
        gaPropertyId: '446114465',
        gscSiteUrl: 'sc-domain:shibutz.com',
        domain: 'shibutz.com'
      },
      {
        name: 'ASCII Art Generator',
        url: 'https://ascii-images.com',
        gaPropertyId: '481852240',
        gscSiteUrl: 'sc-domain:ascii-images.com',
        domain: 'ascii-images.com'
      },
      {
        name: 'Peronality Tests',
        url: 'https://personal-tests.com/',
        gaPropertyId: '481852240',
        gscSiteUrl: 'sc-domain:personal-tests.com',
        domain: 'personal-tests.com'
      },
      {
        name: 'Binge Waste',
        url: 'https://binge-waste.com',
        gaPropertyId: '440738598',
        gscSiteUrl: 'sc-domain:binge-waste.com',
        domain: 'binge-waste.com'
      },
    ];

    try {
      const response = await fetch('/api/report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projects,
          title: 'Monthly Analytics Report'
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to generate report');
      }

      const data = await response.json();
      setResult(data);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen p-8">
      <h1 className="text-3xl font-bold mb-8">
        Monthly Analytics Report Generator
      </h1>

      <form onSubmit={handleSubmit} className="mb-8">
        <button
          type="submit"
          disabled={loading}
          className={`px-4 py-2 bg-blue-500 text-white rounded ${
            loading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-600'
          }`}
        >
          {loading ? 'Generating...' : 'Generate Report'}
        </button>
      </form>

      {error && (
        <div className="p-4 mb-8 bg-red-100 text-red-700 rounded">
          <h3 className="font-bold mb-2">Error Generating Report</h3>
          <p className="mb-4">{error}</p>
          <div className="text-sm">
            <p className="mb-2">Please verify:</p>
            <ul className="list-disc list-inside">
              <li>Google Analytics Data API is enabled in your Google Cloud Console</li>
              <li>Search Console API is enabled and the service account has access</li>
              <li>Service account credentials are correctly formatted in .env.local</li>
              <li>Ahrefs API token is valid</li>
              <li>Project configuration (propertyId, siteUrl, domain) is correct</li>
            </ul>
          </div>
        </div>
      )}

      {result && (
        <div>
          <h2 className="text-2xl font-bold mb-4">Report Generated</h2>
          
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xl font-semibold">Markdown</h3>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(result.markdown);
                  setCopySuccess(true);
                  setTimeout(() => setCopySuccess(false), 2000);
                }}
                className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded flex items-center gap-2 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                {copySuccess ? 'Copied!' : 'Copy Text'}
              </button>
            </div>
            <pre className="p-4 bg-gray-100 rounded overflow-x-auto">
              {result.markdown}
            </pre>
          </div>
        </div>
      )}
    </main>
  );
}
