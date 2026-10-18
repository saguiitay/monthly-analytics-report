import type {
  DashboardRequest, DashboardResponse, DashboardProjectReport, DashboardMetric,
  ServiceAccountCredentials, WorkspaceProject,
} from '../dashboard-types';

interface AnalyticsRow {
  dimensionValues?: { value?: string | null }[] | null;
  metricValues?: { value?: string | null }[] | null;
}

interface AnalyticsReport {
  rows?: AnalyticsRow[] | null;
}

export interface AnalyticsQuery {
  property: string;
  dateRanges: { startDate: string; endDate: string }[];
  metrics: { name: string }[];
  dimensions?: { name: string }[];
  orderBys?: { dimension?: { dimensionName: string }; metric?: { metricName: string }; desc?: boolean }[];
  limit: number;
}

export interface DashboardAnalyticsClient {
  batchRunReports(
    request: { property: string; requests: AnalyticsQuery[] },
    options: { timeout: number; retry: null },
  ): Promise<[{ reports?: AnalyticsReport[] | null }]>;
  close(): Promise<void>;
}

export type DashboardClientFactory = (credentials: ServiceAccountCredentials) =>
  DashboardAnalyticsClient | Promise<DashboardAnalyticsClient>;

async function createClient(credentials: ServiceAccountCredentials): Promise<DashboardAnalyticsClient> {
  const { BetaAnalyticsDataClient } = await import('@google-analytics/data');
  const client = new BetaAnalyticsDataClient({
    // Only these two credential fields reach Google Auth. Its OAuth token endpoint
    // is fixed by the SDK; caller-supplied token_uri / external-account URLs cannot enter.
    credentials: { client_email: credentials.client_email, private_key: credentials.private_key },
    apiEndpoint: 'analyticsdata.googleapis.com',
    universeDomain: 'googleapis.com',
    clientOptions: {
      transporterOptions: { timeout: 10_000, retry: false, retryConfig: { retry: 0 } },
    },
  });
  return {
    async batchRunReports(request, options) {
      const [response] = await client.batchRunReports(request, options);
      return [response];
    },
    close: () => client.close(),
  };
}

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function dashboardPeriods(endDate: string, days: number) {
  return {
    period: { startDate: shiftDate(endDate, 1 - days), endDate },
    previousPeriod: { startDate: shiftDate(endDate, 1 - 2 * days), endDate: shiftDate(endDate, -days) },
  };
}

export function dashboardMetric(current: number, previous: number): DashboardMetric {
  return {
    current,
    previous,
    percentageChange: previous === 0 ? (current === 0 ? 0 : null) : ((current - previous) / previous) * 100,
  };
}

function metric(row: AnalyticsRow | undefined, index: number): number {
  const raw = row?.metricValues?.[index]?.value;
  if (raw === undefined || raw === null || raw === '') return 0;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) throw new Error('Invalid analytics response');
  return value;
}

function dimension(row: AnalyticsRow, index: number, fallback: string): string {
  return row.dimensionValues?.[index]?.value?.slice(0, 2048) || fallback;
}

