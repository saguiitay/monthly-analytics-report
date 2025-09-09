import { ProjectReport, DetailedProjectReport } from '../types';

export class ReportFormatter {
  /**
   * Format a single project's metrics as a Markdown table
   */
  private static formatChange(change: number): string {
    const sign = change > 0 ? '+' : '';
    return `${sign}${change.toFixed(1)}%`;
  }

  /**
   * Calculate percentage change between current and previous values
   */
  private static calculateChange(current: number, previous: number): number {
    if (previous === 0) return current === 0 ? 0 : 100;
    return ((current - previous) / previous) * 100;
  }

  /**
   * Format change with value comparison
   */
  private static formatValueWithChange(current: number, previous?: number, suffix: string = ''): string {
    if (previous === undefined) {
      return `${current.toLocaleString()}${suffix}`;
    }
    const change = this.calculateChange(current, previous);
    const changeStr = this.formatChange(change);
    const arrow = change > 0 ? '↗️' : change < 0 ? '↘️' : '➡️';
    return `${current.toLocaleString()}${suffix} (${changeStr} ${arrow} from ${previous.toLocaleString()}${suffix})`;
  }

  private static formatProjectTable(report: ProjectReport): string {
    const { metrics } = report;
    
    return `| Stat | Current | Previous | Change |
|:------|--------:|---------:|--------:|
| Google Analytics Page Views | ${metrics.pageViews.current.toLocaleString()} | ${metrics.pageViews.previous.toLocaleString()} | ${this.formatChange(metrics.pageViews.percentageChange)} |
| Google Analytics User Engagement Events | ${metrics.engagementEvents.current.toLocaleString()} | ${metrics.engagementEvents.previous.toLocaleString()} | ${this.formatChange(metrics.engagementEvents.percentageChange)} |
| Google Total Impressions | ${metrics.totalImpressions.current.toLocaleString()} | ${metrics.totalImpressions.previous.toLocaleString()} | ${this.formatChange(metrics.totalImpressions.percentageChange)} |
| Google Total Clicks | ${metrics.totalClicks.current.toLocaleString()} | ${metrics.totalClicks.previous.toLocaleString()} | ${this.formatChange(metrics.totalClicks.percentageChange)} |
`;
  }

// | Google Indexed Pages | ${metrics.indexedPages.toLocaleString()} | - | - |
// | Ahrefs Domain Rating (DR) | - | - | - |

  /**
   * Generate a complete Markdown report for a project
   */
  private static formatProjectReport(report: ProjectReport): string {
    const { project } = report;
    
    return `## ${project.name}

Visit website: [${project.name}](${project.url})

<changes here>

### Statistics

${ReportFormatter.formatProjectTable(report)}
`;
  }

