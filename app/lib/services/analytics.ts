import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { GoogleAnalyticsConfig } from '../types';
import { subDays, format } from 'date-fns';

export class AnalyticsService {
  private static clientInstance: BetaAnalyticsDataClient | null = null;
  private static clientCredentials: { client_email: string, private_key: string } | null = null;

  constructor(config: GoogleAnalyticsConfig) {
    // Initialize static client if not already done
    if (!AnalyticsService.clientInstance || 
        !AnalyticsService.clientCredentials ||
        AnalyticsService.clientCredentials.client_email !== config.clientEmail ||
        AnalyticsService.clientCredentials.private_key !== config.privateKey) {
      AnalyticsService.clientCredentials = {
        client_email: config.clientEmail,
        private_key: config.privateKey.replace(/\\n/g, '\n'),
      };
      AnalyticsService.clientInstance = new BetaAnalyticsDataClient({
        credentials: AnalyticsService.clientCredentials,
      });
    }
  }

  private async runReport(startDate: Date, endDate: Date, metric: string, propertyId: string): Promise<number> {
    try {
      if (!AnalyticsService.clientInstance) {
        throw new Error('Analytics client not initialized');
      }
      const [response] = await AnalyticsService.clientInstance.runReport({
        property: `properties/${propertyId}`,
        dateRanges: [
          {
            startDate: format(startDate, 'yyyy-MM-dd'),
            endDate: format(endDate, 'yyyy-MM-dd'),
          },
        ],
        metrics: [{ name: metric }],
      });

      if (!response.rows?.length) {
        return 0;
      }

      return parseInt(response.rows[0].metricValues?.[0].value || '0', 10);
    } catch (error) {
      console.error('Error fetching Google Analytics metric:', error);
      throw new Error(`Failed to fetch ${metric} from Google Analytics`);
    }
  }

  async getPageViews(startDate: Date, endDate: Date, propertyId: string): Promise<number> {
    return this.runReport(startDate, endDate, 'screenPageViews', propertyId);
  }

  async getEngagementEvents(startDate: Date, endDate: Date, propertyId: string): Promise<number> {
    return this.runReport(startDate, endDate, 'eventCount', propertyId);
  }

  static getLast30DaysPeriod(endDate: Date = new Date()): { 
    current: { startDate: Date; endDate: Date };
    previous: { startDate: Date; endDate: Date };
  } {
    const currentEndDate = endDate;
    const currentStartDate = subDays(currentEndDate, 30);
    const previousEndDate = subDays(currentStartDate, 1);
    const previousStartDate = subDays(previousEndDate, 30);
    
    return {
      current: { startDate: currentStartDate, endDate: currentEndDate },
      previous: { startDate: previousStartDate, endDate: previousEndDate }
    };
  }

  static calculatePercentageChange(current: number, previous: number): number {
    if (previous === 0) return current === 0 ? 0 : 100;
    return ((current - previous) / previous) * 100;
  }
}
