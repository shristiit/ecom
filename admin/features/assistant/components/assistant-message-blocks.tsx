import { Link } from 'expo-router';
import { Text, View } from 'react-native';
import { AppBadge, AppButton, AppTable, AppTableCell, AppTableHeaderCell, AppTableRow } from '@admin/components/ui';
import type { AssistantMessageBlock } from '../types/assistant.types';

type Props = {
  blocks: AssistantMessageBlock[];
};

/** Convert raw API field names like "Inventory Stock_On_Hand" → "Inventory Stock on Hand" */
function formatTitle(raw: string) {
  return raw
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Segment a text string into paragraphs and bullet lists */
type Segment =
  | { kind: 'paragraph'; text: string }
  | { kind: 'bullets'; items: string[] };

function segmentText(content: string): Segment[] {
  const lines = content.split('\n');
  const segments: Segment[] = [];
  let bulletBuffer: string[] = [];
  let paraBuffer: string[] = [];

  const flushPara = () => {
    const text = paraBuffer.join('\n').trim();
    if (text) segments.push({ kind: 'paragraph', text });
    paraBuffer = [];
  };
  const flushBullets = () => {
    if (bulletBuffer.length) segments.push({ kind: 'bullets', items: [...bulletBuffer] });
    bulletBuffer = [];
  };

  for (const line of lines) {
    const trimmed = line.trimStart();
    if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
      flushPara();
      bulletBuffer.push(trimmed.replace(/^[-•]\s+/, ''));
    } else if (trimmed === '') {
      flushBullets();
      flushPara();
    } else {
      flushBullets();
      paraBuffer.push(line);
    }
  }
  flushBullets();
  flushPara();
  return segments;
}