  /**
   * Generate a detailed Markdown report for a project
   */
  private static formatDetailedProjectReport(report: DetailedProjectReport): string {
    const { project, metrics, period } = report;
    
    let markdown = `## ${project.name}

Visit website: [${project.name}](${project.url})

`;

    // Traffic & Engagement section
    markdown += `### Traffic & Engagement *(${period.startDate} - ${period.endDate})*
- **Active Users**: ${this.formatValueWithChange(metrics.traffic.activeUsers, metrics.traffic.previousActiveUsers)} total users
- **User Retention**: ${metrics.traffic.userRetention.day1.toFixed(2)}% day-1 retention${metrics.traffic.previousUserRetention ? ` (${this.formatChange(this.calculateChange(metrics.traffic.userRetention.day1, metrics.traffic.previousUserRetention.day1))})` : ''}, ${metrics.traffic.userRetention.day7.toFixed(2)}% day-7 retention${metrics.traffic.previousUserRetention ? ` (${this.formatChange(this.calculateChange(metrics.traffic.userRetention.day7, metrics.traffic.previousUserRetention.day7))})` : ''}${metrics.traffic.userRetention.day7 === 0 ? ' (critical issue)' : ''}
- **Traffic Sources**: 
${metrics.traffic.trafficSources.map(source => {
      const prevSource = metrics.traffic.previousTrafficSources?.find(p => p.source === source.source);
      const changeStr = prevSource ? ` (${this.formatChange(this.calculateChange(source.users, prevSource.users))})` : '';
      return `  - ${source.source}: ${source.users.toLocaleString()} users (${source.percentage.toFixed(0)}%)${changeStr}`;
    }).join('\n')}
- **Geographic Distribution**:
${metrics.traffic.geographicDistribution.slice(0, 5).map(geo => {
      const prevGeo = metrics.traffic.previousGeographicDistribution?.find(p => p.country === geo.country);
      const changeStr = prevGeo ? ` (${this.formatChange(this.calculateChange(geo.users, prevGeo.users))})` : '';
      return `  - ${geo.country}: ${geo.users.toLocaleString()} users (${geo.percentage.toFixed(0)}%)${changeStr}`;
    }).join('\n')}${metrics.traffic.geographicDistribution.length > 5 ? 
      `\n  - Other: ${metrics.traffic.geographicDistribution.slice(5).reduce((sum, geo) => sum + geo.users, 0).toLocaleString()} users (${metrics.traffic.geographicDistribution.slice(5).reduce((sum, geo) => sum + geo.percentage, 0).toFixed(0)}%)` : ''}

`;

    // Critical Search Performance Issues section
    const avgDesktopPos = metrics.search.averagePosition.desktop;
    const avgMobilePos = metrics.search.averagePosition.mobile;
    const ctr = metrics.search.clickThroughRate;
    
    markdown += `### Critical Search Performance Issues *(Last 28 Days)*
- **Average Search Position**: ${avgDesktopPos.toFixed(2)} (Desktop)${metrics.search.previousAveragePosition ? ` (${this.formatChange(this.calculateChange(avgDesktopPos, metrics.search.previousAveragePosition.desktop))})` : ''}, ${avgMobilePos.toFixed(2)} (Mobile)${metrics.search.previousAveragePosition ? ` (${this.formatChange(this.calculateChange(avgMobilePos, metrics.search.previousAveragePosition.mobile))})` : ''}${(avgDesktopPos > 80 || avgMobilePos > 80) ? ' - **URGENT**' : ''}
- **Click-Through Rate**: ${ctr.toFixed(2)}%${metrics.search.previousClickThroughRate ? ` (${this.formatChange(this.calculateChange(ctr, metrics.search.previousClickThroughRate))})` : ''}${ctr < 2 ? ' - **CRITICAL**' : ''}
- **Search Clicks**: ${metrics.search.totalClicks.toLocaleString()}${metrics.search.previousTotalClicks ? ` (${this.formatChange(this.calculateChange(metrics.search.totalClicks, metrics.search.previousTotalClicks))})` : ''} clicks
- **Search Impressions**: ${metrics.search.totalImpressions.toLocaleString()}${metrics.search.previousTotalImpressions ? ` (${this.formatChange(this.calculateChange(metrics.search.totalImpressions, metrics.search.previousTotalImpressions))})` : ''} impressions${metrics.search.totalImpressions < 1000 ? ' (very low visibility)' : ''}
${metrics.search.topQueries.length > 0 ? `- **Top Performing Query**: "${metrics.search.topQueries[0].query}" (${metrics.search.topQueries[0].clicks} click${metrics.search.topQueries[0].clicks !== 1 ? 's' : ''}, ${metrics.search.topQueries[0].ctr.toFixed(0)}% CTR, position ${metrics.search.topQueries[0].position.toFixed(0)})` : ''}

`;

    // Page Performance Analysis section
    markdown += `### Page Performance Analysis
`;

    if (metrics.pagePerformance.topViewedPages.length > 0) {
      markdown += `**Pages Receiving Views**:
${metrics.pagePerformance.topViewedPages.map(page => {
        const urlDisplay = page.url ? ` (${page.url})` : '';
        const prevPage = metrics.pagePerformance.previousTopViewedPages?.find(p => p.page === page.page || p.url === page.url);
        const changeStr = prevPage ? ` (${this.formatChange(this.calculateChange(page.views, prevPage.views))})` : '';
        return `- ${page.page}${urlDisplay}: ${page.views.toLocaleString()} views${changeStr}`;
      }).join('\n')}

`;
    }

    if (metrics.pagePerformance.topSearchPages.length > 0) {
      markdown += `**Search Console Top Pages** *(Impressions)*:
${metrics.pagePerformance.topSearchPages.map(page => {
        const urlDisplay = page.url ? ` (${page.url})` : '';
        const prevPage = metrics.pagePerformance.previousTopSearchPages?.find(p => p.page === page.page || p.url === page.url);
        const impChange = prevPage?.impressions ? ` (${this.formatChange(this.calculateChange(page.impressions || 0, prevPage.impressions))})` : '';
        const clickChange = prevPage?.clicks ? ` (${this.formatChange(this.calculateChange(page.clicks || 0, prevPage.clicks))})` : '';
        return `- ${page.page}${urlDisplay}: ${page.impressions?.toLocaleString() || 0} impressions${impChange}, ${page.clicks?.toLocaleString() || 0} click${(page.clicks || 0) !== 1 ? 's' : ''}${clickChange}`;
      }).join('\n')}

`;
    }

    // Search Console Top Queries section
    if (metrics.search.topQueries.length > 0) {
      markdown += `**Search Console Top Queries**:
${metrics.search.topQueries.map(query => 
        `- "${query.query}": ${query.impressions.toLocaleString()} impressions, ${query.clicks} click${query.clicks !== 1 ? 's' : ''} (${query.ctr.toFixed(1)}% CTR, avg position ${query.position.toFixed(0)})`
      ).join('\n')}

`;
    }

    // User Engagement Patterns section
    if (metrics.userEngagement.peakEngagementDays.length > 0 || metrics.userEngagement.averageEngagementTime > 0) {
      markdown += `### User Engagement Patterns
`;
      
      if (metrics.userEngagement.peakEngagementDays.length > 0) {
        const peakDays = metrics.userEngagement.peakEngagementDays.slice(0, 2).map(date => {
          const d = new Date(date);
          return d.getDate();
        }).join('-');
        markdown += `- **Peak Engagement**: Days ${peakDays} with ${Math.round(metrics.userEngagement.sessionQuality.max)}+ second average engagement time\n`;
      }
      
      markdown += `- **Platform**: 100% web traffic
- **Session Quality**: Highly variable (${Math.round(metrics.userEngagement.sessionQuality.min)}-${Math.round(metrics.userEngagement.sessionQuality.max)} seconds average engagement)
`;

      if (metrics.traffic.geographicDistribution.length > 0) {
        const topCountries = metrics.traffic.geographicDistribution.slice(0, 3).map(geo => geo.country).join(', ');
        markdown += `- **Geographic Performance**: Strong in ${topCountries} markets
`;
      }

      markdown += '\n';
    }

    // Events section
    if (metrics.events.length > 0) {
      markdown += `### Top Events
${metrics.events.map(event => {
        const prevEvent = metrics.previousEvents?.find(p => p.eventName === event.eventName);
        const changeStr = prevEvent ? ` (${this.formatChange(this.calculateChange(event.eventCount, prevEvent.eventCount))})` : '';
        return `- **${event.eventName}**: ${event.eventCount.toLocaleString()} events (${event.percentage.toFixed(1)}%)${changeStr}`;
      }).join('\n')}

`;
    }

    // Strategic Problems section
    if (metrics.strategicProblems.length > 0) {
      markdown += `### Strategic Issues
${metrics.strategicProblems.map(problem => `- **Problem**: ${problem}`).join('\n')}

`;
    }

    return markdown;
  }

