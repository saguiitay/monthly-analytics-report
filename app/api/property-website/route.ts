import {
  DashboardInputError, enforceDashboardOrigin, readDashboardBody, validatePropertyWebsiteRequest,
} from '../../lib/dashboard-validation';
import { discoverPropertyWebsite, safePropertyDiscoveryError } from '../../lib/services/property-discovery';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const headers = {
    'Cache-Control': 'no-store, max-age=0',
    'Pragma': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  };
  try {
    enforceDashboardOrigin(request);
    const input = validatePropertyWebsiteRequest(await readDashboardBody(request));
    return Response.json(await discoverPropertyWebsite(input), { headers });
  } catch (error) {
    const expected = error instanceof DashboardInputError;
    return Response.json({
      error: expected ? error.message : safePropertyDiscoveryError(error),
    }, { status: expected ? error.status : 502, headers });
  }
}
