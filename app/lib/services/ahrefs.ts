import axios from 'axios';
import { AhrefsConfig } from '../types';

interface AhrefsResponse {
  domain: {
    domain_rating: number;
    ahrefs_rank: number;
  };
  error?: {
    code: number;
    message: string;
  };
}

export class AhrefsService {
  private readonly apiToken: string;
  private readonly baseUrl = 'https://api.ahrefs.com/v3/';

  constructor(config: AhrefsConfig) {
    this.apiToken = config.apiToken;
  }

  async getDomainRating(domain: string): Promise<number> {
    try {

      const currentDate = new Date();
      const year = currentDate.getFullYear();
      const month = String(currentDate.getMonth() + 1).padStart(2, "0");
      const day = String(currentDate.getDate()).padStart(2, "0");

      const formattedDate = `${year}-${month}-${day}`;

      
      const { SiteExplorer } = require("ahrefs-v3");
      const explorer = new SiteExplorer(this.apiToken);            
      const domainRating = await explorer.domainRating.get('wordcount.com', formattedDate);  

      console.log('Domain Rating:', domainRating.data.domain_rating.domain_rating); // Log the domain rating

      return domainRating.data.domain_rating.domain_rating;

    } catch (error) {
      console.error('Error fetching Ahrefs Domain Rating:', error);
      throw new Error('Failed to fetch Domain Rating from Ahrefs');
    }
  }
}
