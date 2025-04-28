import { AnalyticsService } from './analytics';
import { SearchConsoleService } from './search-console';
import { ProjectConfig, ProjectReport } from '../types';
import { format } from 'date-fns';

export class ReportGenerator {
  constructor(
  ) {
  }

  async generateReport(project: ProjectConfig, endDate?: Date): Promise<ProjectReport> {
    // Create a new SearchConsole instance for this project
    const searchConsole = await SearchConsoleService.initialize(
      {
        clientEmail: process.env.GOOGLE_CLIENT_EMAIL || '',
        privateKey: process.env.GOOGLE_PRIVATE_KEY || '',
        //propertyId: project.gaPropertyId
      },
      project.gscSiteUrl
    );

    const periods = AnalyticsService.getLast30DaysPeriod(endDate);
    let currentPageViews = 0, previousPageViews = 0,
        currentEngagementEvents = 0, previousEngagementEvents = 0,
        currentImpressions = { impressions: 0, clicks: 0}, previousImpressions = { impressions: 0, clicks: 0},
        indexedPages = 0;
    const domainRating = -1;

    try {
      // Create a new Analytics instance for this project
      const analytics = new AnalyticsService({
        clientEmail: process.env.GOOGLE_CLIENT_EMAIL || '',
        privateKey: process.env.GOOGLE_PRIVATE_KEY || '',
        propertyId: project.gaPropertyId
      });

      // Fetch current and previous period metrics in parallel
      [
        currentPageViews,
        previousPageViews,
        currentEngagementEvents,
        previousEngagementEvents
      ] = await Promise.all([
        analytics.getPageViews(periods.current.startDate, periods.current.endDate, project.gaPropertyId),
        analytics.getPageViews(periods.previous.startDate, periods.previous.endDate, project.gaPropertyId),
        analytics.getEngagementEvents(periods.current.startDate, periods.current.endDate, project.gaPropertyId),
        analytics.getEngagementEvents(periods.previous.startDate, periods.previous.endDate, project.gaPropertyId),
      ]);
    } catch (error) {
      console.error('Analytics error:', error);
      throw new Error(
        'Failed to fetch Google Analytics data. Please verify the Google Analytics Data API is enabled and the service account has access.'
      );
    }

    try {
      [currentImpressions, previousImpressions, indexedPages] = await Promise.all([
        searchConsole.getTotalImpressions(periods.current.startDate, periods.current.endDate),
        searchConsole.getTotalImpressions(periods.previous.startDate, periods.previous.endDate),
        -1, //searchConsole.getIndexedPagesCount(),
      ]);
    } catch (error) {
      console.error('Search Console error:', error);
      throw new Error(
        'Failed to fetch Search Console data. Please verify the Search Console API is enabled and the service account has access.'
      );
    }

    // try {
    //   if (process.env.AHREFS_API_TOKEN) {
    //     domainRating = await this.ahrefs.getDomainRating(project.domain);
    //   }
    // } catch (error) {
    //   console.error('Ahrefs error:', error);
    //   throw new Error(
    //     'Failed to fetch Ahrefs data. Please verify your Ahrefs API token is valid and has sufficient access.'
    //   );
    // }

    return {
      project,
      metrics: {
        pageViews: {
          current: currentPageViews,
          previous: previousPageViews,
          percentageChange: AnalyticsService.calculatePercentageChange(currentPageViews, previousPageViews)
        },
        engagementEvents: {
          current: currentEngagementEvents,
          previous: previousEngagementEvents,
          percentageChange: AnalyticsService.calculatePercentageChange(currentEngagementEvents, previousEngagementEvents)
        },
        indexedPages,
        totalImpressions: {
          current: currentImpressions.impressions,
          previous: previousImpressions.impressions,
          percentageChange: AnalyticsService.calculatePercentageChange(currentImpressions.impressions, previousImpressions.impressions)
        },
        totalClicks: {
          current: currentImpressions.clicks,
          previous: previousImpressions.clicks,
          percentageChange: AnalyticsService.calculatePercentageChange(currentImpressions.clicks, previousImpressions.clicks)
        },
        domainRating,
      },
      period: {
        startDate: format(periods.current.startDate, 'yyyy-MM-dd'),
        endDate: format(periods.current.endDate, 'yyyy-MM-dd'),
      },
    };
  }

  async generateReports(projects: ProjectConfig[], endDate?: Date): Promise<ProjectReport[]> {
    return Promise.all(projects.map(project => this.generateReport(project, endDate)));
  }
}
