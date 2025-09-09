export interface ProjectConfig {
  name: string;
  url: string;
  gaPropertyId: string;
  gscSiteUrl: string;
  domain: string;
}

export interface MetricWithChange {
  current: number;
  previous: number;
  percentageChange: number;
}

export interface AnalyticsMetrics {
  pageViews: MetricWithChange;
  engagementEvents: MetricWithChange;
  indexedPages: number;
  totalImpressions: MetricWithChange;
  totalClicks: MetricWithChange;
  domainRating: number;
}

export interface ProjectReport {
  project: ProjectConfig;
  metrics: AnalyticsMetrics;
  period: {
    startDate: string;
    endDate: string;
  };
}

// Detailed report types
export interface TrafficSource {
  source: string;
  users: number;
  percentage: number;
}

export interface GeographicData {
  country: string;
  users: number;
  percentage: number;
}

export interface SearchQuery {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface PagePerformance {
  page: string;
  url?: string;
  views: number;
  impressions?: number;
  clicks?: number;
  ctr?: number;
  position?: number;
}

export interface EventData {
  eventName: string;
  eventCount: number;
  percentage: number;
}

export interface UserEngagementData {
  peakEngagementDays: string[];
  averageEngagementTime: number;
  sessionQuality: {
    min: number;
    max: number;
    average: number;
  };
}

export interface DetailedTrafficMetrics {
  activeUsers: number;
  previousActiveUsers?: number;
  userRetention: {
    day1: number;
    day7: number;
  };
  previousUserRetention?: {
    day1: number;
    day7: number;
  };
  trafficSources: TrafficSource[];
  previousTrafficSources?: TrafficSource[];
  geographicDistribution: GeographicData[];
  previousGeographicDistribution?: GeographicData[];
}

export interface DetailedSearchMetrics {
  averagePosition: {
    desktop: number;
    mobile: number;
  };
  previousAveragePosition?: {
    desktop: number;
    mobile: number;
  };
  clickThroughRate: number;
  previousClickThroughRate?: number;
  totalImpressions: number;
  previousTotalImpressions?: number;
  totalClicks: number;
  previousTotalClicks?: number;
  topQueries: SearchQuery[];
  previousTopQueries?: SearchQuery[];
}

export interface DetailedAnalyticsMetrics {
  traffic: DetailedTrafficMetrics;
  search: DetailedSearchMetrics;
  pagePerformance: {
    topViewedPages: PagePerformance[];
    topSearchPages: PagePerformance[];
    previousTopViewedPages?: PagePerformance[];
    previousTopSearchPages?: PagePerformance[];
  };
  userEngagement: UserEngagementData;
  previousUserEngagement?: UserEngagementData;
  events: EventData[];
  previousEvents?: EventData[];
  strategicProblems: string[];
}

export interface DetailedProjectReport {
  project: ProjectConfig;
  metrics: DetailedAnalyticsMetrics;
  period: {
    startDate: string;
    endDate: string;
  };
}

export type ReportType = 'summary' | 'detailed';

export interface SearchConsoleConfig {
  clientEmail: string;
  privateKey: string;
}

export interface GoogleAnalyticsConfig {
  clientEmail: string;
  privateKey: string;
  propertyId: string;
}

export interface AhrefsConfig {
  apiToken: string;
}
