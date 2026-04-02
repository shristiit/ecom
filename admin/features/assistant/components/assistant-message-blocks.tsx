import { Link } from 'expo-router';
import { Text, View } from 'react-native';
import { AppBadge, AppButton, AppTable, AppTableCell, AppTableHeaderCell, AppTableRow } from '@/components/ui';
import type { AssistantMessageBlock } from '../types/assistant.types';

type Props = {
  blocks: AssistantMessageBlock[];
};

export function AssistantMessageBlocks({ blocks }: Props) {
  return (
    <View className="gap-3">
      {blocks.map((block, index) => {
        const key = `${block.type}-${index}`;

        if (block.type === 'text') {
          return (
            <Text key={key} className="text-body leading-7 text-text">
              {block.content}
            </Text>
          );
        }

        if (block.type === 'clarification') {
          return (
            <View key={key} className="rounded-[24px] border border-info/20 bg-info-tint px-4 py-4">
              <Text className="text-body font-semibold text-info">{block.prompt}</Text>
              {block.requiredFields?.length ? (
                <Text className="mt-2 text-small text-muted">
                  Required: {block.requiredFields.join(', ')}
                </Text>
              ) : null}
            </View>
          );
        }

        if (block.type === 'preview') {
          return (
            <View key={key} className="rounded-[24px] border border-primary/20 bg-primary-tint px-4 py-4">
              <View className="flex-row items-start justify-between gap-3">
                <View className="flex-1 gap-1">
                  <Text className="text-body font-semibold text-text">{block.actionType}</Text>
                  <Text className="text-small text-muted">{block.nextStep}</Text>
                </View>
                <AppBadge
                  label={block.approvalRequired ? 'Approval required' : 'Confirm only'}
                  tone={block.approvalRequired ? 'warning' : 'info'}
                />
              </View>

              <View className="mt-4 gap-2">
                <Text className="text-small text-text">Actor: {block.actor}</Text>
                {block.entities?.map((entity) => (
                  <Text key={`${key}-${entity.label}`} className="text-small text-muted">
                    {entity.label}: {entity.value}
                  </Text>
                ))}
                {block.warnings?.length ? (
                  <View className="gap-1">
                    {block.warnings.map((warning) => (
                      <Text key={`${key}-${warning}`} className="text-caption text-warning">
                        {warning}
                      </Text>
                    ))}
                  </View>
                ) : null}
              </View>
            </View>
          );
        }

        if (block.type === 'confirmation_required') {
          return (
            <View key={key} className="rounded-[24px] border border-warning/30 bg-warning-tint px-4 py-4">
              <Text className="text-body font-semibold text-warning">{block.prompt}</Text>
              {block.allowedActions?.length ? (
                <Text className="mt-2 text-small text-muted">
                  Allowed actions: {block.allowedActions.join(', ')}
                </Text>
              ) : null}
            </View>
          );
        }

        if (block.type === 'approval_pending' || block.type === 'approval_result') {
          return (
            <View key={key} className="rounded-[24px] border border-border bg-surface-2 px-4 py-4">
              <View className="flex-row items-center justify-between gap-3">
                <Text className="text-small font-medium text-text">{block.message}</Text>
                <AppBadge label={block.status} tone={block.status === 'approved' ? 'success' : block.status === 'rejected' ? 'error' : 'warning'} />
              </View>
              <Text className="mt-2 text-caption text-muted">Approval ID: {block.approvalId}</Text>
            </View>
          );
        }

        if (block.type === 'success' || block.type === 'error') {
          return (
            <View key={key} className={`rounded-[24px] border px-4 py-4 ${block.type === 'success' ? 'border-success/30 bg-success-tint' : 'border-error/30 bg-error-tint'}`}>
              <Text className={`text-small font-medium ${block.type === 'success' ? 'text-success' : 'text-error'}`}>
                {block.title}
              </Text>
              <Text className="mt-2 text-small text-text">{block.message}</Text>
            </View>
          );
        }

        if (block.type === 'navigation') {
          return (
            <View key={key} className="rounded-[24px] border border-border bg-surface-2 px-4 py-4">
              <Text className="text-body font-semibold text-text">{block.label}</Text>
              <Text className="mt-1 text-small text-muted">{block.description}</Text>
              <Link href={block.href as never} asChild>
                <AppButton label="Open screen" size="sm" variant="secondary" className="mt-4 self-start" />
              </Link>
            </View>
          );
        }

        if (block.type === 'table_result') {
          const columns = block.columns ?? [];
          const rows = block.rows ?? [];
          return (
            <View key={key} className="gap-3">
              <Text className="text-body font-semibold text-text">{block.title}</Text>
              <AppTable>
                <AppTableRow header>
                  {columns.map((column) => (
                    <AppTableHeaderCell key={`${key}-${column.key}`}>{column.label}</AppTableHeaderCell>
                  ))}
                </AppTableRow>
                {rows.map((row, rowIndex) => (
                  <AppTableRow key={`${key}-row-${rowIndex}`}>
                    {columns.map((column) => (
                      <AppTableCell key={`${key}-${rowIndex}-${column.key}`}>
                        {String(row[column.key] ?? '-')}
                      </AppTableCell>
                    ))}
                  </AppTableRow>
                ))}
              </AppTable>
            </View>
          );
        }

        return null;
      })}
    </View>
  );
}
