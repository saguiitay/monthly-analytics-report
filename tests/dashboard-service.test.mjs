import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dashboardPeriods, dashboardMetric, normalizeDashboardReports, generateDashboard, safeDashboardError,
} from '../app/lib/services/dashboard.ts';

const project = { id: 'p1', name: 'Example', url: 'https://example.com', propertyId: '12345' };
const request = projects => ({
  projects, credentials: { client_email: 'x@example.com', private_key: 'test-only' },
  endDate: '2026-03-02', days: 7,
});
const row = (metrics, dimensions = []) => ({
  metricValues: metrics.map(value => ({ value: String(value) })),
  dimensionValues: dimensions.map(value => ({ value })),
});
const reports = () => [
  { rows: [row([100, 9, 20, 0.75])] },
  { rows: [row([50, 8, 10, 0.5])] },
  { rows: [row([40, 6], ['20260224']), row([60, 6], ['20260302'])] },
  { rows: [row([12], ['Organic Search']), row([8], ['Direct'])] },
  { rows: [row([70], ['/pricing', 'Pricing'])] },
];

test('inclusive periods are adjacent and exactly N days across year and leap boundaries', () => {
  for (const endDate of ['2026-01-02', '2024-03-01', '2026-03-02']) {
    for (const days of [7, 30, 90]) {
      const { period, previousPeriod } = dashboardPeriods(endDate, days);
      const date = value => Date.parse(`${value}T00:00:00Z`);
      assert.equal((date(period.endDate) - date(period.startDate)) / 86400000 + 1, days);
      assert.equal((date(previousPeriod.endDate) - date(previousPeriod.startDate)) / 86400000 + 1, days);
      assert.equal(date(period.startDate) - date(previousPeriod.endDate), 86400000);
    }
  }
  assert.deepEqual(dashboardPeriods('2026-03-02', 7), {
    period: { startDate: '2026-02-24', endDate: '2026-03-02' },
    previousPeriod: { startDate: '2026-02-17', endDate: '2026-02-23' },
  });
});

test('percentage change handles zero baselines without fabricated infinity', () => {
  assert.equal(dashboardMetric(12, 0).percentageChange, null);
  assert.equal(dashboardMetric(0, 0).percentageChange, 0);
  assert.equal(dashboardMetric(0, 12).percentageChange, -100);
  assert.equal(dashboardMetric(18, 12).percentageChange, 50);
});

test('preserves distinct range users, fractional engagement, real dates and missing-day zeros', () => {
  const result = normalizeDashboardReports(project, '2026-03-02', 7, reports());
  assert.equal(result.metrics.activeUsers.current, 9);
  assert.equal(result.daily.reduce((total, day) => total + day.activeUsers, 0), 12);
  assert.equal(result.metrics.engagementRate.current, 0.75);
  assert.equal(result.metrics.pageViews.percentageChange, 100);
  assert.equal(result.daily.length, 7);
  assert.deepEqual(result.daily[0], { date: '2026-02-24', pageViews: 40, activeUsers: 6 });
  assert.deepEqual(result.daily[1], { date: '2026-02-25', pageViews: 0, activeUsers: 0 });
  assert.equal(result.daily[6].pageViews, 60);
  assert.deepEqual(result.channels[0], { name: 'Organic Search', sessions: 12 });
  assert.deepEqual(result.topPages[0], { path: '/pricing', title: 'Pricing', pageViews: 70 });
});

test('legitimately missing rows normalize to zero, incomplete or invalid reports fail', () => {
  const result = normalizeDashboardReports(project, '2026-03-02', 7, [{}, {}, {}, {}, {}]);
  assert.equal(result.metrics.activeUsers.current, 0);
  assert.deepEqual(result.channels, []);
  assert.deepEqual(result.topPages, []);
  assert.ok(result.daily.every(day => day.pageViews === 0));
  assert.throws(() => normalizeDashboardReports(project, '2026-03-02', 7, []), /Incomplete/);
  const invalid = reports();
  invalid[0].rows[0].metricValues[0].value = 'NaN';
  assert.throws(() => normalizeDashboardReports(project, '2026-03-02', 7, invalid), /Invalid/);
});