  /**
   * Generate a complete Markdown report for multiple projects
   */
  static formatReport(reports: ProjectReport[]): string {    
    const markdownReport = `
Period: ${reports[0].period.startDate} to ${reports[0].period.endDate}

${reports.map(report => ReportFormatter.formatProjectReport(report)).join('\n\n')}
`;

    return markdownReport;
  }

  /**
   * Generate detailed Markdown reports for multiple projects
   */
  static formatDetailedReport(reports: DetailedProjectReport[]): string {    
    const markdownReport = `# Detailed Analytics Report

Period: ${reports[0].period.startDate} to ${reports[0].period.endDate}

${reports.map(report => ReportFormatter.formatDetailedProjectReport(report)).join('\n---\n\n')}
`;

    return markdownReport;
  }

  /**
   * Analyze metrics and identify strategic problems
   */
  static identifyStrategicProblems(metrics: any): string[] {
    const problems: string[] = [];
    
    // Search performance issues
    const avgPos = (metrics.search.averagePosition.desktop + metrics.search.averagePosition.mobile) / 2;
    if (avgPos > 80) {
      problems.push(`Positions ${Math.round(metrics.search.averagePosition.desktop)}-${Math.round(metrics.search.averagePosition.mobile)} across all pages, ${metrics.search.clickThroughRate.toFixed(2)}% CTR (industry standard is 2-3%)`);
    }
    
    // CTR issues
    if (metrics.search.clickThroughRate < 2) {
      problems.push(`Only ${metrics.search.totalClicks} click${metrics.search.totalClicks !== 1 ? 's' : ''} from ${metrics.search.totalImpressions} impressions (${metrics.search.clickThroughRate.toFixed(2)}% vs 2-3% industry standard)`);
    }
    
    // Retention issues
    if (metrics.traffic.userRetention.day7 === 0) {
      problems.push(`0% day-7 retention (${metrics.traffic.userRetention.day1.toFixed(2)}% day-1 drops to 0% by day-7)`);
    }
    
    // Low visibility issues
    if (metrics.search.totalImpressions < 1000) {
      problems.push(`Very low search visibility with only ${metrics.search.totalImpressions} total impressions`);
    }

    return problems;
  }

