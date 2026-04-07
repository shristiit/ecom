import { Link } from 'expo-router';
import { ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { AppBadge, AppButton, AppCard, AppTable, AppTableCell, AppTableHeaderCell, AppTableRow, PageHeader, PageShell } from '@admin/components/ui';
import { useDashboardOverviewQuery } from '../hooks/use-dashboard-overview-query';
import { KpiCard } from '../components/kpi-card';

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function DashboardScreen() {
  const query = useDashboardOverviewQuery();
  const data = query.data;
  const { width } = useWindowDimensions();

  const contentWidth = Math.max(width - 48, 0);
  const kpiColumns = contentWidth >= 1200 ? 4 : contentWidth >= 840 ? 3 : contentWidth >= 560 ? 2 : 1;
  const kpiGap = 12;
  const kpiCardWidth = kpiColumns === 1 ? '100%' : (contentWidth - kpiGap * (kpiColumns - 1)) / kpiColumns;

  return (
    <PageShell variant="dashboard">
      <ScrollView className="px-6 py-6">
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
                <View
                  key={kpi.id}
                  style={{ width: kpiCardWidth }}
                  className={kpiColumns === 1 ? 'w-full' : ''}
                >
                  <KpiCard kpi={kpi} />
                </View>
              ))}
            </View>

            <AppCard title="Quick actions" subtitle="Jump to common operational workflows.">
              <View className="flex-row flex-wrap gap-2">
                {data.quickActions.map((action) => (
                  <Link key={action.id} href={action.href} asChild>
                    <AppButton label={action.label} size="sm" variant="secondary" />
                  </Link>
                ))}
              </View>
            </AppCard>

            <AppCard title="Alerts" subtitle="Priority items needing attention.">
              <View className="gap-2">
                {data.alerts.map((alert) => (
                  <View key={alert.id} className="rounded-md border border-border bg-surface-2 px-3 py-3">
                    <View className="flex-row items-start justify-between gap-3">
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
    </PageShell>
  );
}
