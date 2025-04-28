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
