# Monthly

A bring-your-own-credentials analytics workspace for people managing multiple websites. Connect Google Analytics 4, configure projects in the browser, and compare performance without editing source code.

## What you get

- Add, edit, and remove projects with a website URL and GA4 property ID.
- Discover accessible GA4 properties using your loaded key, then prefill a project without looking up its ID.
- Compare 7, 30, or 90 days with the immediately preceding, equal-length period.
- View page views, active users, sessions, and engagement rate for each project.
- Explore daily traffic and acquisition-channel charts, plus top pages.
- Export reports as Markdown or JSON, or copy Markdown.
- Try a clearly labeled demo without Google credentials.
- Keep nonsecret project settings in local storage and credentials in this tab's session storage so refreshing preserves your connection.

Inspired by [Polypost](https://github.com/markrussinovich/Polypost)'s bring-your-own-key experience. Monthly is a server-backed application: unlike Polypost's browser-only editor, its Google API calls run on the Next.js server.

## Run locally

Requires Node.js 22.14 or later and npm.

```powershell
npm ci
npm run dev
```

Open http://localhost:3000. No environment variables are needed for the dashboard. Choose the demo to explore the interface, or connect your own GA4 account.

```powershell
npm test
npm run lint
npm run typecheck
npm run build
npm start
```

## Connect Google Analytics

**GA4 reporting does not use a Measurement Protocol API secret.** That secret sends events; it cannot read reports. Monthly needs a Google service-account JSON key and a numeric GA4 **property ID**, not a `G-...` measurement ID.

1. In [Google Cloud Console](https://console.cloud.google.com/), create or select a project and enable the **Google Analytics Data API**. Also enable the **Google Analytics Admin API** to discover properties automatically.
2. Create a service account under **IAM & Admin > Service Accounts**, then create a JSON key.
3. In GA4, open **Admin > Property access management** and add the service-account email as a **Viewer** for each property you want to report on.
4. In Monthly, import/paste the service-account JSON, or enter its email and private key.
5. Choose **Find GA4 properties**, select **Use property**, enter the website URL, and save. The name and property ID are prefilled. Alternatively, add projects manually using the numeric property ID from GA4's property settings.
6. Choose a period and generate your report.

Keys are hidden by default. Use **Show private key** / **Hide private key** to inspect the JSON or manual private-key field while editing. Switching entry methods, loading a new key, or clearing credentials hides the key again. Visibility is never saved.

Manual private keys support actual line breaks, literal `\n` sequences, and Windows CRLF line breaks. The original text is retained for editing and normalized before authentication. Manual entry needs **both** the private key and matching service-account email. Alternatively, paste the entire service-account JSON: discovery and reports can use it immediately, without clicking **Load pasted key** first. If an entry is incomplete, **Find GA4 properties** explains what is missing instead of staying disabled.

Property discovery remains available while editing a project. Save or cancel the current edit before selecting a discovered property so unfinished project details are not overwritten.

Use a dedicated, least-privilege service account. Never commit a key or paste it into a report. Revoke a compromised key in Google Cloud.

## Privacy and hosting

- Project names, URLs, and property IDs are saved in this browser's local storage. They are not synchronized between devices.
- Credential drafts are kept in this tab's **session storage**, including incomplete manual fields, pasted JSON, and the selected entry method. Refreshing restores what you entered; you do not need to load or validate a key first. They are not stored in persistent local storage, reports, or exports. **Clear & forget credentials** removes all saved entry fields and the in-memory key.
- Session storage is not an encrypted vault: scripts running on this origin can read it, as they can read an in-memory key. Use a trusted deployment/device. It is normally scoped to this tab, but browser session restore or duplicated tabs may retain a copy; explicitly clear credentials before leaving a shared device. Key visibility is not saved and resets to hidden on reload.
- Generating a report or finding properties transmits credentials to **the server hosting this application**, which uses them to authenticate with Google. Only use a deployment you operate or trust, and use HTTPS outside localhost.
- The dashboard does not fall back to the host's environment credentials. Requests have isolated Google clients, and credential-bearing requests and report responses are not cached.
- Google sees the property IDs, reporting queries, and service-account authentication required for its APIs.
- Reports remain in page memory unless you copy or download them. A report can contain sensitive business data; share exports deliberately.
- There is no account system, tenant database, billing, or server-side workspace persistence. This release is a self-hosted tool, **not a hardened public multi-tenant SaaS**. Restrict deployment access with your hosting provider or an authenticated reverse proxy. Add authentication, abuse controls/rate limiting, and an operational privacy policy before offering it publicly.

Deploy as a Node.js Next.js application, not a static export. Run `npm run build` and `npm start`, or use a Next.js-compatible hosting service. Do not configure request-body logging or caching for `/api/dashboard` or `/api/properties`.

## Property discovery

Discovery uses the read-only [Analytics Admin API `accountSummaries.list`](https://developers.google.com/analytics/devguides/config/admin/v1/rest/v1beta/accountSummaries/list). It lists GA4 properties visible to the supplied service account, not Google Cloud projects. The private key alone is insufficient: the matching service-account email is also required.

Discovered results stay in memory and are cleared when credentials change. Credentials themselves are kept in this tab's session storage across refreshes. **Load more properties** retrieves the next page of accounts without dropping earlier selections or creating duplicate projects. Selecting a property opens an editable project form; nothing is saved until you enter a site URL and choose **Save project**. The API does not provide a website URL in its property summaries, so Monthly does not guess one. Already-added properties are marked **Added**.

`POST /api/properties` accepts `{ "credentials": { "client_email": "...", "private_key": "..." }, "pageToken": "optional opaque token" }` and returns `{ "properties": [{ "propertyId": "12345", "name": "My website", "accountName": "My account" }], "nextPageToken": null }`. Supply a returned token to fetch the next page. It uses the same bounded JSON input, credential validation, same-origin checks, and no-store response policy as reporting. Invalid requests return a client error; Google failures return an actionable, credential-safe error and a non-success status. A disabled Admin API does not prevent manually configured Data API reporting.

## How to read the numbers

- Date ranges are inclusive: a 30-day report has exactly 30 calendar dates. The comparison period ends the day before the current period begins.
- Dates are interpreted in each GA4 property's reporting timezone. Today's data can be incomplete; Google processing delays also affect recent dates.
- Active users are fetched as a distinct count over the full period, not calculated by adding daily users. Users summed across different properties are **not deduplicated**.
- Engagement rate is the share of engaged sessions. Its relative percentage change is not a percentage-point change.
- A new metric with a zero comparison baseline is shown as **New**, not a fabricated growth percentage.
- Zero-filled chart dates represent dates with no returned activity. An API failure is displayed as an error, not zero traffic.
- Channel bars use session counts. GA4 privacy thresholds, sampling, and `(other)` aggregation can affect breakdowns; use GA4 for deeper investigation.
- Each project is independent: one inaccessible property does not hide successful reports for other projects.
- Search Console and Ahrefs are not required by the dashboard. It does not invent retention estimates or substitute demo data when a live request fails.

## Dashboard API

`POST /api/dashboard` accepts:

```json
{
  "projects": [
    {
      "id": "my-site",
      "name": "My website",
      "url": "https://example.com",
      "propertyId": "123456789"
    }
  ],
  "credentials": {
    "client_email": "viewer@example-project.iam.gserviceaccount.com",
    "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
  },
  "endDate": "2026-10-17",
  "days": 30
}
```

The request supports 1-12 projects and `days` of `7`, `30`, or `90`. The end date must be a real calendar date and not in the future. Browser requests must be same-origin.

Responses contain `reports`, per-project `errors`, and `generatedAt`. Each successful report includes the original project, both date ranges, current/previous metrics, daily traffic, channels, and top pages. Invalid requests return a client error. If every project fails, the response is non-successful and still includes the structured project errors. Provider error details and credentials are not returned.

See `app/lib/dashboard-types.ts` for the typed request and response contract.

## Legacy report API

The existing `POST /api/report` summary/detailed Markdown API remains available for existing integrations. It uses server environment variables `GOOGLE_CLIENT_EMAIL` and `GOOGLE_PRIVATE_KEY` and project fields `name`, `url`, `gaPropertyId`, `gscSiteUrl`, and `domain`. It also requires Google Search Console access. It is separate from the new UI connection and must not be exposed on an untrusted public deployment with privileged environment credentials.
