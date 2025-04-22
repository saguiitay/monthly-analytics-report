# Monthly Analytics Report Generator

A Next.js application that automates the generation of monthly analytics reports by pulling data from Google Analytics 4, Google Search Console, and Ahrefs.

## Features

- Fetches key metrics from multiple data sources:
  - **Google Analytics 4:** Page Views and User Engagement Events
  - **Google Search Console:** Indexed Pages and Search Impressions
  - **Ahrefs:** Domain Rating (DR)
- Generates formatted reports in both Markdown and HTML
- Uses service account authentication for secure API access
- Built with Next.js and TypeScript for type safety
- Clean, responsive UI using TailwindCSS

## Prerequisites

1. **Google Cloud Project** with:
   - Google Analytics Data API enabled
   - Search Console API enabled
   - Service account with proper permissions

2. **Google Analytics 4** setup with:
   - Service account added as a viewer
   - Property ID noted

3. **Google Search Console** setup with:
   - Service account added with read permissions
   - Site URL verified and noted

4. **Ahrefs Account** with:
   - API access enabled
   - API token generated

## Setup Instructions

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/monthly-analytics-report.git
   cd monthly-analytics-report
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a \`.env.local\` file with your credentials:
   ```
   GOOGLE_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
   GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   AHREFS_API_TOKEN=your-ahrefs-api-token
   ```

   Note: The private key should be the complete key including newlines.

4. Configure your project(s) by updating the projects array in \`app/page.tsx\`:
   ```typescript
   const projects: ProjectConfig[] = [
     {
       name: "Your Project",
       url: "https://your-site.com",
       gaPropertyId: "your-ga4-property-id",
       gscSiteUrl: "https://your-site.com",
       domain: "your-site.com"
     }
   ];
   ```

5. Run the development server:
   ```bash
   npm run dev
   ```

6. Visit http://localhost:3000 to start generating reports.

## Service Account Setup

1. Go to the [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select an existing one
3. Enable the required APIs:
   - Google Analytics Data API
   - Search Console API
4. Create a service account:
   - Go to "IAM & Admin" > "Service Accounts"
   - Click "Create Service Account"
   - Fill in the details and create
   - Create a new key (JSON format)
5. Grant access:
   - In Google Analytics: Add the service account email as a viewer
   - In Search Console: Add the service account email with read permissions

## Environment Variables

| Variable | Description |
|----------|-------------|
| \`GOOGLE_CLIENT_EMAIL\` | Service account email address |
| \`GOOGLE_PRIVATE_KEY\` | Full private key from service account JSON |
| \`AHREFS_API_TOKEN\` | API token from Ahrefs account |

## Deployment

1. Push your code to GitHub
2. Create a new project on [Vercel](https://vercel.com)
3. Import your repository
4. Add environment variables in Vercel project settings
5. Deploy

## API Usage

The application exposes a POST endpoint at \`/api/report\` that accepts:

```typescript
{
  "projects": ProjectConfig[],
  "title": string
}
```

Returns:
```typescript
{
  "markdown": string, // Markdown formatted report
  "html": string     // HTML formatted report
}
```

## Contributing

1. Fork the repository
2. Create your feature branch: \`git checkout -b feature/name\`
3. Commit your changes: \`git commit -am 'Add feature'\`
4. Push to the branch: \`git push origin feature/name\`
5. Submit a pull request

## Error Handling

- The application includes comprehensive error handling for API failures
- Check the browser console and server logs for detailed error messages
- Common issues include:
  - Invalid service account credentials
  - Missing environment variables
  - Insufficient API permissions

## License

MIT License
