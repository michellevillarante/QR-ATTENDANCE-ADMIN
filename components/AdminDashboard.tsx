import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import AppButton from '@/components/AppButton';
import AppTextInput from '@/components/AppTextInput';
import {
  deleteAdminAttendance,
  deleteAdminEvent,
  getAdministratorData,
  updateAdminAttendance,
  updateAdminEvent,
  updateAdminUser,
  type AdministratorData,
} from '@/lib/admin';
import { createEvent } from '@/lib/events';
import { useAuth } from '@/lib/auth';
import type { Role } from '@/lib/profiles';
import { buildQRPayload } from '@/lib/qr';
import { useTheme } from '@/lib/theme';
import type { Palette, Radius } from '@/constants/themes';

type Section = 'users' | 'events' | 'attendance' | 'reports';

const SECTIONS: { key: Section; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'users', label: 'Users', icon: 'people-outline' },
  { key: 'events', label: 'Events', icon: 'calendar-outline' },
  { key: 'attendance', label: 'Attendance', icon: 'checkmark-done-outline' },
  { key: 'reports', label: 'Reports', icon: 'stats-chart-outline' },
];

const ROLES: Role[] = ['student', 'teacher', 'admin'];

type UserDraft = { name: string; role: Role };
type EventDraft = {
  code: string;
  title: string;
  start: string;
  end: string;
};

