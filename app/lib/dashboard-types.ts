export interface WorkspaceProject {
  id: string;
  name: string;
  url: string;
  propertyId: string;
}

export interface ServiceAccountCredentials {
  client_email: string;
  private_key: string;
}

export interface DiscoveredProperty {
  propertyId: string;
  name: string;
  accountName: string;
}

export interface PropertyDiscoveryRequest {
  credentials: ServiceAccountCredentials;
  pageToken?: string;
}

export interface PropertyDiscoveryResponse {
  properties: DiscoveredProperty[];
  nextPageToken: string | null;
}

export interface PropertyWebsiteRequest {
  credentials: ServiceAccountCredentials;
  propertyId: string;
}

export interface PropertyWebsiteResponse {
  urls: string[];
}

export interface DashboardRequest {
  projects: WorkspaceProject[];
  credentials: ServiceAccountCredentials;
  endDate: string;
  days: 7 | 30 | 90;
}

export interface DashboardMetric {
  current: number;
  previous: number;
  percentageChange: number | null;
}

export interface DashboardDay {
  date: string;
  pageViews: number;
  activeUsers: number;
}

export interface DashboardChannel {
  name: string;
  sessions: number;
}

export interface DashboardPage {
  path: string;
  title: string;
  pageViews: number;
}

export interface DashboardProjectReport {
  project: WorkspaceProject;
  period: { startDate: string; endDate: string };
  previousPeriod: { startDate: string; endDate: string };
  metrics: {
    pageViews: DashboardMetric;
    activeUsers: DashboardMetric;
    sessions: DashboardMetric;
    engagementRate: DashboardMetric;
  };
  daily: DashboardDay[];
  channels: DashboardChannel[];
  topPages: DashboardPage[];
}

export interface DashboardProjectError {
  project: WorkspaceProject;
  message: string;
}

export interface DashboardResponse {
  reports: DashboardProjectReport[];
  errors: DashboardProjectError[];
  generatedAt: string;
}
