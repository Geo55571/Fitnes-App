import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import type { IconName } from '@/domain/exercises';
import { useStore } from '@/store/store';
import { colors, MAX_CONTENT_WIDTH, radius, space, tabular, type } from '@/theme';

import { Icon } from './Icon';
import { goBack } from './nav';

// ---------- layout ----------

interface ScreenProps {
  children: ReactNode;
  /** Rendered above the scroll area (e.g. a stack header). */
  header?: ReactNode;
  /** Pinned below the scroll area, above the keyboard. */
  footer?: ReactNode;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  /** Tab screens sit above the tab bar, which handles the bottom inset itself. */
  tab?: boolean;
}

export function Screen({ children, header, footer, scroll = true, contentStyle, tab }: ScreenProps) {
  const body = scroll ? (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.scrollContent, contentStyle]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
      showsVerticalScrollIndicator={false}>
      <View style={styles.column}>{children}</View>
    </ScrollView>
  ) : (
    <View style={[styles.flex, styles.column, contentStyle]}>{children}</View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={tab ? ['top', 'left', 'right'] : ['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {header ? <View style={styles.column}>{header}</View> : null}
        {body}
        {footer ? <View style={[styles.column, styles.footer]}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Tab-screen header: FORM wordmark, optional actions, avatar menu. */
export function AppHeader({ actions }: { actions?: ReactNode }) {
  return (
    <View style={styles.appHeader}>
      <Text style={type.wordmark} accessibilityRole="header">
        FORM
      </Text>
      <View style={styles.row}>
        {actions}
        <AvatarMenuButton />
      </View>
    </View>
  );
}

/** Stack-screen header with a back button. */
export function StackHeader({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <View style={styles.stackHeader}>
      <IconButton
        icon="chevron-left"
        label="Back"
        onPress={goBack}
      />
      <Text style={styles.stackTitle} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.stackRight}>{right}</View>
    </View>
  );
}

export function ScreenTitle({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <View style={styles.titleWrap}>
      <View style={styles.flex}>
        <Text style={type.title} accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

// ---------- avatar + menu ----------

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Me';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

export function PersonBadge({ name, color, size = 36, ring }: { name: string; color: string; size?: number; ring?: boolean }) {
  return (
    <View
      style={[
        styles.badge,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color },
        ring && styles.badgeRing,
      ]}>
      <Text style={[styles.badgeText, { fontSize: size * 0.38 }]}>{initials(name)}</Text>
    </View>
  );
}

function AvatarMenuButton() {
  const name = useStore((s) => s.profile.name);
  const color = useStore((s) => s.avatar.badgeColor);
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();

  const go = (path: '/profile' | '/settings' | '/avatar') => {
    setOpen(false);
    router.push(path);
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Open profile and settings"
        hitSlop={8}>
        <PersonBadge name={name} color={color} size={38} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setOpen(false)} accessibilityLabel="Close menu">
          <View style={[styles.menu, { top: insets.top + 56 }]}>
            <View style={styles.menuHead}>
              <PersonBadge name={name} color={color} size={34} />
              <Text style={type.bodyStrong} numberOfLines={1}>
                {name || 'You'}
              </Text>
            </View>
            <MenuItem icon="account-circle-outline" label="Profile" onPress={() => go('/profile')} />
            <MenuItem icon="tshirt-crew-outline" label="Customize avatar" onPress={() => go('/avatar')} />
            <MenuItem icon="cog-outline" label="Settings" onPress={() => go('/settings')} />
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

function MenuItem({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.menuItem, pressed && styles.pressedBg]}
      accessibilityRole="menuitem">
      <Icon name={icon} size={20} color={colors.textSecondary} />
      <Text style={type.body}>{label}</Text>
    </Pressable>
  );
}

// ---------- surfaces ----------

export function Card({ children, style, padded = true }: { children: ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean }) {
  return <View style={[styles.card, padded && styles.cardPad, style]}>{children}</View>;
}

export function SectionHeader({
  title,
  right,
  onRightPress,
  style,
}: {
  title: string;
  right?: string;
  onRightPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.sectionHeader, style]}>
      <Text style={type.section}>{title}</Text>
      {right ? (
        onRightPress ? (
          <Pressable onPress={onRightPress} hitSlop={10} accessibilityRole="button">
            <Text style={styles.link}>{right}</Text>
          </Pressable>
        ) : (
          <Text style={type.small}>{right}</Text>
        )
      ) : null}
    </View>
  );
}

export function Divider({ inset = 0 }: { inset?: number }) {
  return <View style={[styles.divider, { marginLeft: inset }]} />;
}

export function Tag({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'green' | 'coral' }) {
  const bg = tone === 'green' ? colors.primarySoft : tone === 'coral' ? colors.coralSoft : colors.surfaceMuted;
  const fg = tone === 'green' ? colors.primary : tone === 'coral' ? colors.danger : colors.textSecondary;
  return (
    <View style={[styles.tag, { backgroundColor: bg }]}>
      <Text style={[styles.tagText, { color: fg }]}>{label}</Text>
    </View>
  );
}

// ---------- controls ----------

interface ButtonProps {
  label: string;
  onPress: () => void;
  icon?: IconName;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}

export function Button({ label, onPress, icon, variant = 'primary', disabled, style, compact }: ButtonProps) {
  const fg =
    variant === 'primary' ? colors.onPrimary : variant === 'danger' ? colors.danger : variant === 'ghost' ? colors.primary : colors.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        variant === 'primary' && { backgroundColor: pressed ? colors.primaryPressed : colors.primary },
        variant === 'secondary' && { backgroundColor: pressed ? colors.border : colors.surfaceMuted },
        variant === 'danger' && { backgroundColor: pressed ? colors.coralSoft : colors.surface, borderWidth: 1, borderColor: colors.border },
        variant === 'ghost' && pressed && { backgroundColor: colors.primaryTint },
        disabled && styles.disabled,
        style,
      ]}>
      {icon ? <Icon name={icon} size={compact ? 18 : 21} color={fg} /> : null}
      <Text style={[styles.buttonText, compact && styles.buttonTextCompact, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
  color = colors.text,
  size = 22,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  color?: string;
  size?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => [styles.iconButton, pressed && styles.pressedBg]}>
      <Icon name={icon} size={size} color={color} />
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  onLongPress,
  icon,
  iconColor,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  icon?: IconName;
  iconColor?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [styles.chip, selected && styles.chipOn, pressed && !selected && styles.pressedBg]}>
      {icon ? <Icon name={icon} size={17} color={selected ? colors.onPrimary : iconColor ?? colors.text} /> : null}
      <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; icon?: IconName }[];
  value: T;
  onChange: (v: T) => void;
}) {
  // Icons are dropped on narrow phones so labels stay readable.
  const { width } = useWindowDimensions();
  const showIcons = width >= 360;
  return (
    <View style={styles.segmented} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={[styles.segment, on && styles.segmentOn]}>
            {o.icon && showIcons ? <Icon name={o.icon} size={18} color={on ? colors.onPrimary : colors.text} /> : null}
            <Text style={[styles.segmentText, on && styles.segmentTextOn]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ProgressBar({ fraction, done, style }: { fraction: number; done?: boolean; style?: StyleProp<ViewStyle> }) {
  const f = Math.max(0, Math.min(1, fraction));
  return (
    <View style={[styles.track, style]} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(f * 100) }}>
      <View style={[styles.fill, { width: `${f * 100}%` }, done && styles.fillDone]} />
    </View>
  );
}

export function Field({
  label,
  hint,
  error,
  style,
  inputStyle,
  suffix,
  ...input
}: Omit<TextInputProps, 'style'> & {
  label?: string;
  hint?: string;
  error?: string;
  suffix?: string;
  style?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={style}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <View style={[styles.inputWrap, !!error && styles.inputError, inputStyle]}>
        <TextInput
          placeholderTextColor={colors.textTertiary}
          style={[styles.input, tabular]}
          accessibilityLabel={input.accessibilityLabel ?? label}
          {...input}
        />
        {suffix ? <Text style={styles.suffix}>{suffix}</Text> : null}
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

/** Compact numeric cell used in set tables. */
export function NumberCell({
  value,
  onChangeText,
  label,
  invalid,
  decimal,
}: {
  value: string;
  onChangeText: (t: string) => void;
  label: string;
  invalid?: boolean;
  decimal?: boolean;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
      inputMode={decimal ? 'decimal' : 'numeric'}
      accessibilityLabel={label}
      placeholder="–"
      placeholderTextColor={colors.textTertiary}
      selectTextOnFocus
      maxLength={7}
      style={[styles.cell, tabular, invalid && styles.inputError]}
    />
  );
}

export function ListRow({
  icon,
  iconColor,
  title,
  subtitle,
  right,
  onPress,
  leading,
  chevron = !!onPress,
}: {
  icon?: IconName;
  iconColor?: string;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onPress?: () => void;
  leading?: ReactNode;
  chevron?: boolean;
}) {
  const content = (
    <>
      {leading ?? (icon ? <View style={styles.rowIcon}><Icon name={icon} size={22} color={iconColor ?? colors.text} /></View> : null)}
      <View style={styles.flex}>
        <Text style={type.body} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[type.small, styles.rowSub]} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {typeof right === 'string' ? <Text style={[type.bodyStrong, tabular]}>{right}</Text> : right}
      {chevron ? <Icon name="chevron-right" size={20} color={colors.textTertiary} /> : null}
    </>
  );
  if (!onPress) return <View style={styles.listRow}>{content}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.listRow, pressed && styles.pressedBg]}>
      {content}
    </Pressable>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: IconName; title: string; body?: string; action?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <Icon name={icon} size={26} color={colors.textTertiary} />
      <Text style={[type.bodyStrong, styles.center]}>{title}</Text>
      {body ? <Text style={[type.small, styles.center]}>{body}</Text> : null}
      {action}
    </View>
  );
}

