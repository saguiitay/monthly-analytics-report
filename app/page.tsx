'use client';

import { useState } from 'react';
import { ProjectConfig } from './lib/types';

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ markdown: string; html: string } | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    // Example project config
    const projects: ProjectConfig[] = [
      {
        name: 'ascii-images.com',
        url: 'https://ascii-images.com',
        gaPropertyId: '481852240',
        gscSiteUrl: 'sc-domain:ascii-images.com',
        domain: 'ascii-images.com'
      },
      //  {
      //   name: 'binge-waste.com',
      //   url: 'https://binge-waste.com',
      //   gaPropertyId: '440738598',
      //   gscSiteUrl: 'sc-domain:binge-waste.com',
      //   domain: 'binge-waste.com'
      // }
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
            <h3 className="text-xl font-semibold mb-2">Markdown</h3>
            <pre className="p-4 bg-gray-100 rounded overflow-x-auto">
              {result.markdown}
            </pre>
          </div>

          <div>
            <h3 className="text-xl font-semibold mb-2">HTML Preview</h3>
            <div
              className="p-4 bg-white border rounded"
              dangerouslySetInnerHTML={{ __html: result.html }}
            />
          </div>
        </div>
      )}
    </main>
  );
}
