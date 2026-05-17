import { Text, View } from 'react-native';
import type { DashboardKpi } from '../types/dashboard.types';

export function KpiCard({ kpi }: { kpi: DashboardKpi }) {
  return (
    <View className="min-h-[120px] rounded-md border border-primary-tint-strong bg-primary-tint px-4 py-4 shadow-soft">
      <View className="flex-1 justify-between gap-3">
        <Text className="text-caption font-medium uppercase text-primary-text">{kpi.label}</Text>
        <View className="gap-1">
          <Text className="text-section font-semibold text-text tabular-nums">{kpi.value}</Text>
          {kpi.helper ? <Text className="text-caption text-muted">{kpi.helper}</Text> : null}
        </View>
      </View>
    </View>
  );
}