test('uses one request-local client, five bounded queries, no totals dimensions and closes it', async () => {
  let closed = 0;
  let factories = 0;
  const input = request([project]);
  const factory = credentials => {
    factories++;
    assert.deepEqual(credentials, input.credentials);
    return {
      async batchRunReports(batch, options) {
        assert.equal(batch.property, 'properties/12345');
        assert.equal(batch.requests.length, 5);
        assert.equal(batch.requests[0].dimensions, undefined);
        assert.equal(batch.requests[1].dimensions, undefined);
        assert.equal(batch.requests[0].metrics[1].name, 'activeUsers');
        assert.equal(batch.requests[0].metrics[3].name, 'engagementRate');
        assert.deepEqual(batch.requests[2].dimensions, [{ name: 'date' }]);
        assert.equal(batch.requests[2].limit, 7);
        assert.equal(batch.requests[3].metrics[0].name, 'sessions');
        assert.ok(options.timeout > 0 && options.timeout <= 15000);
        assert.equal(options.retry, null);
        return [{ reports: reports() }];
      },
      async close() { closed++; },
    };
  };
  for (let i = 0; i < 2; i++) {
    const result = await generateDashboard(input, factory);
    assert.equal(result.reports.length, 1);
    assert.equal(result.errors.length, 0);
  }
  assert.equal(factories, 2);
  assert.equal(closed, 2);
});

test('bounds concurrent property calls and keeps ordered independent per-project failures', async () => {
  let active = 0;
  let maximum = 0;
  let closed = false;
  const projects = Array.from({ length: 8 }, (_, i) => ({ ...project, id: `p${i}`, propertyId: String(i + 1) }));
  const result = await generateDashboard(request(projects), () => ({
    async batchRunReports(batch) {
      active++;
      maximum = Math.max(maximum, active);
      await new Promise(resolve => setTimeout(resolve, 5));
      active--;
      if (batch.property === 'properties/2') throw { code: 7, message: 'sensitive provider text' };
      return [{ reports: reports() }];
    },
    async close() { closed = true; },
  }));
  assert.equal(maximum, 2);
  assert.equal(closed, true);
  assert.deepEqual(result.reports.map(report => report.project.id), ['p0', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7']);
  assert.equal(result.errors[0].project.id, 'p1');
  assert.match(result.errors[0].message, /Viewer/);
  assert.ok(!JSON.stringify(result).includes('sensitive'));
});

test('all failures return errors without fake reports and close even on provider failure', async () => {
  let closed = false;
  const result = await generateDashboard(request([project]), () => ({
    async batchRunReports() { throw { code: 16, message: 'private-key-secret' }; },
    async close() { closed = true; throw new Error('close-secret'); },
  }));
  assert.equal(closed, true);
  assert.deepEqual(result.reports, []);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].message, /credentials were rejected/);
  assert.ok(!JSON.stringify(result).includes('secret'));
  const initFailure = await generateDashboard(request([project]), () => { throw new Error('secret'); });
  assert.equal(initFailure.errors.length, 1);
  assert.deepEqual(initFailure.reports, []);
});

test('safe classifications are actionable and never echo provider content', () => {
  const cases = [
    [{ code: 403, message: 'SERVICE_DISABLED secret' }, /Enable the Google Analytics Data API/],
    [{ code: 401, message: 'secret' }, /credentials were rejected/],
    [{ message: 'invalid_grant secret' }, /credentials were rejected/],
    [{ code: 7, message: 'secret' }, /Viewer/],
    [{ code: 8, message: 'secret' }, /quota/],
    [{ code: 5, message: 'secret' }, /could not be found/],
    [{ code: 4, message: 'secret' }, /respond in time/],
    [new Error('secret'), /Could not load/],
  ];
  for (const [error, expected] of cases) {
    const message = safeDashboardError(error);
    assert.match(message, expected);
    assert.ok(!message.includes('secret'));
  }
});