function TextBlock({ content }: { content: string }) {
  const segments = segmentText(content);
  return (
    <View style={{ gap: 10 }}>
      {segments.map((seg, i) => {
        if (seg.kind === 'paragraph') {
          return (
            <Text
              key={i}
              style={{ fontSize: 14, lineHeight: 22, color: '#1a1a1a' }}
            >
              {seg.text}
            </Text>
          );
        }
        return (
          <View key={i} style={{ gap: 5 }}>
            {seg.items.map((item, j) => (
              <View key={j} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                <View
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: 2.5,
                    backgroundColor: '#FF5C00',
                    marginTop: 8,
                    flexShrink: 0,
                  }}
                />
                <Text style={{ flex: 1, fontSize: 14, lineHeight: 22, color: '#1a1a1a' }}>
                  {item}
                </Text>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

export function AssistantMessageBlocks({ blocks }: Props) {
  return (
    <View style={{ gap: 12 }}>
      {blocks.map((block, index) => {
        const key = `${block.type}-${index}`;

        if (block.type === 'text') {
          return <TextBlock key={key} content={block.content} />;
        }

        if (block.type === 'clarification') {
          return (
            <View key={key} className="rounded-md border border-border bg-surface-2 px-4 py-4">
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#1a1a1a' }}>{block.prompt}</Text>
              {block.requiredFields?.length ? (
                <Text style={{ marginTop: 6, fontSize: 13, color: '#64748B' }}>
                  Required: {block.requiredFields.join(', ')}
                </Text>
              ) : null}
            </View>
          );
        }

        if (block.type === 'preview') {
          return (
            <View key={key} className="rounded-md border border-primary/20 bg-primary-tint px-4 py-4">
              <View className="flex-row items-start justify-between gap-3">
                <View className="flex-1 gap-1">
                  <Text style={{ fontSize: 14, fontWeight: '600', color: '#1a1a1a' }}>{block.actionType}</Text>
                  <Text style={{ fontSize: 13, color: '#64748B' }}>{block.nextStep}</Text>
                </View>
                <AppBadge
                  label={block.approvalRequired ? 'Approval required' : 'Confirm only'}
                  tone={block.approvalRequired ? 'warning' : 'info'}
                />
              </View>
              <View style={{ marginTop: 12, gap: 6 }}>
                <Text style={{ fontSize: 13, color: '#1a1a1a' }}>Actor: {block.actor}</Text>
                {block.entities?.map((entity) => (
                  <Text key={`${key}-${entity.label}`} style={{ fontSize: 13, color: '#64748B' }}>
                    {entity.label}: {entity.value}
                  </Text>
                ))}
                {block.warnings?.length ? (
                  <View style={{ gap: 4 }}>
                    {block.warnings.map((warning) => (
                      <Text key={`${key}-${warning}`} style={{ fontSize: 12, color: 'rgb(180,83,9)' }}>
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
            <View key={key} className="rounded-md border border-warning/30 bg-warning-tint px-4 py-4">
              <Text style={{ fontSize: 14, fontWeight: '600', color: 'rgb(180,83,9)' }}>{block.prompt}</Text>
              {block.allowedActions?.length ? (
                <Text style={{ marginTop: 6, fontSize: 13, color: '#64748B' }}>
                  Allowed actions: {block.allowedActions.join(', ')}
                </Text>
              ) : null}
            </View>
          );
        }

        if (block.type === 'approval_pending' || block.type === 'approval_result') {
          return (
            <View key={key} className="rounded-md border border-border bg-surface-2 px-4 py-4">
              <View className="flex-row items-center justify-between gap-3">
                <Text style={{ fontSize: 13, fontWeight: '500', color: '#1a1a1a' }}>{block.message}</Text>
                <AppBadge label={block.status} tone={block.status === 'approved' ? 'success' : block.status === 'rejected' ? 'error' : 'warning'} />
              </View>
              <Text style={{ marginTop: 6, fontSize: 12, color: '#64748B' }}>Approval ID: {block.approvalId}</Text>
            </View>
          );
        }

        if (block.type === 'success' || block.type === 'error') {
          const isError = block.type === 'error';
          const displayTitle = isError ? 'Something went wrong' : block.title;
          const displayMessage = isError
            ? "I wasn't able to complete that. Try rephrasing or ask again."
            : block.message;
          return (
            <View key={key} className={`rounded-md border px-4 py-4 ${isError ? 'border-error/30 bg-error-tint' : 'border-success/30 bg-success-tint'}`}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: isError ? 'rgb(180,35,24)' : 'rgb(21,128,61)' }}>
                {displayTitle}
              </Text>
              <Text style={{ marginTop: 6, fontSize: 13, color: '#1a1a1a' }}>{displayMessage}</Text>
            </View>
          );
        }

        if (block.type === 'navigation') {
          return (
            <View key={key} className="rounded-md border border-border bg-surface-2 px-4 py-4">
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#1a1a1a' }}>{block.label}</Text>
              <Text style={{ marginTop: 4, fontSize: 13, color: '#64748B' }}>{block.description}</Text>
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
            <View key={key} style={{ gap: 8 }}>
              {/* Title with underscore → space normalisation */}
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#1a1a1a', letterSpacing: 0.1 }}>
                {formatTitle(block.title)}
              </Text>

              {/* Table with styled header */}
              <View
                style={{
                  borderWidth: 1,
                  borderColor: 'rgba(0,0,0,0.08)',
                  borderRadius: 10,
                  overflow: 'hidden',
                }}
              >
                <AppTable>
                  <AppTableRow header style={{ backgroundColor: '#F5F0EB' }}>
                    {columns.map((column) => (
                      <AppTableHeaderCell key={`${key}-${column.key}`}>
                        {column.label}
                      </AppTableHeaderCell>
                    ))}
                  </AppTableRow>
                  {rows.map((row, rowIndex) => (
                    <AppTableRow
                      key={`${key}-row-${rowIndex}`}
                      style={rowIndex % 2 === 1 ? { backgroundColor: '#FDF4F0' } : undefined}
                    >
                      {columns.map((column) => (
                        <AppTableCell key={`${key}-${rowIndex}-${column.key}`}>
                          {String(row[column.key] ?? '-')}
                        </AppTableCell>
                      ))}
                    </AppTableRow>
                  ))}
                </AppTable>
              </View>
            </View>
          );
        }

        return null;
      })}
    </View>
  );
}
