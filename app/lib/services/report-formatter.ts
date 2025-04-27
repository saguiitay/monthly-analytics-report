import { ProjectReport } from '../types';

export class ReportFormatter {
  /**
   * Format a single project's metrics as a Markdown table
   */
  private static formatChange(change: number): string {
    const sign = change > 0 ? '+' : '';
    return `${sign}${change.toFixed(1)}%`;
  }

  private static formatProjectTable(report: ProjectReport): string {
    const { metrics } = report;
    
    return `| Stat | Current | Previous | Change |
|:------|--------:|---------:|--------:|
| Google Analytics Page Views | ${metrics.pageViews.current.toLocaleString()} | ${metrics.pageViews.previous.toLocaleString()} | ${this.formatChange(metrics.pageViews.percentageChange)} |
| Google Analytics User Engagement Events | ${metrics.engagementEvents.current.toLocaleString()} | ${metrics.engagementEvents.previous.toLocaleString()} | ${this.formatChange(metrics.engagementEvents.percentageChange)} |
| Google Indexed Pages | ${metrics.indexedPages.toLocaleString()} | - | - |
| Google Total Impressions | ${metrics.totalImpressions.current.toLocaleString()} | ${metrics.totalImpressions.previous.toLocaleString()} | ${this.formatChange(metrics.totalImpressions.percentageChange)} |
| Google Total Clicks | ${metrics.totalClicks.current.toLocaleString()} | ${metrics.totalClicks.previous.toLocaleString()} | ${this.formatChange(metrics.totalClicks.percentageChange)} |
| Ahrefs Domain Rating (DR) | - | - | - |
`;
  }

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
