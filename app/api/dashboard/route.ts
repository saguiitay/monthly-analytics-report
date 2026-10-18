import { respondToDashboard } from '../../lib/dashboard-validation';
import { generateDashboard } from '../../lib/services/dashboard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  return respondToDashboard(request, generateDashboard);
}
