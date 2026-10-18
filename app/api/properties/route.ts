import {
  DashboardInputError, enforceDashboardOrigin, readDashboardBody, validatePropertyDiscoveryRequest,
} from '../../lib/dashboard-validation';
import { discoverProperties, safePropertyDiscoveryError } from '../../lib/services/property-discovery';

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
    const input = validatePropertyDiscoveryRequest(await readDashboardBody(request));
    return Response.json(await discoverProperties(input), { headers });
  } catch (error) {
    const expected = error instanceof DashboardInputError;
    return Response.json({
      error: expected ? error.message : safePropertyDiscoveryError(error),
    }, { status: expected ? error.status : 502, headers });
  }
}
