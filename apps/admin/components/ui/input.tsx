import { Text, TextInput, TextInputProps, View } from 'react-native';

type InputProps = TextInputProps & {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  containerClassName?: string;
  inputClassName?: string;
  webId?: string;
  webName?: string;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function AppInput({
  label,
  hint,
  error,
  required = false,
  containerClassName,
  inputClassName,
  webId,
  webName,
  ...props
}: InputProps) {
  const hasError = Boolean(error);
  const accessibilityLabel = props.accessibilityLabel ?? label ?? props.placeholder ?? 'Input field';
  const accessibilityHint = props.accessibilityHint ?? error ?? hint;
  const resolvedId = webId ?? props.nativeID ?? slugify(label ?? props.placeholder ?? accessibilityLabel);
  const resolvedName = webName ?? slugify(label ?? props.placeholder ?? accessibilityLabel);
  const webFieldProps = {
    id: resolvedId,
    name: resolvedName,
  } as unknown as Record<string, string>;

  return (
    <View className={`gap-2 ${containerClassName ?? ''}`.trim()}>
      {label ? (
        <Text className="text-small font-medium text-text">
          {label}
          {required ? <Text className="text-error"> *</Text> : null}
        </Text>
      ) : null}

      <TextInput
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        nativeID={resolvedId}
        accessibilityState={{
          disabled: Boolean(props.editable === false),
          ...(props.accessibilityState ?? {}),
        }}
        placeholderTextColor="rgb(var(--text-subtle))"
        className={`${hasError ? 'border-error' : 'border-border'} rounded-md border bg-surface px-3 py-2.5 text-body text-text ${inputClassName ?? ''}`.trim()}
        {...webFieldProps}
        {...props}
      />

      {error ? <Text className="text-caption text-error">{error}</Text> : null}
      {!error && hint ? <Text className="text-caption text-subtle">{hint}</Text> : null}
    </View>
  );
}
