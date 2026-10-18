import { useId } from 'react';
import type { DashboardProjectReport } from '../lib/dashboard-types';
import { delta, number, percent, takeaway } from '../lib/workspace';
import Icon from './Icon';

function shortDate(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export default function ProjectReport({ report, index }: { report: DashboardProjectReport; index: number }) {
  const chartId = useId();
  const { daily, channels } = report;
  const maximum = Math.max(1, ...daily.map(day => day.pageViews));
  const points = daily.map((day, i) => `${16 + (i / Math.max(1, daily.length - 1)) * 568},${160 - day.pageViews / maximum * 130}`);
  const line = points.length === 1 ? `16,${160 - daily[0].pageViews / maximum * 130} 584,${160 - daily[0].pageViews / maximum * 130}` : points.join(' ');
  const channelMaximum = Math.max(1, ...channels.map(channel => channel.sessions));
  const allZero = daily.length > 0 && daily.every(day => day.pageViews === 0);

  return (
    <article className="project-report" aria-labelledby={`${chartId}-heading`}>
      <header className="project-report-header">
        <div className="project-identity">
          <span className={`project-avatar tone-${index % 2}`} aria-hidden="true">{report.project.name.slice(0, 1).toUpperCase()}</span>
          <div><h2 id={`${chartId}-heading`}>{report.project.name}</h2><p className="site-address">{report.project.url}</p></div>
        </div>
        <span className="period-tag">{shortDate(report.period.startDate)} – {shortDate(report.period.endDate)}</span>
      </header>
      <div className="metrics-grid">
        {([['pageViews', 'Pageviews'], ['activeUsers', 'Users'], ['sessions', 'Sessions'], ['engagementRate', 'Engagement rate']] as const).map(([key, label]) => {
          const metric = report.metrics[key];
          return <div className="metric" key={key}>
            <p className="metric-label">{label}</p>
            <div className="metric-line"><strong>{key === 'engagementRate' ? percent(metric.current) : number(metric.current)}</strong>
              <span className={`delta ${metric.percentageChange === null || metric.percentageChange === 0 ? 'neutral' : metric.percentageChange > 0 ? 'positive' : 'negative'}`}>
                {delta(metric.percentageChange)}<span className="sr-only"> versus the previous period</span>
              </span></div>
            <p className="metric-baseline">from {key === 'engagementRate' ? percent(metric.previous) : number(metric.previous)}</p>
          </div>;
        })}
      </div>
      <div className="charts-grid">
        <section className="fingerprint" aria-labelledby={`${chartId}-traffic`}>
          <div className="chart-heading"><h3 id={`${chartId}-traffic`}>Traffic fingerprint</h3><span><i className="legend-dot" /> Daily pageviews</span></div>
          {daily.length ? <>
            <svg className="traffic-chart" viewBox="0 0 600 170" preserveAspectRatio="none" role="img" aria-labelledby={`${chartId}-title ${chartId}-description`}>
              <title id={`${chartId}-title`}>{report.project.name}: daily pageviews</title>
              <desc id={`${chartId}-description`}>{daily.length} days, from {daily[0].date} to {daily[daily.length - 1].date}. Maximum {number(Math.max(0, ...daily.map(day => day.pageViews)))} pageviews. Exact values are available in the daily data disclosure below.</desc>
              {[30, 95, 160].map(y => <line key={y} x1="16" x2="584" y1={y} y2={y} className="chart-gridline" />)}
              <polygon points={`16,160 ${line} 584,160`} className="chart-area" />
              <polyline points={line} className="chart-line" />
              {daily.length > 1 && <circle cx="584" cy={160 - daily[daily.length - 1].pageViews / maximum * 130} r="4" className="chart-endpoint" />}
            </svg>
            <div className="chart-endpoints" aria-hidden="true"><span>{shortDate(daily[0].date)}</span><span>{shortDate(daily[daily.length - 1].date)}</span></div>
            {allZero && <p className="chart-empty">No pageviews recorded during this period.</p>}
          </> : <p className="chart-empty">No daily data returned for this period.</p>}
          <details className="data-disclosure"><summary><Icon name="chevron" />View daily data</summary>
            <div className="table-scroll"><table><caption className="sr-only">Daily traffic for {report.project.name}</caption><thead><tr><th>Date</th><th>Pageviews</th><th>Active users</th></tr></thead>
              <tbody>{daily.map(day => <tr key={day.date}><td>{day.date}</td><td>{number(day.pageViews)}</td><td>{number(day.activeUsers)}</td></tr>)}</tbody></table></div>
            <p className="hint">Daily active users are not additive. The Users card uses GA4’s unique users for the full period.</p>
          </details>
        </section>
        <section className="channels" aria-labelledby={`${chartId}-channels`}>
          <div className="chart-heading"><h3 id={`${chartId}-channels`}>Where visits begin</h3><span>Sessions</span></div>
          {channels.length ? <ul className="channel-list">{channels.map((channel, i) => <li key={`${channel.name}-${i}`}>
            <div><span>{channel.name}</span><strong>{number(channel.sessions)}</strong></div>
            <div className="channel-track" aria-hidden="true"><span style={{ width: `${channel.sessions / channelMaximum * 100}%` }} /></div>
          </li>)}</ul> : <p className="chart-empty">No channel sessions recorded.</p>}
        </section>
      </div>
      <div className="takeaway"><span aria-hidden="true">↳</span><p>{takeaway(report)}</p></div>
      <details className="top-pages">
        <summary><Icon name="chevron" />Top pages <span className="hint">by pageviews</span></summary>
        {report.topPages.length ? <div className="table-scroll"><table><caption className="sr-only">Top pages for {report.project.name}</caption>
          <thead><tr><th>Page</th><th>Title</th><th>Pageviews</th></tr></thead>
          <tbody>{report.topPages.map((page, i) => <tr key={`${page.path}-${i}`}><td className="page-path">{page.path}</td><td>{page.title || 'Untitled page'}</td><td>{number(page.pageViews)}</td></tr>)}</tbody>
        </table></div> : <p className="chart-empty">No pageviews recorded for individual pages.</p>}
      </details>
      <footer className="comparison-period">Compared with {report.previousPeriod.startDate} – {report.previousPeriod.endDate}. Change is relative to the previous period; “New” means a zero baseline.</footer>
    </article>
  );
}