  /**
   * Format Markdown as clean HTML suitable for WordPress
   */
  static markdownToHtml(markdown: string): string {
    // Convert markdown to clean HTML without document wrapping
    return `<div class="analytics-report">` + markdown
      // Headers
      .replace(/^# (.*$)/gm, '<h1 class="analytics-report-title">$1</h1>')
      .replace(/^## (.*$)/gm, '<h2 class="analytics-report-subtitle">$1</h2>')
      .replace(/^### (.*$)/gm, '<h3 class="analytics-report-section">$1</h3>')
      // Links
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="analytics-report-link">$1</a>')
      // Paragraphs - wrap content in paragraphs
      .replace(/^(?!<h[1-6]|<table|<div)(.+)$/gm, '<p>$1</p>')
      .replace(/\n\n/g, '\n')
      // Tables - using WordPress-friendly classes
      .replace(/\|([^|]*)\|/g, (match, content) => {
        // Trim content and replace multiple spaces with single space
        const cleanContent = content.trim().replace(/\s+/g, ' ');
        return `<td class="analytics-report-cell" style="text-align: ${content.includes(':') ? 'left' : 'right'}">${cleanContent}</td>`;
      })
      .replace(/^<td/gm, '<tr><td')
      .replace(/<\/td>$/gm, '</td></tr>')
      .replace(/\n\|:[^|]*\|/g, '') // Remove alignment row
      // Convert header cells and wrap in thead
      .replace(/<tr>(<td[^>]*>[^<]*<\/td>)+<\/tr>/, (match) => 
        `<thead>${match
          .replace(/<td class="analytics-report-cell"/g, '<th class="analytics-report-header"')
          .replace(/<\/td>/g, '</th>')}</thead>`)
      // Wrap remaining rows in tbody
      .replace(/(<tr>(?!<th)[\s\S]*?<\/tr>)/g, '<tbody>$1</tbody>')
      // Wrap table in container with margins
      .replace(/(<thead>[\s\S]*<\/tbody>)/, (match) => 
        `<div class="analytics-report-table-container" style="margin: 2em 0">
          <table class="analytics-report-table" style="width: 100%; border-collapse: collapse; border: 1px solid #ddd">
            ${match}
          </table>
        </div>`) + 
      '</div>';
  }

  static markdownToRawHtml(markdown: string): string {
    // Convert markdown to clean HTML without document wrapping
    return markdown
      // replace spaces with &nbsp;
      .replace(/ /g, '&nbsp;')
      // Paragraphs - wrap content in paragraphs
      .replace(/\n/g, '<br/>')
  }
}