export function normalizeDashboardReports(
  project: WorkspaceProject, endDate: string, days: number, reports: AnalyticsReport[],
): DashboardProjectReport {
  if (reports.length !== 5 || reports.some(report => !report || typeof report !== 'object')) {
    throw new Error('Incomplete analytics response');
  }
  const [current, previous, dailyReport, channelsReport, pagesReport] = reports;
  const { period, previousPeriod } = dashboardPeriods(endDate, days);
  const dailyByDate = new Map<string, AnalyticsRow>();
  for (const row of dailyReport.rows ?? []) {
    const date = dimension(row, 0, '');
    if (/^\d{8}$/.test(date)) dailyByDate.set(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}`, row);
  }
  const daily = Array.from({ length: days }, (_, index) => {
    const date = shiftDate(period.startDate, index);
    const row = dailyByDate.get(date);
    return { date, pageViews: metric(row, 0), activeUsers: metric(row, 1) };
  });
  const comparison = (index: number) => dashboardMetric(metric(current.rows?.[0], index), metric(previous.rows?.[0], index));
  return {
    project, period, previousPeriod,
    metrics: {
      pageViews: comparison(0), activeUsers: comparison(1),
      sessions: comparison(2), engagementRate: comparison(3),
    },
    daily,
    channels: (channelsReport.rows ?? []).slice(0, 20).map(row => ({
      name: dimension(row, 0, '(not set)'), sessions: metric(row, 0),
    })),
    topPages: (pagesReport.rows ?? []).slice(0, 10).map(row => ({
      path: dimension(row, 0, '/'), title: dimension(row, 1, '(not set)'), pageViews: metric(row, 0),
    })),
  };
}

function queries(project: WorkspaceProject, endDate: string, days: number): AnalyticsQuery[] {
  const { period, previousPeriod } = dashboardPeriods(endDate, days);
  const property = `properties/${project.propertyId}`;
  const totals = ['screenPageViews', 'activeUsers', 'sessions', 'engagementRate'].map(name => ({ name }));
  const base = { property, dateRanges: [period] };
  return [
    { ...base, metrics: totals, limit: 1 },
    { ...base, dateRanges: [previousPeriod], metrics: totals, limit: 1 },
    {
      ...base, dimensions: [{ name: 'date' }], metrics: totals.slice(0, 2),
      orderBys: [{ dimension: { dimensionName: 'date' } }], limit: days,
    },
    {
      ...base, dimensions: [{ name: 'sessionDefaultChannelGroup' }], metrics: [{ name: 'sessions' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: 20,
    },
    {
      ...base, dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }], metrics: [{ name: 'screenPageViews' }],
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }], limit: 10,
    },
  ];
}

export function safeDashboardError(error: unknown): string {
  const value = error && typeof error === 'object' ? error as { code?: unknown; message?: unknown; details?: unknown } : {};
  const code = value.code;
  // Inspect only for classification. Never return or log provider text, which
  // may contain a private key, email, request metadata or token.
  const description = `${typeof value.message === 'string' ? value.message : ''} ${typeof value.details === 'string' ? value.details : ''}`.toLowerCase();
  if (/service_disabled|accessnotconfigured|has not been used|api.*disabled|enable.*analytics.*api/.test(description)) {
    return 'Enable the Google Analytics Data API in the service account’s Google Cloud project, then try again.';
  }
  if (code === 16 || code === 401 || /invalid_grant|invalid.*credential|invalid.*jwt|invalid.*signature|unauthenticated/.test(description)) {
    return 'The service account credentials were rejected. Use a current JSON key with its matching client_email and private_key.';
  }
  if (code === 7 || code === 403 || /permission_denied|permission denied|insufficient.*permission/.test(description)) {
    return 'Access denied. Add this service account as a Viewer in GA4 Property access management and check the numeric property ID.';
  }
  if (code === 8 || code === 429 || /quota|resource_exhausted/.test(description)) {
    return 'Google Analytics quota is temporarily exhausted. Wait a few minutes before trying again.';
  }
  if (code === 5 || code === 404) {
    return 'This GA4 property could not be found. Check its numeric property ID and the service account’s access.';
  }
  if (code === 4 || code === 14 || code === 504 || /deadline|timeout|timed out/.test(description)) {
    return 'Google Analytics did not respond in time. Please try again shortly.';
  }
  return 'Could not load this project from Google Analytics. Check the property ID, service account access and API availability, then retry.';
}

async function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject({ code: 4 }), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function generateDashboard(
  request: DashboardRequest,
  factory: DashboardClientFactory = createClient,
): Promise<DashboardResponse> {
  const result: DashboardResponse = { reports: [], errors: [], generatedAt: new Date().toISOString() };
  let client: DashboardAnalyticsClient | undefined;
  const deadline = Date.now() + 60_000;
  try {
    let abandoned = false;
    const creating = Promise.resolve().then(() => factory(request.credentials)).then(created => {
      if (abandoned) {
        void withTimeout(Promise.resolve().then(() => created.close()), 1_000).catch(() => {});
      }
      return created;
    });
    try {
      client = await withTimeout(creating, 15_000);
    } catch (error) {
      abandoned = true;
      throw error;
    }
    const outcomes: ({ report: DashboardProjectReport } | { message: string })[] = new Array(request.projects.length);
    let next = 0;
    let timedOut = false;
    const worker = async () => {
      while (next < request.projects.length) {
        const index = next++;
        const project = request.projects[index];
        try {
          const remaining = deadline - Date.now();
          if (remaining <= 0 || timedOut) throw { code: 4 };
          const timeout = Math.min(15_000, remaining);
          const [response] = await withTimeout(client!.batchRunReports({
            property: `properties/${project.propertyId}`,
            requests: queries(project, request.endDate, request.days),
          }, { timeout, retry: null }), timeout);
          outcomes[index] = {
            report: normalizeDashboardReports(project, request.endDate, request.days, response.reports ?? []),
          };
        } catch (error) {
          // Do not start additional RPCs after a timeout: an authentication or
          // transport operation might still be settling in the SDK.
          if (error && typeof error === 'object' && 'code' in error && error.code === 4) timedOut = true;
          outcomes[index] = { message: safeDashboardError(error) };
        }
      }
    };
    await Promise.all([worker(), worker()]);
    outcomes.forEach((outcome, index) => {
      if ('report' in outcome) result.reports.push(outcome.report);
      else result.errors.push({ project: request.projects[index], message: outcome.message });
    });
  } catch (error) {
    result.errors = request.projects.map(project => ({ project, message: safeDashboardError(error) }));
  } finally {
    if (client) await withTimeout(Promise.resolve().then(() => client!.close()), 1_000).catch(() => {});
  }
  result.generatedAt = new Date().toISOString();
  return result;
}
