import { Text, View } from 'react-native';
import { AppBadge, AppCard } from '@/components/ui';
import type { DashboardKpi } from '../types/dashboard.types';

export function KpiCard({ kpi }: { kpi: DashboardKpi }) {
  return (
    <AppCard>
      <View className="gap-2">
        <View className="flex-row items-center justify-between gap-2">
          <Text className="text-small text-muted">{kpi.label}</Text>
          {kpi.tone ? <AppBadge label={kpi.tone} tone={kpi.tone} /> : null}
        </View>
        <Text className="text-title font-semibold text-text">{kpi.value}</Text>
        {kpi.helper ? <Text className="text-caption text-subtle">{kpi.helper}</Text> : null}
      </View>
    </AppCard>
  );
}
