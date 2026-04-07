import { queryKeys, useQuery } from '@admin/lib/query';
import { dashboardService } from '../services/dashboard.service';

export function useDashboardOverviewQuery(enabled = true) {
  return useQuery({
    key: queryKeys.dashboard.overview(),
    enabled,
    queryFn: () => dashboardService.getOverview(),
  });
}
