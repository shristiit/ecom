import { Link } from 'expo-router';
import { useState } from 'react';
import { Platform, ScrollView, Text, View } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppTable,
  AppTableCell,
  AppTableHeaderCell,
  AppTableRow,
  PageHeader,
} from '@/components/ui';
import { auditService, useAuditQuery } from '@/features/audit';

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function AuditScreen() {
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const query = useAuditQuery({ page: 1, pageSize: 100 });
  const rows = query.data?.items ?? [];

  const downloadFile = async (content: string, filename: string, mimeType: string, encoding: 'utf8' | 'base64' = 'utf8') => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
      return;
    }

    const targetDirectory = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
    if (!targetDirectory) {
      throw new Error('File storage is not available on this device.');
    }

    if (!(await Sharing.isAvailableAsync())) {
      throw new Error('File sharing is not available on this device.');
    }

    const fileUri = `${targetDirectory}${filename}`;
    await FileSystem.writeAsStringAsync(fileUri, content, {
      encoding: encoding === 'base64' ? FileSystem.EncodingType.Base64 : FileSystem.EncodingType.UTF8,
    });

    await Sharing.shareAsync(fileUri, {
      mimeType,
      dialogTitle: `Share ${filename}`,
      UTI: mimeType === 'application/pdf' ? 'com.adobe.pdf' : 'public.comma-separated-values-text',
    });
  };

  const handleExportCsv = async () => {
    try {
      setIsExporting(true);
      setExportMessage(null);
      const csv = await auditService.exportCsv();
      await downloadFile(csv, 'audit-export.csv', 'text/csv');
      setExportMessage('CSV export generated.');
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : 'Export failed.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPdf = async () => {
    try {
      setIsExporting(true);
      setExportMessage(null);
      const pdfPayload = await auditService.exportPdf();
      await downloadFile(pdfPayload, 'audit-export.pdf', 'application/pdf', 'base64');
      setExportMessage('PDF export generated.');
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : 'Export failed.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <ScrollView className="bg-bg px-4 py-4">
      <PageHeader
        title="Audit"
        subtitle="Event timeline for operational and AI actions."
        actions={
          <View className="flex-row gap-2">
            <AppButton label="Export CSV" size="sm" variant="secondary" loading={isExporting} onPress={() => void handleExportCsv()} />
            <AppButton label="Export PDF" size="sm" variant="secondary" loading={isExporting} onPress={() => void handleExportPdf()} />
          </View>
        }
      />

      <AppCard>
        {exportMessage ? <Text className="mb-3 text-small text-muted">{exportMessage}</Text> : null}
        {query.isLoading ? <Text className="text-small text-muted">Loading audit events...</Text> : null}
        {query.error ? (
          <View className="gap-3">
            <Text className="text-small text-error">{query.error.message}</Text>
            <AppButton label="Retry" size="sm" variant="secondary" onPress={() => void query.refetch()} />
          </View>
        ) : null}

        {!query.isLoading && !query.error ? (
          <AppTable>
            <AppTableRow header>
              <AppTableHeaderCell>Event</AppTableHeaderCell>
              <AppTableHeaderCell>Actor</AppTableHeaderCell>
              <AppTableHeaderCell>Action</AppTableHeaderCell>
              <AppTableHeaderCell>Created</AppTableHeaderCell>
              <AppTableHeaderCell align="right">Result</AppTableHeaderCell>
            </AppTableRow>

            {rows.map((row) => (
              <AppTableRow key={row.id}>
                <AppTableCell>
                  <Link href={`/audit/${row.id}`} asChild>
                    <Text className="text-small font-medium text-primary">{row.id.slice(0, 8).toUpperCase()}</Text>
                  </Link>
                </AppTableCell>
                <AppTableCell>{row.actorId ?? '-'}</AppTableCell>
                <AppTableCell>{row.action}</AppTableCell>
                <AppTableCell>{formatDate(row.createdAt)}</AppTableCell>
                <AppTableCell align="right">
                  <AppBadge
                    label={row.result}
                    tone={row.result === 'success' ? 'success' : row.result === 'warning' ? 'warning' : 'error'}
                  />
                </AppTableCell>
              </AppTableRow>
            ))}

            {rows.length === 0 ? (
              <AppTableRow>
                <AppTableCell className="min-w-full">
                  <Text className="text-small text-muted">No audit events found.</Text>
                </AppTableCell>
              </AppTableRow>
            ) : null}
          </AppTable>
        ) : null}
      </AppCard>
    </ScrollView>
  );
}
