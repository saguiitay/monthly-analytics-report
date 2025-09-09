import { NextRequest, NextResponse } from 'next/server';
import { ReportGenerator } from '../../lib/services/report-generator';
import { ReportFormatter } from '../../lib/services/report-formatter';
import { ProjectConfig, ProjectReport, DetailedProjectReport, ReportType } from '../../lib/types';

export async function POST(request: NextRequest) {
  try {
    const { projects, endDate, reportType = 'summary' } = await request.json();

    if (!Array.isArray(projects)) {
      return NextResponse.json(
        { error: 'Projects must be an array' },
        { status: 400 }
      );
    }

    if (reportType && !['summary', 'detailed'].includes(reportType)) {
      return NextResponse.json(
        { error: 'Report type must be either "summary" or "detailed"' },
        { status: 400 }
      );
    }

    // Validate required environment variables
    const requiredEnvVars = [
      'GOOGLE_CLIENT_EMAIL',
      'GOOGLE_PRIVATE_KEY',
      //'AHREFS_API_TOKEN'
    ];

    const missingEnvVars = requiredEnvVars.filter(
      envVar => !process.env[envVar]
    );

    if (missingEnvVars.length > 0) {
      return NextResponse.json(
        {
          error: `Missing required environment variables: ${missingEnvVars.join(
            ', '
          )}`
        },
        { status: 500 }
      );
    }

    // Initialize the report generator
    const generator = new ReportGenerator();
    const endDateObj = endDate ? new Date(endDate) : undefined;

    let markdown: string;
    let summary: string;

    if (reportType === 'detailed') {
      // Generate detailed reports
      const detailedReports = await generator.generateDetailedReports(projects as ProjectConfig[], endDateObj);
      
      // Format the detailed reports
      markdown = ReportFormatter.formatDetailedReport(detailedReports);
      summary = detailedReportSummary(detailedReports);
    } else {
      // Generate summary reports (existing functionality)
      const reports = await generator.generateReports(projects as ProjectConfig[], endDateObj);
      
      // Format the reports
      markdown = ReportFormatter.formatReport(reports);
      summary = reportSummary(reports);
    }

    return NextResponse.json({
      markdown,
      summary,
      reportType
    });
  } catch (error) {
    console.error('Error generating report:', error);
    return NextResponse.json(
      { error: 'Failed to generate report' },
      { status: 500 }
    );
  }
}

function reportSummary(reports: ProjectReport[]): string { 
  // calculate total page views
  const totalPageViews = reports.map(r => r.metrics.pageViews.current).reduce((total, r) => { return total + r; });
  const previousTotalPageViews = reports.map(r => r.metrics.pageViews.previous).reduce((total, r) => { return total + r; });

  const totalImpressions = reports.map(r => r.metrics.totalImpressions.current).reduce((total, r) => { return total + r; });
  const previousTotalImpressions = reports.map(r => r.metrics.totalImpressions.previous).reduce((total, r) => { return total + r; });

  const totalClicks = reports.map(r => r.metrics.totalClicks.current).reduce((total, r) => { return total + r; });
  const previousTotalClicks = reports.map(r => r.metrics.totalClicks.previous).reduce((total, r) => { return total + r; });

  return `
Total PageViews: ${totalPageViews}, Previous Total PageViews: ${previousTotalPageViews}
Total Impressions: ${totalImpressions}, Previous Total Impressions: ${previousTotalImpressions}
Total Clicks: ${totalClicks}, Previous Total Clicks: ${previousTotalClicks}
`;
}

function detailedReportSummary(reports: DetailedProjectReport[]): string {
  const totalActiveUsers = reports.reduce((sum, r) => sum + r.metrics.traffic.activeUsers, 0);
  const totalImpressions = reports.reduce((sum, r) => sum + r.metrics.search.totalImpressions, 0);
  const totalClicks = reports.reduce((sum, r) => sum + r.metrics.search.totalClicks, 0);
  const avgCTR = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  
  const avgDesktopPosition = reports.reduce((sum, r) => sum + r.metrics.search.averagePosition.desktop, 0) / reports.length;
  const avgMobilePosition = reports.reduce((sum, r) => sum + r.metrics.search.averagePosition.mobile, 0) / reports.length;
  
  const totalProblems = reports.reduce((sum, r) => sum + r.metrics.strategicProblems.length, 0);
  
  const retentionIssues = reports.filter(r => r.metrics.traffic.userRetention.day7 === 0).length;
  
  return `
DETAILED REPORT SUMMARY:
========================
Total Active Users: ${totalActiveUsers.toLocaleString()}
Total Search Impressions: ${totalImpressions.toLocaleString()}
Total Clicks: ${totalClicks.toLocaleString()}
Average Click-Through Rate: ${avgCTR.toFixed(2)}%
Average Search Position: ${avgDesktopPosition.toFixed(1)} (Desktop), ${avgMobilePosition.toFixed(1)} (Mobile)

Critical Issues:
- ${retentionIssues} project(s) with 0% day-7 user retention
- ${reports.filter(r => r.metrics.search.averagePosition.desktop > 80).length} project(s) with search positions > 80
- ${reports.filter(r => r.metrics.search.clickThroughRate < 2).length} project(s) with CTR below 2%
- ${totalProblems} total strategic problems identified across all projects

Top Performing Projects (by active users):
${reports
  .sort((a, b) => b.metrics.traffic.activeUsers - a.metrics.traffic.activeUsers)
  .slice(0, 3)
  .map((r, i) => `${i + 1}. ${r.project.name}: ${r.metrics.traffic.activeUsers.toLocaleString()} users`)
  .join('\n')}
`;
}

export async function GET() {
  return NextResponse.json(
    {
      error: 'POST method required with projects data'
    },
    { status: 405 }
  );
}
