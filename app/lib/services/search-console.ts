import { google, searchconsole_v1, Auth } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';
import { SearchConsoleConfig, SearchQuery, PagePerformance } from '../types';
import { format } from 'date-fns';

export class SearchConsoleService {
  private client: searchconsole_v1.Searchconsole;
  private siteUrl: string;

  private constructor(client: searchconsole_v1.Searchconsole, siteUrl: string) {
    this.client = client;
    this.siteUrl = siteUrl;
  }

  static async initialize(config: SearchConsoleConfig, siteUrl: string): Promise<SearchConsoleService> {
    try {
      const auth = new GoogleAuth({
        credentials: {
          client_email: config.clientEmail,
          private_key: config.privateKey.replace(/\\n/g, '\n'),
        },
        scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
      });

      const authClient = await auth.getClient();
      const client = google.searchconsole({
        version: 'v1',
        auth: (authClient as unknown) as Auth.OAuth2Client
      });

      // const res = await client.sites.list();
      // console.log('Available sites:', JSON.stringify(res));
      // console.log('Site URL:', siteUrl);

      return new SearchConsoleService(client, encodeURI(siteUrl));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error initializing Search Console service:', error);
      throw new Error(
        `Failed to initialize Search Console service: ${message}. ` +
        'Please verify your service account credentials are correct and the Search Console API is enabled.'
      );
    }
  }

