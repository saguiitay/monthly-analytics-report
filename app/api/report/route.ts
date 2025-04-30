import { NextRequest, NextResponse } from 'next/server';
import { ReportGenerator } from '../../lib/services/report-generator';
import { ReportFormatter } from '../../lib/services/report-formatter';
import { ProjectConfig, ProjectReport } from '../../lib/types';

export async function POST(request: NextRequest) {
  try {
    const { projects, endDate } = await request.json();

    if (!Array.isArray(projects)) {
      return NextResponse.json(
        { error: 'Projects must be an array' },
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

    // Generate reports for all projects
    const endDateObj = endDate ? new Date(endDate) : undefined;
    const reports = await generator.generateReports(projects as ProjectConfig[], endDateObj);

    // Format the reports
    const markdown = ReportFormatter.formatReport(reports);
    const summary = reportSummary(reports);
    //const rawHtml = ReportFormatter.markdownToRawHtml(markdown);

    return NextResponse.json({
      markdown,
      summary
      //rawHtml,
      //html,
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

export async function GET() {
  return NextResponse.json(
    {
      error: 'POST method required with projects data'
    },
    { status: 405 }
  );
}
