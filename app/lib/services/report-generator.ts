import { AnalyticsService } from './analytics';
import { SearchConsoleService } from './search-console';
//import { AhrefsService } from './ahrefs';
import { ProjectConfig, ProjectReport, ServiceAccountConfig, AhrefsConfig } from '../types';
import { format } from 'date-fns';

export class ReportGenerator {
  //private ahrefs: AhrefsService;
  private googleConfig: ServiceAccountConfig;

  constructor(
    googleConfig: ServiceAccountConfig,
    ahrefsConfig: AhrefsConfig
  ) {
    //this.ahrefs = new AhrefsService(ahrefsConfig);
    this.googleConfig = googleConfig;
  }

  async generateReport(project: ProjectConfig): Promise<ProjectReport> {
    // Create a new SearchConsole instance for this project
    const searchConsole = await SearchConsoleService.initialize(
      {
        clientEmail: process.env.GOOGLE_CLIENT_EMAIL || '',
        privateKey: process.env.GOOGLE_PRIVATE_KEY || '',
        propertyId: project.gaPropertyId
      },
      project.gscSiteUrl
    );

    const periods = AnalyticsService.getLast30DaysPeriod();
    let currentPageViews = 0, previousPageViews = 0,
        currentEngagementEvents = 0, previousEngagementEvents = 0,
        currentImpressions = 0, previousImpressions = 0,
        indexedPages = 0, domainRating = -1;

    try {
      // Create a new Analytics instance for this project
      const analytics = new AnalyticsService({
        ...this.googleConfig,
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
          current: currentImpressions,
          previous: previousImpressions,
          percentageChange: AnalyticsService.calculatePercentageChange(currentImpressions, previousImpressions)
        },
        domainRating,
      },
      period: {
        startDate: format(periods.current.startDate, 'yyyy-MM-dd'),
        endDate: format(periods.current.endDate, 'yyyy-MM-dd'),
      },
    };
  }

  async generateReports(projects: ProjectConfig[]): Promise<ProjectReport[]> {
    return Promise.all(projects.map(project => this.generateReport(project)));
  }
}