export default function AdminDashboard() {
  const { user } = useAuth();
  const { colors, radius } = useTheme();
  const styles = makeStyles(colors, radius);
  const [section, setSection] = useState<Section>('users');
  const [data, setData] = useState<AdministratorData | null>(null);
  const [userDrafts, setUserDrafts] = useState<Record<string, UserDraft>>({});
  const [eventDrafts, setEventDrafts] = useState<Record<string, EventDraft>>({});
  const [attendanceDrafts, setAttendanceDrafts] = useState<Record<string, string>>({});
  const [newEventCode, setNewEventCode] = useState('');
  const [newEventTitle, setNewEventTitle] = useState('');
  const [qrPayload, setQrPayload] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await getAdministratorData();
      setData(next);
      setUserDrafts(
        Object.fromEntries(
          next.users.map((item) => [
            item.id,
            { name: item.full_name ?? '', role: item.role },
          ])
        )
      );
      setEventDrafts(
        Object.fromEntries(
          next.events.map((item) => [
            item.id,
            {
              code: item.event_code,
              title: item.title,
              start: item.start_time ?? '',
              end: item.end_time ?? '',
            },
          ])
        )
      );
      setAttendanceDrafts(
        Object.fromEntries(next.attendance.map((item) => [item.id, item.scanned_at]))
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const perform = async (action: () => Promise<void>) => {
    setSaving(true);
    setError(null);
    try {
      await action();
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const saveUser = (userId: string) => {
    const draft = userDrafts[userId];
    if (!draft) return;
    void perform(() => updateAdminUser(userId, draft.name, draft.role));
  };

  const saveEvent = (eventId: string) => {
    const draft = eventDrafts[eventId];
    if (!draft) return;
    void perform(() =>
      updateAdminEvent(eventId, {
        event_code: draft.code,
        title: draft.title,
        start_time: toTimestampOrNull(draft.start),
        end_time: toTimestampOrNull(draft.end),
      })
    );
  };

  const addEvent = () => {
    const eventId = newEventCode.trim();
    const title = newEventTitle.trim();
    if (!eventId || !title) {
      setError('Event title and code are required.');
      return;
    }
    void perform(async () => {
      const result = await createEvent({ eventId, title, start: '', end: '' });
      if (result.error) throw new Error(result.error);
      setQrPayload(buildQRPayload({ eventId, title }));
      setNewEventCode('');
      setNewEventTitle('');
    });
  };

  const confirmDeleteEvent = (eventId: string, title: string) => {
    Alert.alert(
      'Delete event?',
      `Deleting "${title}" also removes its attendance records.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => void perform(() => deleteAdminEvent(eventId)),
        },
      ]
    );
  };

  const confirmDeleteAttendance = (id: string) => {
    Alert.alert('Delete attendance record?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => void perform(() => deleteAdminAttendance(id)),
      },
    ]);
  };

  const saveAttendance = (id: string) => {
    const scannedAt = attendanceDrafts[id];
    if (!scannedAt) {
      setError('Enter a valid attendance date and time.');
      return;
    }
    void perform(() => updateAdminAttendance(id, scannedAt));
  };

  const attendanceByEvent = new Map<string, number>();
  data?.attendance.forEach((record) => {
    attendanceByEvent.set(
      record.event_id,
      (attendanceByEvent.get(record.event_id) ?? 0) + 1
    );
  });

  if (loading && !data) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.muted}>Loading administrator records...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.introCard}>
        <View style={styles.introIcon}>
          <Ionicons name="shield-checkmark-outline" size={22} color={colors.primary} />
        </View>
        <View style={styles.introText}>
          <Text style={styles.title}>Administrator Console</Text>
          <Text style={styles.subtitle}>Manage users, events, and attendance records.</Text>
        </View>
      </View>

      {error ? (
        <View style={styles.errorCard}>
          <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <View style={styles.sectionRow}>
        {SECTIONS.map((item) => {
          const active = section === item.key;
          return (
            <Pressable
              key={item.key}
              style={[styles.sectionButton, active && styles.sectionButtonActive]}
              onPress={() => setSection(item.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Ionicons
                name={item.icon}
                size={15}
                color={active ? colors.textOnPrimary : colors.muted}
              />
              <Text style={[styles.sectionText, active && styles.sectionTextActive]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {loading && data ? (
        <ActivityIndicator size="small" color={colors.primary} style={styles.refreshing} />
      ) : null}

      {!data ? (
        <AppButton
          title="Retry"
          icon="refresh-outline"
          variant="outline"
          disabled={loading}
          onPress={() => void refresh()}
        />
      ) : section === 'users' ? (
        <View>
          <SectionHeading title="Manage users" count={data.users.length} styles={styles} />
          {data.users.map((item) => {
            const draft = userDrafts[item.id] ?? {
              name: item.full_name ?? '',
              role: item.role,
            };
            return (
              <View key={item.id} style={styles.card}>
                <Text style={styles.cardTitle}>{item.email}</Text>
                <Text style={styles.metaText}>{item.id}</Text>
                <Text style={styles.label}>Name</Text>
                <AppTextInput
                  value={draft.name}
                  onChangeText={(name) =>
                    setUserDrafts((previous) => ({
                      ...previous,
                      [item.id]: { ...draft, name },
                    }))
                  }
                  placeholder="Full name"
                  placeholderTextColor={colors.muted}
                  editable={!saving}
                />
                <Text style={styles.label}>Role</Text>
                <View style={styles.chipRow}>
                  {ROLES.map((role) => (
                    <Pressable
                      key={role}
                      disabled={saving || item.id === user?.id}
                      style={[
                        styles.chip,
                        draft.role === role && styles.chipActive,
                        item.id === user?.id && styles.disabled,
                      ]}
                      onPress={() =>
                        setUserDrafts((previous) => ({
                          ...previous,
                          [item.id]: { ...draft, role },
                        }))
                      }
                    >
                      <Text
                        style={[
                          styles.chipText,
                          draft.role === role && styles.chipTextActive,
                        ]}
                      >
                        {capitalize(role)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                {item.id === user?.id ? (
                  <Text style={styles.metaText}>Your own administrator role is locked here.</Text>
                ) : null}
                <AppButton
                  title="Save User"
                  icon="save-outline"
                  variant="outline"
                  compact
                  disabled={saving}
                  onPress={() => saveUser(item.id)}
                />
              </View>
            );
          })}
        </View>
      ) : section === 'events' ? (
        <View>
          <SectionHeading title="Manage events" count={data.events.length} styles={styles} />
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Create event</Text>
            <Text style={styles.label}>Event title</Text>
            <AppTextInput
              value={newEventTitle}
              onChangeText={setNewEventTitle}
              placeholder="e.g. School Assembly"
              placeholderTextColor={colors.muted}
              editable={!saving}
            />
            <Text style={styles.label}>Event code</Text>
            <AppTextInput
              value={newEventCode}
              onChangeText={setNewEventCode}
              placeholder="e.g. EVT-2026-0001"
              placeholderTextColor={colors.muted}
              autoCapitalize="characters"
              editable={!saving}
            />
            <AppButton
              title="Create Event"
              icon="add-circle-outline"
              theme="primary"
              disabled={saving}
              onPress={addEvent}
            />
          </View>
          {qrPayload ? (
            <View style={styles.qrCard}>
              <Text style={styles.cardTitle}>New event QR code</Text>
              <QRCode value={qrPayload} size={180} />
              <Text style={styles.metaText} selectable>{qrPayload}</Text>
            </View>
          ) : null}
          {data.events.map((item) => {
            const draft = eventDrafts[item.id] ?? {
              code: item.event_code,
              title: item.title,
              start: item.start_time ?? '',
              end: item.end_time ?? '',
            };
            return (
              <View key={item.id} style={styles.card}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.label}>Event code</Text>
                <AppTextInput
                  value={draft.code}
                  onChangeText={(code) =>
                    setEventDrafts((previous) => ({
                      ...previous,
                      [item.id]: { ...draft, code },
                    }))
                  }
                  placeholder="Event code"
                  placeholderTextColor={colors.muted}
                  editable={!saving}
                />
                <Text style={styles.label}>Title</Text>
                <AppTextInput
                  value={draft.title}
                  onChangeText={(title) =>
                    setEventDrafts((previous) => ({
                      ...previous,
                      [item.id]: { ...draft, title },
                    }))
                  }
                  placeholder="Event title"
                  placeholderTextColor={colors.muted}
                  editable={!saving}
                />
                <Text style={styles.label}>Start / end (ISO date-time, optional)</Text>
                <AppTextInput
                  value={draft.start}
                  onChangeText={(start) =>
                    setEventDrafts((previous) => ({
                      ...previous,
                      [item.id]: { ...draft, start },
                    }))
                  }
                  placeholder="Start, for example 2026-10-19T09:00:00Z"
                  placeholderTextColor={colors.muted}
                  autoCapitalize="none"
                  editable={!saving}
                />
                <AppTextInput
                  value={draft.end}
                  onChangeText={(end) =>
                    setEventDrafts((previous) => ({
                      ...previous,
                      [item.id]: { ...draft, end },
                    }))
                  }
                  placeholder="End (optional)"
                  placeholderTextColor={colors.muted}
                  autoCapitalize="none"
                  editable={!saving}
                />
                <Text style={styles.metaText}>
                  {attendanceByEvent.get(item.id) ?? 0} attendance records
                </Text>
                <View style={styles.buttonRow}>
                  <View style={styles.buttonHalf}>
                    <AppButton
                      title="Save"
                      icon="save-outline"
                      variant="outline"
                      compact
                      disabled={saving}
                      onPress={() => saveEvent(item.id)}
                    />
                  </View>
                  <View style={styles.buttonHalf}>
                    <AppButton
                      title="Show QR"
                      icon="qr-code-outline"
                      variant="secondary"
                      compact
                      disabled={saving}
                      onPress={() =>
                        setQrPayload(
                          buildQRPayload({
                            eventId: draft.code,
                            title: draft.title,
                            start: draft.start || undefined,
                            end: draft.end || undefined,
                          })
                        )
                      }
                    />
                  </View>
                </View>
                <AppButton
                  title="Delete Event"
                  icon="trash-outline"
                  variant="danger"
                  compact
                  disabled={saving}
                  onPress={() => confirmDeleteEvent(item.id, item.title)}
                />
              </View>
            );
          })}
        </View>
      ) : section === 'attendance' ? (
        <View>
          <SectionHeading
            title="Overall attendance"
            count={data.attendance.length}
            styles={styles}
          />
          {data.attendance.map((item) => (
            <View key={item.id} style={styles.card}>
              <Text style={styles.cardTitle}>{item.event_title}</Text>
              <Text style={styles.metaText}>Code: {item.event_code}</Text>
              <Text style={styles.bodyText}>
                Student: {item.student_name || shortId(item.student_id)}
              </Text>
              <Text style={styles.metaText}>Student ID: {item.student_id}</Text>
              <Text style={styles.label}>Attendance date and time (ISO)</Text>
              <AppTextInput
                value={attendanceDrafts[item.id] ?? item.scanned_at}
                onChangeText={(scannedAt) =>
                  setAttendanceDrafts((previous) => ({
                    ...previous,
                    [item.id]: scannedAt,
                  }))
                }
                placeholder="2026-10-19T09:00:00Z"
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                editable={!saving}
              />
              <View style={styles.buttonRow}>
                <View style={styles.buttonHalf}>
                  <AppButton
                    title="Correct"
                    icon="create-outline"
                    variant="outline"
                    compact
                    disabled={saving}
                    onPress={() => saveAttendance(item.id)}
                  />
                </View>
                <View style={styles.buttonHalf}>
                  <AppButton
                    title="Remove"
                    icon="trash-outline"
                    variant="danger"
                    compact
                    disabled={saving}
                    onPress={() => confirmDeleteAttendance(item.id)}
                  />
                </View>
              </View>
            </View>
          ))}
          {data.attendance.length === 0 ? <EmptyMessage text="No attendance records yet." styles={styles} /> : null}
        </View>
      ) : (
        <View>
          <SectionHeading title="System reports" count={data.attendance.length} styles={styles} />
          <View style={styles.statsRow}>
            <StatCard label="Users" value={data.users.length} styles={styles} />
            <StatCard label="Events" value={data.events.length} styles={styles} />
            <StatCard label="Attendance" value={data.attendance.length} styles={styles} />
          </View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Attendance by event</Text>
            {data.events.map((item) => (
              <View key={item.id} style={styles.reportRow}>
                <View style={styles.reportText}>
                  <Text style={styles.bodyText}>{item.title}</Text>
                  <Text style={styles.metaText}>{item.event_code}</Text>
                </View>
                <Text style={styles.reportCount}>
                  {attendanceByEvent.get(item.id) ?? 0}
                </Text>
              </View>
            ))}
            {data.events.length === 0 ? (
              <Text style={styles.metaText}>No event reports available.</Text>
            ) : null}
          </View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Latest system records</Text>
            {data.attendance.slice(0, 10).map((item) => (
              <View key={item.id} style={styles.reportRow}>
                <View style={styles.reportText}>
                  <Text style={styles.bodyText}>{item.event_title}</Text>
                  <Text style={styles.metaText}>
                    {item.student_name || shortId(item.student_id)}
                  </Text>
                </View>
                <Text style={styles.metaText}>{formatDate(item.scanned_at)}</Text>
              </View>
            ))}
            {data.attendance.length === 0 ? (
              <Text style={styles.metaText}>No system records available.</Text>
            ) : null}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

function SectionHeading({
  title,
  count,
  styles,
}: {
  title: string;
  count: number;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.sectionHeading}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.count}>{count}</Text>
    </View>
  );
}

function StatCard({
  label,
  value,
  styles,
}: {
  label: string;
  value: number;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.metaText}>{label}</Text>
    </View>
  );
}

function EmptyMessage({
  text,
  styles,
}: {
  text: string;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.emptyCard}>
      <Text style={styles.muted}>{text}</Text>
    </View>
  );
}

function toTimestampOrNull(value: string): string | null {
  if (!value.trim()) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error('Enter valid ISO date and time values for the event.');
  }
  return date.toISOString();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected error occurred.';
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function shortId(value: string): string {
  return `...${value.slice(-8)}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : value;
}

const makeStyles = (c: Palette, r: Radius) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    content: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 40 },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.background,
    },
    introCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.card,
      borderRadius: r.card,
      borderWidth: 1,
      borderColor: c.border,
      padding: 16,
      marginBottom: 14,
    },
    introIcon: {
      width: 46,
      height: 46,
      borderRadius: 14,
      backgroundColor: c.tint,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    introText: { flex: 1 },
    title: { fontSize: 18, fontWeight: '800', color: c.textPrimary },
    subtitle: { fontSize: 13, color: c.textSecondary, lineHeight: 18, marginTop: 3 },
    errorCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.danger + '14',
      borderColor: c.danger + '4D',
      borderWidth: 1,
      borderRadius: r.input,
      padding: 12,
      marginBottom: 14,
    },
    errorText: { flex: 1, color: c.danger, fontSize: 13, marginLeft: 8 },
    sectionRow: { flexDirection: 'row', gap: 6, marginBottom: 16 },
    sectionButton: {
      flex: 1,
      minHeight: 42,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      borderRadius: r.chip,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
      paddingHorizontal: 5,
    },
    sectionButtonActive: { backgroundColor: c.primary, borderColor: c.primary },
    sectionText: { fontSize: 11, fontWeight: '700', color: c.muted },
    sectionTextActive: { color: c.textOnPrimary },
    refreshing: { marginBottom: 12 },
    sectionHeading: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    sectionTitle: { fontSize: 17, fontWeight: '800', color: c.textPrimary },
    count: {
      color: c.primary,
      backgroundColor: c.tint,
      overflow: 'hidden',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: r.chip,
      fontWeight: '800',
    },
    card: {
      backgroundColor: c.card,
      borderRadius: r.card,
      borderWidth: 1,
      borderColor: c.border,
      padding: 15,
      marginBottom: 12,
    },
    cardTitle: { color: c.textPrimary, fontSize: 15, fontWeight: '800' },
    label: {
      fontSize: 11,
      fontWeight: '800',
      color: c.muted,
      marginBottom: 6,
      marginTop: 12,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    metaText: { color: c.muted, fontSize: 11, marginTop: 5 },
    bodyText: { color: c.textPrimary, fontSize: 13, marginTop: 7 },
    chipRow: { flexDirection: 'row', gap: 7, marginTop: 3, marginBottom: 12 },
    chip: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: r.chip,
      paddingHorizontal: 12,
      paddingVertical: 7,
      backgroundColor: c.surface,
    },
    chipActive: { backgroundColor: c.tint, borderColor: c.primary },
    chipText: { color: c.muted, fontSize: 12, fontWeight: '700' },
    chipTextActive: { color: c.primary },
    disabled: { opacity: 0.55 },
    buttonRow: { flexDirection: 'row', gap: 10 },
    buttonHalf: { flex: 1 },
    qrCard: {
      backgroundColor: c.card,
      borderRadius: r.card,
      borderWidth: 1,
      borderColor: c.border,
      padding: 18,
      alignItems: 'center',
      gap: 12,
      marginBottom: 12,
    },
    statsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
    statCard: {
      flex: 1,
      alignItems: 'center',
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: r.card,
      padding: 12,
    },
    statValue: { color: c.primary, fontSize: 20, fontWeight: '900' },
    reportRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      paddingVertical: 9,
      gap: 10,
    },
    reportText: { flex: 1 },
    reportCount: { color: c.primary, fontWeight: '900', fontSize: 16 },
    emptyCard: {
      alignItems: 'center',
      backgroundColor: c.card,
      borderRadius: r.card,
      padding: 20,
      borderWidth: 1,
      borderColor: c.border,
    },
    muted: { color: c.muted, fontSize: 13, marginTop: 9 },
  });
