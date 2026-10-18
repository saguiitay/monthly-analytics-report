import type { DashboardMetric, DashboardResponse, WorkspaceProject } from './dashboard-types';

const projects: WorkspaceProject[] = [
  { id: 'demo-fieldnotes', name: 'Fieldnotes', url: 'https://fieldnotes.example', propertyId: '100000001' },
  { id: 'demo-tinytools', name: 'Tiny tools', url: 'https://tinytools.example', propertyId: '100000002' },
];

function dateAt(endDate: string, offset: number): string {
  const date = new Date(`${endDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function metric(current: number, previous: number): DashboardMetric {
  return { current, previous, percentageChange: previous ? (current - previous) / previous * 100 : null };
}

export function createDemo(days: 7 | 30 | 90, endDate: string): DashboardResponse {
  return {
    generatedAt: `${endDate}T12:00:00.000Z`,
    errors: [],
    reports: projects.map((project, index) => {
      const daily = Array.from({ length: days }, (_, day) => {
        const pageViews = Math.round((index ? 150 : 330) + Math.sin(day * 0.66 + index) * 65 + day * (index ? -0.45 : 4.4) + (day % 7 === 2 ? 100 : 0));
        return { date: dateAt(endDate, day - days + 1), pageViews, activeUsers: Math.round(pageViews * 0.64) };
      });
      const pageViews = daily.reduce((total, day) => total + day.pageViews, 0);
      const sessions = Math.round(pageViews * 0.7);
      return {
        project,
        period: { startDate: dateAt(endDate, 1 - days), endDate },
        previousPeriod: { startDate: dateAt(endDate, 1 - days * 2), endDate: dateAt(endDate, -days) },
        metrics: {
          pageViews: metric(pageViews, Math.round(pageViews / (index ? 0.94 : 1.214))),
          activeUsers: metric(Math.round(pageViews * 0.43), Math.round(pageViews * (index ? 0.46 : 0.36))),
          sessions: metric(sessions, Math.round(sessions / (index ? 0.97 : 1.18))),
          engagementRate: metric(index ? 0.612 : 0.728, index ? 0.64 : 0.682),
        },
        daily,
        channels: [
          { name: 'Organic Search', sessions: Math.round(sessions * 0.48) },
          { name: 'Direct', sessions: Math.round(sessions * 0.28) },
          { name: 'Referral', sessions: Math.round(sessions * 0.16) },
          { name: 'Organic Social', sessions: sessions - Math.round(sessions * 0.48) - Math.round(sessions * 0.28) - Math.round(sessions * 0.16) },
        ],
        topPages: [
          { path: '/', title: index ? 'Small tools, useful things' : 'Fieldnotes — a place for ideas', pageViews: Math.round(pageViews * 0.34) },
          { path: index ? '/tools/color' : '/journal', title: index ? 'Color palette tool' : 'The journal', pageViews: Math.round(pageViews * 0.23) },
          { path: '/about', title: 'About the project', pageViews: Math.round(pageViews * 0.09) },
        ],
      };
    }),
  };
}
