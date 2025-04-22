import { NextRequest, NextResponse } from 'next/server';
import { ReportGenerator } from '../../lib/services/report-generator';
import { ReportFormatter } from '../../lib/services/report-formatter';
import { ProjectConfig } from '../../lib/types';

export async function POST(request: NextRequest) {
  try {
    const { projects, title } = await request.json();

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
    const generator = new ReportGenerator(
      {
        clientEmail: process.env.GOOGLE_CLIENT_EMAIL!,
        privateKey: process.env.GOOGLE_PRIVATE_KEY!,
        propertyId: projects[0].gaPropertyId // We'll use the first project's property ID
      },
      {
        apiToken: process.env.AHREFS_API_TOKEN!
      }
    );

    // Generate reports for all projects
    const reports = await generator.generateReports(projects as ProjectConfig[]);

    // Format the reports
    const markdown = ReportFormatter.formatReport(reports, title);
    //const html = ReportFormatter.markdownToHtml(markdown);
    //const rawHtml = ReportFormatter.markdownToRawHtml(markdown);

    return NextResponse.json({
      markdown,
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

export async function GET() {
  return NextResponse.json(
    {
      error: 'POST method required with projects data'
    },
    { status: 405 }
  );
}
