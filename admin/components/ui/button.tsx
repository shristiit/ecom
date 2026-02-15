import { ActivityIndicator, Pressable, PressableProps, Text, View } from 'react-native';
import type { ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

type ButtonProps = PressableProps & {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
  className?: string;
  textClassName?: string;
};

const variantClass: Record<ButtonVariant, string> = {
  primary: 'bg-primary border border-primary active:bg-primary-active',
  secondary: 'bg-surface border border-border active:bg-surface-2',
  tertiary: 'bg-transparent border border-transparent active:bg-primary-tint',
  danger: 'bg-error border border-error active:opacity-90',
};

const textVariantClass: Record<ButtonVariant, string> = {
  primary: 'text-on-primary',
  secondary: 'text-text',
  tertiary: 'text-primary',
  danger: 'text-white',
};

const spinnerColorByVariant: Record<ButtonVariant, string> = {
  primary: '#FFFFFF',
  secondary: '#111827',
  tertiary: '#1F3A5F',
  danger: '#FFFFFF',
};

const sizeClass: Record<ButtonSize, string> = {
  sm: 'min-h-9 px-3 py-2 rounded-sm',
  md: 'min-h-10 px-4 py-2.5 rounded-md',
  lg: 'min-h-12 px-5 py-3 rounded-lg',
};

const textSizeClass: Record<ButtonSize, string> = {
  sm: 'text-small',
  md: 'text-body',
  lg: 'text-section',
};

export function AppButton({
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  leftIcon,
  rightIcon,
  fullWidth = false,
  disabled,
  className,
  textClassName,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      className={`${variantClass[variant]} ${sizeClass[size]} ${fullWidth ? 'w-full' : ''} items-center justify-center ${isDisabled ? 'opacity-50' : ''} ${className ?? ''}`.trim()}
      {...props}
    >
      <View className="flex-row items-center gap-2">
        {loading ? <ActivityIndicator size="small" color={spinnerColorByVariant[variant]} /> : leftIcon}
        <Text className={`${textVariantClass[variant]} ${textSizeClass[size]} font-semibold ${textClassName ?? ''}`.trim()}>
          {label}
        </Text>
        {!loading ? rightIcon : null}
      </View>
    </Pressable>
  );
}
