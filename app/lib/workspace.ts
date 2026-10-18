import type { DashboardProjectReport, DashboardResponse, WorkspaceProject } from './dashboard-types';

export const WORKSPACE_KEY = 'monthly.workspace.v1';
const VERSION = 1;

export function validateProject(project: WorkspaceProject): string | null {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(project.id)) return 'Use a valid project identifier.';
  if (!project.name.trim() || project.name.length > 100 || /[\u0000-\u001f\u007f]/u.test(project.name)) return 'Give your project a name of 1–100 characters without control characters.';
  if (!/^[1-9]\d{0,19}$/.test(project.propertyId)) return 'Use the numeric GA4 property ID (up to 20 digits), not a measurement ID.';
  if (project.url === '') return null;
  try {
    const url = new URL(project.url);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || !url.hostname ||
      /[\\\s]/u.test(project.url) || /^[a-z]+:\/\/[^/]*@/i.test(project.url)) {
      return 'Use a full http or https site URL without a username or password.';
    }
    if (project.url.length > 2048) return 'Use a site URL shorter than 2,048 characters.';
  } catch {
    return 'Use a full site URL, such as https://example.com.';
  }
  return null;
}

export function projectSettings(project: WorkspaceProject): WorkspaceProject {
  return { id: project.id, name: project.name.trim(), url: project.url.trim(), propertyId: project.propertyId.trim() };
}

export function validateProjectBatch(projects: WorkspaceProject[], drafts: WorkspaceProject[]): string | null {
  if (!drafts.length) return 'Select at least one property to add.';
  if (projects.length + drafts.length > 12) return 'Your workspace supports up to 12 projects. Remove a project or select fewer properties.';
  const ids = new Set(projects.map(project => project.id));
  const propertyIds = new Set(projects.map(project => project.propertyId));
  for (const draft of drafts) {
    const error = validateProject(draft);
    if (error) return `${draft.name.trim() || 'Project'}: ${error}`;
    if (ids.has(draft.id)) return 'Project identifiers must be unique.';
    if (propertyIds.has(draft.propertyId)) return `GA4 property ${draft.propertyId} is already in your workspace or selected more than once.`;
    ids.add(draft.id);
    propertyIds.add(draft.propertyId);
  }
  return null;
}

export function readWorkspace(storage: Pick<Storage, 'getItem'>): WorkspaceProject[] {
  const raw = storage.getItem(WORKSPACE_KEY);
  if (raw === null) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || !('version' in parsed) || parsed.version !== VERSION ||
    !('projects' in parsed) || !Array.isArray(parsed.projects) || parsed.projects.length > 12) {
    throw new Error('Invalid workspace');
  }
  const ids = new Set<string>();
  return parsed.projects.map((value: unknown) => {
    if (!value || typeof value !== 'object') throw new Error('Invalid project');
    const project = value as WorkspaceProject;
    if (typeof project.id !== 'string' ||
      typeof project.name !== 'string' || typeof project.url !== 'string' || typeof project.propertyId !== 'string' ||
      validateProject(project) || ids.has(project.id)) throw new Error('Invalid project');
    ids.add(project.id);
    return projectSettings(project);
  });
}

export function saveWorkspace(storage: Pick<Storage, 'setItem'>, projects: WorkspaceProject[]): void {
  storage.setItem(WORKSPACE_KEY, JSON.stringify({ version: VERSION, projects: projects.map(projectSettings) }));
}

export const number = (value: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
export const percent = (value: number) => `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value * 100)}%`;
export const delta = (value: number | null) => value === null ? 'New' : `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;

export function takeaway(report: DashboardProjectReport): string {
  const { pageViews, sessions, engagementRate } = report.metrics;
  if (pageViews.current === 0 && sessions.current === 0) return 'No traffic was recorded in this period. Check the property and date range before drawing conclusions.';
  if (pageViews.percentageChange === null) return 'Traffic is appearing against a zero baseline. Treat this as a starting point, not a growth trend.';
  if (pageViews.percentageChange === 0) return 'Pageviews are unchanged from the previous period. Compare the daily pattern and channel mix for changes beneath the total.';
  const direction = pageViews.percentageChange > 0 ? 'up' : 'down';
  const engagement = engagementRate.current > engagementRate.previous
    ? 'Engagement rate also increased.'
    : engagementRate.current < engagementRate.previous ? 'Engagement rate decreased.' : 'Engagement rate held steady.';
  return `Pageviews are ${direction} ${Math.abs(pageViews.percentageChange).toFixed(1)}% versus the previous period. ${engagement} These numbers show direction, not the cause.`;
}

function safeMarkdown(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').replace(/[\\`*_{}[\]()<>#|!]/g, '\\$&');
}

// Export only report fields: never request state or credentials.
export function exportData(response: DashboardResponse, demo: boolean) {
  return {
    source: demo ? 'Deterministic synthetic demo' : 'Google Analytics 4',
    generatedAt: response.generatedAt,
    reports: response.reports.map(report => ({
      project: projectSettings(report.project),
      period: report.period,
      previousPeriod: report.previousPeriod,
      metrics: report.metrics,
      daily: report.daily,
      channels: report.channels,
      topPages: report.topPages,
    })),
    failedProjects: response.errors.map(error => ({ project: projectSettings(error.project), message: 'Report unavailable. Check property access and try again.' })),
  };
}

export function reportMarkdown(response: DashboardResponse, demo: boolean): string {
  const lines = ['# Monthly — traffic report', '', demo ? '> DEMO: deterministic synthetic data. Not real analytics.' : 'Source: Google Analytics 4.', '',
    `Generated: ${response.generatedAt}`, '', 'Users are unique within each property; totals across properties are not deduplicated.', ''];
  for (const report of response.reports) {
    lines.push(`## ${safeMarkdown(report.project.name)}`, '', `${report.period.startDate} – ${report.period.endDate}`,
      `Previous: ${report.previousPeriod.startDate} – ${report.previousPeriod.endDate}`, '', '| Metric | Current | Previous | Change |', '| --- | ---: | ---: | ---: |');
    for (const [key, label] of [['pageViews', 'Pageviews'], ['activeUsers', 'Users'], ['sessions', 'Sessions'], ['engagementRate', 'Engagement rate']] as const) {
      const metric = report.metrics[key];
      const format = key === 'engagementRate' ? percent : number;
      lines.push(`| ${label} | ${format(metric.current)} | ${format(metric.previous)} | ${delta(metric.percentageChange)} |`);
    }
    lines.push('', takeaway(report), '', '### Daily traffic', '', '| Date | Pageviews | Active users |', '| --- | ---: | ---: |');
    report.daily.forEach(day => lines.push(`| ${day.date} | ${number(day.pageViews)} | ${number(day.activeUsers)} |`));
    lines.push('', '### Channels', '', '| Channel | Sessions |', '| --- | ---: |');
    report.channels.forEach(channel => lines.push(`| ${safeMarkdown(channel.name)} | ${number(channel.sessions)} |`));
    lines.push('', '### Top pages', '', '| Page | Title | Pageviews |', '| --- | --- | ---: |');
    report.topPages.forEach(page => lines.push(`| ${safeMarkdown(page.path)} | ${safeMarkdown(page.title)} | ${number(page.pageViews)} |`));
    lines.push('');
  }
  if (response.errors.length) {
    lines.push('## Unavailable projects', '');
    response.errors.forEach(error => lines.push(`- ${safeMarkdown(error.project.name)}: Check property access and try again.`));
  }
  return lines.join('\n');
}
