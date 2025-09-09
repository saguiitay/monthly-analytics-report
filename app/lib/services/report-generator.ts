import { AnalyticsService } from './analytics';
import { SearchConsoleService } from './search-console';
import { ReportFormatter } from './report-formatter';
import { ProjectConfig, ProjectReport, DetailedProjectReport, ReportType, DetailedAnalyticsMetrics } from '../types';
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

  async generateDetailedReport(project: ProjectConfig, endDate?: Date): Promise<DetailedProjectReport> {
    // Create instances for this project
    const searchConsole = await SearchConsoleService.initialize(
      {
        clientEmail: process.env.GOOGLE_CLIENT_EMAIL || '',
        privateKey: process.env.GOOGLE_PRIVATE_KEY || '',
      },
      project.gscSiteUrl
    );

    const analytics = new AnalyticsService({
      clientEmail: process.env.GOOGLE_CLIENT_EMAIL || '',
      privateKey: process.env.GOOGLE_PRIVATE_KEY || '',
      propertyId: project.gaPropertyId
    });

    const periods = AnalyticsService.getLast30DaysPeriod(endDate);

    try {
      // Fetch all detailed metrics in parallel
      const [
        activeUsers,
        userRetention,
        trafficSources,
        geographicDistribution,
        topViewedPages,
        userEngagement,
        averagePosition,
        clickThroughRate,
        totalImpressions,
        topQueries,
        topSearchPages,
        topEvents
      ] = await Promise.all([
        analytics.getActiveUsers(periods.current.startDate, periods.current.endDate, project.gaPropertyId),
        analytics.getUserRetention(periods.current.startDate, periods.current.endDate, project.gaPropertyId),
        analytics.getTrafficSources(periods.current.startDate, periods.current.endDate, project.gaPropertyId),
        analytics.getGeographicDistribution(periods.current.startDate, periods.current.endDate, project.gaPropertyId),
        analytics.getTopViewedPages(periods.current.startDate, periods.current.endDate, project.gaPropertyId),
        analytics.getUserEngagementData(periods.current.startDate, periods.current.endDate, project.gaPropertyId),
        searchConsole.getAveragePosition(periods.current.startDate, periods.current.endDate),
        searchConsole.getClickThroughRate(periods.current.startDate, periods.current.endDate),
        searchConsole.getTotalImpressions(periods.current.startDate, periods.current.endDate),
        searchConsole.getTopQueries(periods.current.startDate, periods.current.endDate, 15),
        searchConsole.getTopSearchPages(periods.current.startDate, periods.current.endDate, 10),
        analytics.getTopEvents(periods.current.startDate, periods.current.endDate, project.gaPropertyId)
      ]);

      const detailedMetrics: DetailedAnalyticsMetrics = {
        traffic: {
          activeUsers,
          userRetention,
          trafficSources,
          geographicDistribution
        },
        search: {
          averagePosition,
          clickThroughRate,
          totalImpressions: totalImpressions.impressions,
          totalClicks: totalImpressions.clicks,
          topQueries
        },
        pagePerformance: {
          topViewedPages,
          topSearchPages
        },
        userEngagement,
        events: topEvents,
        strategicProblems: []
      };

      // Identify strategic problems
      detailedMetrics.strategicProblems = ReportFormatter.identifyStrategicProblems(detailedMetrics);

      return {
        project,
        metrics: detailedMetrics,
        period: {
          startDate: format(periods.current.startDate, 'yyyy-MM-dd'),
          endDate: format(periods.current.endDate, 'yyyy-MM-dd'),
        },
      };
    } catch (error) {
      console.error('Error generating detailed report:', error);
      throw new Error(
        `Failed to generate detailed report for ${project.name}. Please check API access and credentials.`
      );
    }
  }

  async generateReports(projects: ProjectConfig[], endDate?: Date): Promise<ProjectReport[]> {
    return Promise.all(projects.map(project => this.generateReport(project, endDate)));
  }

  async generateDetailedReports(projects: ProjectConfig[], endDate?: Date): Promise<DetailedProjectReport[]> {
    return Promise.all(projects.map(project => this.generateDetailedReport(project, endDate)));
  }
}
