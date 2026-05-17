import { Link } from 'expo-router';
import { PanelRightClose, PanelRightOpen } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

type AssistantPanelTab = 'chat' | 'approvals' | 'history';

type AssistantPanelShellProps = {
  activeTab: AssistantPanelTab;
  children: ReactNode;
  footer?: ReactNode;
  isHistoryOpen?: boolean;
  onToggleHistory?: () => void;
  subtitle?: string;
};

const ICON_PRIMARY = '#FF5C00';
const TAB_ACTIVE_COLOR = '#FF5C00';
const TAB_INACTIVE_COLOR = '#999999';
const TAB_ACTIVE_BORDER = '#FF5C00';

function TabItem({
  active,
  onPress,
  icon,
  children,
}: {
  active: boolean;
  onPress?: () => void;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 16,
        paddingVertical: 9,
        borderBottomWidth: 2,
        borderBottomColor: active ? TAB_ACTIVE_BORDER : 'transparent',
        marginBottom: -1,
      }}
    >
      {icon}
      <Text
        style={{
          fontSize: 13,
          fontWeight: active ? '500' : '400',
          color: active ? TAB_ACTIVE_COLOR : TAB_INACTIVE_COLOR,
        }}
      >
        {children}
      </Text>
    </Pressable>
  );
}

export function AssistantPanelShell({
  activeTab,
  children,
  footer,
  isHistoryOpen = false,
  onToggleHistory,
  subtitle = 'Ask about inventory, purchasing, products, reporting, or navigation.',
}: AssistantPanelShellProps) {
  const historyIcon = isHistoryOpen
    ? <PanelRightClose size={14} color={activeTab === 'chat' ? ICON_PRIMARY : TAB_INACTIVE_COLOR} />
    : <PanelRightOpen size={14} color={activeTab === 'chat' ? ICON_PRIMARY : TAB_INACTIVE_COLOR} />;

  return (
    <View className="flex-1 overflow-hidden bg-bg">
      {/* Sub-header: description + tabs */}
      <View
        style={{
          backgroundColor: '#FFFFFF',
          borderBottomWidth: 0.5,
          borderBottomColor: 'rgba(0,0,0,0.07)',
          paddingHorizontal: 22,
          paddingTop: 8,
        }}
      >
        <Text
          style={{
            fontSize: 12.5,
            color: '#999999',
            marginBottom: 8,
          }}
        >
          {subtitle}
        </Text>

        <View style={{ flexDirection: 'row' }}>
          {onToggleHistory ? (
            <TabItem
              active={activeTab === 'chat'}
              onPress={onToggleHistory}
              icon={historyIcon}
            >
              Chat
            </TabItem>
          ) : (
            <Link href="/ai" asChild>
              <TabItem active={activeTab === 'chat'} icon={historyIcon}>
                Chat
              </TabItem>
            </Link>
          )}

          <Link href="/ai/approvals" asChild>
            <TabItem active={activeTab === 'approvals'}>
              Approvals
            </TabItem>
          </Link>

          <Link href="/ai/history" asChild>
            <TabItem active={activeTab === 'history'}>
              History
            </TabItem>
          </Link>
        </View>
      </View>

      {children}
      {footer}
    </View>
  );
}
