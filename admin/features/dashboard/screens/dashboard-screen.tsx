import { Link } from 'expo-router';
import { ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { AppBadge, AppButton, AppCard, AppTable, AppTableCell, AppTableHeaderCell, AppTableRow, PageHeader } from '@/components/ui';
import { useDashboardOverviewQuery } from '../hooks/use-dashboard-overview-query';
import { KpiCard } from '../components/kpi-card';

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function DashboardScreen() {
  const { width } = useWindowDimensions();
  const isCompact = width < 768;
  const query = useDashboardOverviewQuery();
  const data = query.data;

  return (
    <ScrollView className="bg-bg px-4 py-4">
      <PageHeader
        title="Dashboard"
        subtitle="Operational snapshot across inventory, orders, and AI approvals."
        actions={<AppButton label="Refresh" size="sm" variant="secondary" onPress={() => void query.refetch()} />}
      />

      {query.isLoading ? <Text className="text-small text-muted">Loading dashboard overview...</Text> : null}
      {query.error ? (
        <View className="mb-4 gap-3">
          <Text className="text-small text-error">{query.error.message}</Text>
          <AppButton label="Retry" size="sm" variant="secondary" onPress={() => void query.refetch()} />
        </View>
      ) : null}

      {data ? (
        <View className="gap-4 pb-6">
          <View className="flex-row flex-wrap gap-3">
            {data.kpis.map((kpi) => (
              <View key={kpi.id} className={`${isCompact ? 'w-full' : 'min-w-[220px] flex-1'}`}>
                <KpiCard kpi={kpi} />
              </View>
            ))}
          </View>

          <AppCard title="Quick actions" subtitle="Jump to common operational workflows.">
            <View className="flex-row flex-wrap gap-2">
              {data.quickActions.map((action) => (
                <View key={action.id} className={isCompact ? 'w-full' : ''}>
                  <Link href={action.href} asChild>
                    <AppButton label={action.label} size="sm" variant="secondary" fullWidth={isCompact} />
                  </Link>
                </View>
              ))}
            </View>
          </AppCard>

          <AppCard title="Alerts" subtitle="Priority items needing attention.">
            <View className="gap-2">
              {data.alerts.map((alert) => (
                <View key={alert.id} className="rounded-md border border-border bg-surface-2 px-3 py-3">
                  <View className={`gap-3 ${isCompact ? '' : 'flex-row items-start justify-between'}`.trim()}>
                    <View className="flex-1">
                      <Text className="text-small font-semibold text-text">{alert.title}</Text>
                      <Text className="text-caption text-muted">{alert.subtitle}</Text>
                    </View>
                    <AppBadge label={alert.tone} tone={alert.tone} />
                  </View>
                  {alert.href ? (
                    <View className="mt-2">
                      <Link href={alert.href} asChild>
                        <AppButton label="Open" size="sm" variant="tertiary" />
                      </Link>
                    </View>
                  ) : null}
                </View>
              ))}
            </View>
          </AppCard>

          <AppCard title="Recent movements" subtitle="Latest stock-affecting events.">
            {data.recentMovements.length === 0 ? (
              <View className="rounded-lg border border-dashed border-border bg-surface-2 px-4 py-5">
                <Text className="text-small text-muted">No recent movements found.</Text>
              </View>
            ) : isCompact ? (
              <View className="gap-2">
                {data.recentMovements.map((movement) => (
                  <View key={movement.id} className="rounded-md border border-border bg-surface-2 px-3 py-3">
                    <View className="flex-row items-start justify-between gap-3">
                      <View className="flex-1">
                        <Text className="text-small font-semibold text-text">{movement.sku}</Text>
                        <Text className="text-caption text-muted">{movement.movementType}</Text>
                      </View>
                      <AppBadge
                        label={movement.approvalStatus ?? 'pending'}
                        tone={movement.approvalStatus === 'approved' ? 'success' : 'warning'}
                      />
                    </View>

                    <View className="mt-3 flex-row items-end justify-between gap-3">
                      <View className="gap-1">
                        <Text className="text-caption uppercase tracking-wide text-subtle">Event</Text>
                        <Text className="text-small font-medium text-text">{movement.id.slice(0, 8).toUpperCase()}</Text>
                      </View>
                      <View className="items-end gap-1">
                        <Text className="text-caption uppercase tracking-wide text-subtle">Quantity</Text>
                        <Text className="text-section font-semibold text-text">{movement.quantity}</Text>
                      </View>
                    </View>

                    <Text className="mt-3 text-caption text-muted">{formatDate(movement.createdAt)}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <AppTable>
                <AppTableRow header>
                  <AppTableHeaderCell>Event</AppTableHeaderCell>
                  <AppTableHeaderCell>Date</AppTableHeaderCell>
                  <AppTableHeaderCell>SKU</AppTableHeaderCell>
                  <AppTableHeaderCell>Type</AppTableHeaderCell>
                  <AppTableHeaderCell align="right">Qty</AppTableHeaderCell>
                  <AppTableHeaderCell align="right">Status</AppTableHeaderCell>
                </AppTableRow>

                {data.recentMovements.map((movement) => (
                  <AppTableRow key={movement.id}>
                    <AppTableCell>{movement.id.slice(0, 8).toUpperCase()}</AppTableCell>
                    <AppTableCell>{formatDate(movement.createdAt)}</AppTableCell>
                    <AppTableCell>{movement.sku}</AppTableCell>
                    <AppTableCell>{movement.movementType}</AppTableCell>
                    <AppTableCell align="right" className="tabular-nums">
                      {movement.quantity}
                    </AppTableCell>
                    <AppTableCell align="right">
                      <AppBadge
                        label={movement.approvalStatus ?? 'pending'}
                        tone={movement.approvalStatus === 'approved' ? 'success' : 'warning'}
                      />
                    </AppTableCell>
                  </AppTableRow>
                ))}
              </AppTable>
            )}
          </AppCard>
        </View>
      ) : null}
    </ScrollView>
  );
}
