import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';

import { COLORS } from '@/constants/colors';
import { useAuth, syncProfile } from '@/lib/auth';
import { getProfile, type Role } from '@/lib/profiles';

import ManageUsers from './admin/ManageUsers';
import ManageEvents from './admin/ManageEvents';
import Attendance from './admin/Attendance';
import Reports from './admin/Reports';

type AdminRole = Role | 'admin';
type Section = 'users' | 'events' | 'attendance' | 'reports';

const SECTIONS: { key: Section; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'users',      label: 'Manage Users',      icon: 'people-outline' },
  { key: 'events',     label: 'Manage Events',     icon: 'calendar-outline' },
  { key: 'attendance', label: 'Attendance',        icon: 'checkmark-done-outline' },
  { key: 'reports',    label: 'Reports',           icon: 'bar-chart-outline' },
];

export default function AdminScreen() {
  const { user, session } = useAuth();
  const [role, setRole] = useState<AdminRole | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);
  const [section, setSection] = useState<Section>('users');

  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (!user) {
        setRoleLoading(false);
        return () => { active = false; };
      }
      (async () => {
        let profile = await getProfile(user.id);
        const metadataRole =
          (session?.user?.user_metadata?.role as AdminRole | undefined) ?? null;

        if ((profile?.role ?? 'student') !== 'admin' && metadataRole === 'admin') {
          await syncProfile(session);
          profile = await getProfile(user.id);
        }
        if (!active) return;
        setRole(profile?.role ?? metadataRole ?? 'student');
        setRoleLoading(false);
      })();
      return () => { active = false; };
    }, [user, session])
  );

  if (roleLoading) {
    return (
      <View style={styles.gateContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.gateText}>Checking your account...</Text>
      </View>
    );
  }

  if (role !== 'admin') {
    return (
      <View style={styles.gateContainer}>
        <Ionicons name="shield-outline" size={48} color={COLORS.textSecondary} />
        <Text style={styles.gateTitle}>Admins Only</Text>
        <Text style={styles.gateText}>
          Only administrator accounts can open this screen.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.headerTitle}>Admin Dashboard</Text>

      {/* Segmented control */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabRow}
      >
        {SECTIONS.map((s) => {
          const active = section === s.key;
          return (
            <Pressable
              key={s.key}
              onPress={() => setSection(s.key)}
              style={[styles.tab, active && styles.tabActive]}
            >
              <Ionicons
                name={s.icon}
                size={16}
                color={active ? '#FFFFFF' : COLORS.textSecondary}
              />
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {s.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={{ flex: 1 }}>
        {section === 'users'      && <ManageUsers />}
        {section === 'events'     && <ManageEvents />}
        {section === 'attendance' && <Attendance />}
        {section === 'reports'    && <Reports />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 8,
  },
  tabRow: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    marginRight: 8,
  },
  tabActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  tabTextActive: { color: '#FFFFFF' },
  gateContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  gateTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: 12,
  },
  gateText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 6,
  },
});