  async getTotalImpressions(startDate: Date, endDate: Date): Promise<{impressions: number, clicks: number}> {
    try {
      const response = await this.client.searchanalytics.query({
        siteUrl: this.siteUrl,
        requestBody: {
          startDate: format(startDate, 'yyyy-MM-dd'),
          endDate: format(endDate, 'yyyy-MM-dd'),
          dimensions: [],
          rowLimit: 1,
        },
      });

      const impressions = response.data.rows?.[0]?.impressions;
      const clicks = response.data.rows?.[0]?.clicks;
      return {
        impressions: impressions ? Math.round(impressions) : 0,
        clicks: clicks ? Math.round(clicks) : 0,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error fetching Search Console impressions:', JSON.stringify(error));
      throw new Error(
        `Failed to fetch impressions from Search Console: ${message}. ` +
        'Please verify your service account credentials and API access.'
      );
    }
  }

  // New detailed methods for detailed report
  async getAveragePosition(startDate: Date, endDate: Date): Promise<{desktop: number, mobile: number}> {
    try {
      const [desktopResponse, mobileResponse] = await Promise.all([
        this.client.searchanalytics.query({
          siteUrl: this.siteUrl,
          requestBody: {
            startDate: format(startDate, 'yyyy-MM-dd'),
            endDate: format(endDate, 'yyyy-MM-dd'),
            dimensions: ['device'],
            dimensionFilterGroups: [{
              filters: [{
                dimension: 'device',
                expression: 'desktop'
              }]
            }],
            rowLimit: 1,
          },
        }),
        this.client.searchanalytics.query({
          siteUrl: this.siteUrl,
          requestBody: {
            startDate: format(startDate, 'yyyy-MM-dd'),
            endDate: format(endDate, 'yyyy-MM-dd'),
            dimensions: ['device'],
            dimensionFilterGroups: [{
              filters: [{
                dimension: 'device',
                expression: 'mobile'
              }]
            }],
            rowLimit: 1,
          },
        })
      ]);

      const desktopPosition = desktopResponse.data.rows?.[0]?.position || 0;
      const mobilePosition = mobileResponse.data.rows?.[0]?.position || 0;

      return {
        desktop: Math.round(desktopPosition * 100) / 100,
        mobile: Math.round(mobilePosition * 100) / 100
      };
    } catch (error) {
      console.error('Error fetching average position:', error);
      return { desktop: 0, mobile: 0 };
    }
  }

  async getClickThroughRate(startDate: Date, endDate: Date): Promise<number> {
    try {
      const response = await this.client.searchanalytics.query({
        siteUrl: this.siteUrl,
        requestBody: {
          startDate: format(startDate, 'yyyy-MM-dd'),
          endDate: format(endDate, 'yyyy-MM-dd'),
          dimensions: [],
          rowLimit: 1,
        },
      });

      const clicks = response.data.rows?.[0]?.clicks || 0;
      const impressions = response.data.rows?.[0]?.impressions || 0;
      
      if (impressions === 0) return 0;
      return Math.round((clicks / impressions) * 10000) / 100; // Return as percentage with 2 decimal places
    } catch (error) {
      console.error('Error fetching click-through rate:', error);
      return 0;
    }
  }

  async getTopQueries(startDate: Date, endDate: Date, limit: number = 10): Promise<SearchQuery[]> {
    try {
      const response = await this.client.searchanalytics.query({
        siteUrl: this.siteUrl,
        requestBody: {
          startDate: format(startDate, 'yyyy-MM-dd'),
          endDate: format(endDate, 'yyyy-MM-dd'),
          dimensions: ['query'],
          rowLimit: limit,
        },
      });

      if (!response.data.rows?.length) {
        return [];
      }

      return response.data.rows.map(row => {
        const query = row.keys?.[0] || 'Unknown';
        const clicks = row.clicks || 0;
        const impressions = row.impressions || 0;
        const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
        const position = row.position || 0;

        return {
          query,
          clicks: Math.round(clicks),
          impressions: Math.round(impressions),
          ctr: Math.round(ctr * 100) / 100,
          position: Math.round(position * 100) / 100
        };
      });
    } catch (error) {
      console.error('Error fetching top queries:', error);
      return [];
    }
  }

  async getTopSearchPages(startDate: Date, endDate: Date, limit: number = 10): Promise<PagePerformance[]> {
    try {
      const response = await this.client.searchanalytics.query({
        siteUrl: this.siteUrl,
        requestBody: {
          startDate: format(startDate, 'yyyy-MM-dd'),
          endDate: format(endDate, 'yyyy-MM-dd'),
          dimensions: ['page'],
          rowLimit: limit,
        },
      });

      if (!response.data.rows?.length) {
        return [];
      }

      return response.data.rows.map(row => {
        const url = row.keys?.[0] || 'Unknown';
        const clicks = row.clicks || 0;
        const impressions = row.impressions || 0;
        const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
        const position = row.position || 0;

        return {
          page: this.extractPageTitle(url),
          url,
          views: 0, // This will be filled from Analytics data
          impressions: Math.round(impressions),
          clicks: Math.round(clicks),
          ctr: Math.round(ctr * 100) / 100,
          position: Math.round(position * 100) / 100
        };
      });
    } catch (error) {
      console.error('Error fetching top search pages:', error);
      return [];
    }
  }

  private extractPageTitle(url: string): string {
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname;
      
      // Extract meaningful page name from path
      if (path === '/' || path === '') return 'Main Page';
      
      const segments = path.split('/').filter(s => s.length > 0);
      const lastSegment = segments[segments.length - 1];
      
      // Convert URL segments to readable titles
      return lastSegment
        .replace(/-/g, ' ')
        .replace(/_/g, ' ')
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    } catch {
      return url;
    }
  }

  // Note: As mentioned in the design doc, getting indexed pages count via API
  // is not directly supported. This is a placeholder that could be updated
  // when Google adds API support or replaced with a different implementation.
  async getIndexedPagesCount(): Promise<number> {
    try {
      // For now, we'll use the sitemaps API to get an estimate
      // This is not as accurate as the Index Coverage report
      const response = await this.client.sitemaps.list({
        siteUrl: this.siteUrl,
      });

      console.log('Sitemaps site url:', this.siteUrl);
      console.log('Sitemaps response:', JSON.stringify(response.data));


      let totalIndexed = 0;
      if (response.data.sitemap) {
        for (const sitemap of response.data.sitemap) {
          if (sitemap.path && sitemap.lastDownloaded) {
            const details = await this.client.sitemaps.get({
              siteUrl: this.siteUrl,
              feedpath: sitemap.path,
            });
            if (details.data.contents) {
              const submitted = details.data.contents[0]?.submitted;
              totalIndexed += typeof submitted === 'number' ? submitted : 0;
            }
          }
        }
      }

      return totalIndexed;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error fetching indexed pages count:', error);
      throw new Error(
        `Failed to fetch indexed pages count: ${message}. ` +
        'Please verify your service account credentials and API access.'
      );
    }
  }
}
