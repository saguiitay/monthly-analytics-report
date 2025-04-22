import { google, searchconsole_v1, Auth } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';
import { ServiceAccountConfig } from '../types';
import { format } from 'date-fns';

export class SearchConsoleService {
  private client: searchconsole_v1.Searchconsole;
  private siteUrl: string;

  private constructor(client: searchconsole_v1.Searchconsole, siteUrl: string) {
    this.client = client;
    this.siteUrl = siteUrl;
  }

  static async initialize(config: ServiceAccountConfig, siteUrl: string): Promise<SearchConsoleService> {
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

  async getTotalImpressions(startDate: Date, endDate: Date): Promise<number> {
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
      return impressions ? Math.round(impressions) : 0;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error fetching Search Console impressions:', JSON.stringify(error));
      throw new Error(
        `Failed to fetch impressions from Search Console: ${message}. ` +
        'Please verify your service account credentials and API access.'
      );
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