export function Notice({ icon = 'lock-outline', children }: { icon?: IconName; children: ReactNode }) {
  return (
    <View style={styles.notice}>
      <Icon name={icon} size={18} color={colors.textSecondary} />
      <Text style={[type.small, styles.flex]}>{children}</Text>
    </View>
  );
}

/** Bottom sheet used for pickers. */
export function Sheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetRoot}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetKav}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + space.md }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHead}>
              <Text style={type.section}>{title}</Text>
              <IconButton icon="close" label="Close" onPress={onClose} />
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              style={styles.sheetScroll}
              contentContainerStyle={styles.sheetContent}
              showsVerticalScrollIndicator>
              {children}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

export const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  screen: { flex: 1, backgroundColor: colors.bg },
  column: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center', paddingHorizontal: space.lg },
  scrollContent: { paddingBottom: space.xxl },
  footer: { paddingTop: space.sm, paddingBottom: space.sm },
  appHeader: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stackHeader: { height: 52, flexDirection: 'row', alignItems: 'center', gap: space.xs, marginLeft: -space.sm },
  stackTitle: { flex: 1, fontSize: 17, fontWeight: '600', color: colors.text },
  stackRight: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  titleWrap: { flexDirection: 'row', alignItems: 'flex-end', marginTop: space.xs, marginBottom: space.lg, gap: space.md },
  subtitle: { fontSize: 16, color: colors.textSecondary, marginTop: 2 },
  badge: { alignItems: 'center', justifyContent: 'center' },
  badgeRing: { borderWidth: 2, borderColor: colors.surface },
  badgeText: { color: '#fff', fontWeight: '700' },
  menuBackdrop: { flex: 1, backgroundColor: 'rgba(20,22,21,0.12)' },
  menu: {
    position: 'absolute',
    right: space.lg,
    width: 232,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: space.sm,
    boxShadow: '0 6px 18px rgba(0,0,0,0.1)',
  },
  menuHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
    marginBottom: space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, height: 46 },
  pressedBg: { backgroundColor: colors.surfaceMuted },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardPad: { padding: space.lg },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.md },
  link: { fontSize: 14, color: colors.textSecondary, fontWeight: '500' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  tag: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.pill, alignSelf: 'center' },
  tagText: { fontSize: 11, fontWeight: '600', letterSpacing: 0.2 },
  button: {
    height: 52,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
  },
  buttonCompact: { height: 40, borderRadius: radius.sm + 2, paddingHorizontal: space.md },
  buttonText: { fontSize: 17, fontWeight: '600' },
  buttonTextCompact: { fontSize: 15 },
  disabled: { opacity: 0.45 },
  iconButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 38,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 14, color: colors.text, fontWeight: '500' },
  chipTextOn: { color: colors.onPrimary },
  chipRow: { gap: space.sm, paddingRight: space.lg },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 3,
  },
  segment: {
    flex: 1,
    height: 44,
    borderRadius: radius.sm + 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 4,
  },
  segmentOn: { backgroundColor: colors.primary },
  segmentText: { fontSize: 14, fontWeight: '500', color: colors.text, flexShrink: 1 },
  segmentTextOn: { color: colors.onPrimary, fontWeight: '600' },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.track, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3, backgroundColor: colors.primary },
  fillDone: { backgroundColor: colors.primary },
  fieldLabel: { fontSize: 13, fontWeight: '500', color: colors.textSecondary, marginBottom: 6 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
  },
  input: { flex: 1, fontSize: 16, color: colors.text, paddingVertical: 12, minWidth: 0 },
  inputError: { borderColor: colors.coral },
  suffix: { fontSize: 15, color: colors.textSecondary, marginLeft: 6 },
  errorText: { fontSize: 12, color: colors.danger, marginTop: 4 },
  hint: { fontSize: 12, color: colors.textTertiary, marginTop: 4 },
  cell: {
    flex: 1,
    height: 44,
    borderRadius: radius.sm + 2,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    textAlign: 'center',
    fontSize: 17,
    color: colors.text,
    minWidth: 0,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 56,
    paddingVertical: 10,
    paddingHorizontal: space.lg,
  },
  rowIcon: { width: 28, alignItems: 'center' },
  rowSub: { marginTop: 2 },
  empty: { alignItems: 'center', gap: 6, paddingVertical: space.xl, paddingHorizontal: space.lg },
  notice: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'flex-start',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: space.md,
  },
  sheetRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(20,22,21,0.3)' },
  // The sheet is capped at 88% of the screen; it and its list must be allowed to shrink so long
  // content scrolls inside the sheet instead of running off the screen.
  sheetKav: { width: '100%', maxHeight: '88%', flexShrink: 1 },
  sheet: {
    flexShrink: 1,
    maxHeight: '100%',
    backgroundColor: colors.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: space.sm,
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH + 40,
    alignSelf: 'center',
  },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, alignSelf: 'center' },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: space.lg,
    paddingRight: space.sm,
    paddingVertical: space.xs,
  },
  sheetScroll: { flexGrow: 0, flexShrink: 1 },
  sheetContent: { paddingHorizontal: space.lg, paddingBottom: space.lg },
});
