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
|------|--------:|---------:|--------:|
| Page Views | ${metrics.pageViews.current.toLocaleString()} | ${metrics.pageViews.previous.toLocaleString()} | ${this.formatChange(metrics.pageViews.percentageChange)} |
| User Engagement Events | ${metrics.engagementEvents.current.toLocaleString()} | ${metrics.engagementEvents.previous.toLocaleString()} | ${this.formatChange(metrics.engagementEvents.percentageChange)} |
| Google Indexed Pages | ${metrics.indexedPages.toLocaleString()} | - | - |
| Total Impressions | ${metrics.totalImpressions.current.toLocaleString()} | ${metrics.totalImpressions.previous.toLocaleString()} | ${this.formatChange(metrics.totalImpressions.percentageChange)} |
| Ahrefs Domain Rating (DR) | ${metrics.domainRating} | - | - |`;
  }

  /**
   * Generate a complete Markdown report for a project
   */
  private static formatProjectReport(report: ProjectReport): string {
    const { project, period } = report;
    
    return `## ${project.name} – [Visit website](${project.url})

Period: ${period.startDate} to ${period.endDate}

### Statistics

${ReportFormatter.formatProjectTable(report)}
`;
  }

  /**
   * Generate a complete Markdown report for multiple projects
   */
  static formatReport(reports: ProjectReport[], title?: string): string {
    const reportTitle = title || `Analytics Report - ${reports[0].period.startDate} to ${reports[0].period.endDate}`;
    
    const markdownReport = `# ${reportTitle}

${reports.map(report => ReportFormatter.formatProjectReport(report)).join('\n\n')}
`;

    return markdownReport;
  }

  /**
   * Convert Markdown to HTML
   */
  static markdownToHtml(markdown: string): string {
    // Basic conversion of markdown to HTML
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Analytics Report</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 1rem 0;
    }
    th, td {
      padding: 0.5rem;
      border: 1px solid #ddd;
      text-align: left;
    }
    th {
      background-color: #f5f5f5;
    }
    td:last-child {
      text-align: right;
    }
    h1, h2, h3 {
      color: #333;
    }
    a {
      color: #0066cc;
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  ${markdown
    .replace(/^# (.*$)/gm, '<h1>$1</h1>')
    .replace(/^## (.*$)/gm, '<h2>$1</h2>')
    .replace(/^### (.*$)/gm, '<h3>$1</h3>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\|([^|]*)\|/g, '<td>$1</td>')
    .replace(/^<td>/gm, '<tr>')
    .replace(/<\/td>$/gm, '</tr>')
    .replace(/\n\|---([^|]*)\|/g, '')
    .replace(/<tr>(<td>[^<]*<\/td>)+<\/tr>/,
      (match) => match.replace(/<td>/g, '<th>').replace(/<\/td>/g, '</th>'))}
</body>
</html>`;
  }
}
