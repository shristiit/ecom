import { Link } from 'expo-router';
import type { ReactNode } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import { AppBadge, AppButton, AppTable, AppTableCell, AppTableHeaderCell, AppTableRow, PageShell, PageScrollView } from '@admin/components/ui';
import { useDashboardOverviewQuery } from '../hooks/use-dashboard-overview-query';
import { KpiCard } from '../components/kpi-card';

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function DashboardSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <View className="rounded-md border border-border bg-surface p-4 shadow-soft">
      <View className="mb-3 gap-0.5">
        <Text className="text-small font-semibold text-text">{title}</Text>
        {subtitle ? <Text className="text-caption text-muted">{subtitle}</Text> : null}
      </View>
      {children}
    </View>
  );
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
    <PageShell>
      <PageScrollView>
        <View className="mb-4 flex-row items-start justify-between gap-3">
          <View className="flex-1 gap-1">
            <Text className="text-section font-semibold text-text">Dashboard</Text>
            <Text className="text-caption text-muted">Operational snapshot across inventory, orders, and AI approvals.</Text>
          </View>
          <AppButton label="Refresh" size="sm" variant="secondary" onPress={() => void query.refetch()} />
        </View>

        {query.isLoading ? <Text className="text-small text-muted">Loading dashboard overview...</Text> : null}
        {query.error ? (
          <View className="mb-4 gap-3">
            <Text className="text-small text-error">{query.error.message}</Text>
            <AppButton label="Retry" size="sm" variant="secondary" onPress={() => void query.refetch()} />
          </View>
        ) : null}

        {data ? (
          <View className="gap-3 pb-6">
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

            <DashboardSection title="Quick actions" subtitle="Jump to common operational workflows.">
              <View className="flex-row flex-wrap gap-2">
                {data.quickActions.map((action) => (
                  <Link key={action.id} href={action.href} asChild>
                    <AppButton label={action.label} size="sm" variant="secondary" />
                  </Link>
                ))}
              </View>
            </DashboardSection>

            <DashboardSection title="Alerts" subtitle="Priority items needing attention.">
              <View className="gap-2">
                {data.alerts.map((alert) => (
                  <View key={alert.id} className="rounded-md border border-border bg-surface-2 px-3 py-2.5">
                    <View className="flex-row items-start justify-between gap-3">
                      <View className="flex-1">
                        <Text className="text-caption font-semibold text-text">{alert.title}</Text>
                        <Text className="text-caption text-muted">{alert.subtitle}</Text>
                      </View>
                      <AppBadge label={alert.tone} tone={alert.tone} className="px-2 py-0.5" />
                    </View>
                    {alert.href ? (
                      <View className="mt-1.5 items-start">
                        <Link href={alert.href} asChild>
                          <AppButton label="Open" size="sm" variant="tertiary" className="min-h-8 px-0" />
                        </Link>
                      </View>
                    ) : null}
                  </View>
                ))}
              </View>
            </DashboardSection>

            <DashboardSection title="Recent movements" subtitle="Latest stock-affecting events.">
              {data.recentMovements.length === 0 ? (
                <View className="rounded-md border border-dashed border-border bg-surface-2 px-4 py-4">
                  <Text className="text-caption text-muted">No recent movements found.</Text>
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
            </DashboardSection>
          </View>
        ) : null}
      </PageScrollView>
    </PageShell>
  );
}
