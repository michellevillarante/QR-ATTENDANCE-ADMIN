import { useCallback, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import AppButton from '@/components/AppButton';
import { COLORS } from '@/constants/colors';
import { useAuth, signOut, syncProfile } from '@/lib/auth';
import {
  getProfile,
  updateProfile,
  type Profile,
  type Role,
} from '@/lib/profiles';
import { supabase } from '@/lib/supabase';

export default function ProfileScreen() {
  const { user, session } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const loadProfile = useCallback(async () => {
    if (!user) return;
    // Self-heal first: apply the signup intent / metadata if the row is stale
    // (e.g. an account created before the role fix), then show the DB truth.
    await syncProfile(session);
    const p = await getProfile(user.id);
    setProfile(p);
    setDraftName(p?.full_name ?? '');
  }, [user, session]);

  const metadataRole =
    (session?.user?.user_metadata?.role as Role | 'admin' | undefined) ?? null;

// Prefer the DB row; fall back to metadata; never downgrade admin to student.
const effectiveRole: Role | 'admin' =
  profile?.role ?? metadataRole ?? 'student';

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile])
  );

  const handleSaveName = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await updateProfile(user.id, {
      full_name: draftName.trim(),
    });
    setSaving(false);
    if (error) {
      Alert.alert('Error', error);
    } else {
      setProfile((prev) =>
        prev ? { ...prev, full_name: draftName.trim() } : prev
      );
      setEditing(false);
    }
  };

  const handleSwitchRole = async () => {
    if (!user || !profile) return;
    if (effectiveRole === 'admin') {
      Alert.alert('Not allowed', 'Admin role is managed by an administrator.');
      return;
    }
    const next: Role = effectiveRole === 'teacher' ? 'student' : 'teacher';
    setSaving(true);
    const { error } = await updateProfile(user.id, { role: next });
    setSaving(false);
    if (error) {
      Alert.alert('Error', error);
    } else {
      setProfile((prev) => (prev ? { ...prev, role: next } : prev));
    }
  };

  const handleSignOut = async () => {
    setLoading(true);
    try {
      await signOut();
      router.replace('/login');
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to sign out.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>My Profile</Text>

      {effectiveRole === 'admin' ? (
        <View style={[styles.roleBadge, styles.roleBadgeAdmin]}>
          <Text style={styles.roleBadgeText}>Admin</Text>
        </View>
      ) : effectiveRole === 'teacher' ? (
        <View style={styles.roleBadge}>
          <Text style={styles.roleBadgeText}>Teacher</Text>
        </View>
      ) : (
        <View style={[styles.roleBadge, styles.roleBadgeStudent]}>
          <Text style={[styles.roleBadgeText, styles.roleBadgeTextStudent]}>
            Student
          </Text>
        </View>
      )}

      <View style={styles.infoCard}>
        <Text style={styles.label}>Name</Text>
        {editing ? (
          <View style={styles.nameEditRow}>
            <TextInput
              style={styles.nameInput}
              value={draftName}
              onChangeText={setDraftName}
              placeholder="Enter your name"
              placeholderTextColor={COLORS.textSecondary}
              editable={!saving}
            />
            <Pressable
              style={[styles.saveButton, saving && styles.saveButtonDisabled]}
              onPress={handleSaveName}
              disabled={saving}
            >
              <Text style={styles.saveButtonText}>
                {saving ? '...' : 'Save'}
              </Text>
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={() => setEditing(true)} style={styles.nameRow}>
            <Text style={styles.value}>
              {profile?.full_name || 'Tap to add your name'}
            </Text>
            <Text style={styles.editHint}>Edit</Text>
          </Pressable>
        )}

        <Text style={styles.label}>Email</Text>
        <Text style={styles.value}>{profile?.email ?? user?.email ?? '-'}</Text>

        <Text style={styles.label}>Role</Text>
        <View style={styles.roleRow}>
          <Text style={styles.value}>
            {effectiveRole === 'admin'
              ? 'Admin'
              : effectiveRole === 'teacher'
              ? 'Teacher'
              : 'Student'}
          </Text>

          {effectiveRole !== 'admin' && (
            <Pressable
              onPress={handleSwitchRole}
              disabled={saving || !profile}
              style={[
                styles.roleSwitch,
                (saving || !profile) && styles.saveButtonDisabled,
              ]}
            >
              <Text style={styles.saveButtonText}>
                {saving
                  ? '...'
                  : effectiveRole === 'teacher'
                  ? 'Make Student'
                  : 'Make Teacher'}
              </Text>
            </Pressable>
          )}
        </View>

        <Text style={styles.roleHint}>
          {effectiveRole === 'admin'
            ? 'Admin role is assigned by a project administrator.'
            : 'Role is set when you sign up. If an older account still says Student, tap the button to switch it.'}
        </Text>

        <Text style={styles.label}>User ID</Text>
        <Text style={styles.valueSmall}>{user?.id ?? '-'}</Text>
      </View>

      <AppButton
        title="Sign Out"
        icon="log-out-outline"
        onPress={handleSignOut}
        disabled={loading}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 16,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.primary,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: 16,
  },
  roleBadgeAdmin: {
    backgroundColor: COLORS.primary,
  },
  roleBadgeStudent: {
    backgroundColor: COLORS.surface,
  },
  roleBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  roleBadgeTextStudent: {
    color: COLORS.textPrimary,
  },
  infoCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 4,
    marginTop: 8,
  },
  value: {
    fontSize: 15,
    color: COLORS.textPrimary,
    fontWeight: '500',
  },
  valueSmall: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  roleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  roleSwitch: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  roleHint: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 6,
    lineHeight: 17,
  },
  editHint: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
  },
  nameEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  nameInput: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: COLORS.textPrimary,
    marginRight: 8,
  },
  saveButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
export type { Profile }; // if Profile is not already exported

export type ProfileRow = {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  created_at: string;
  updated_at: string;
};

/** Admin: list every profile, optionally filtered by name/email. */
export async function listProfiles(search?: string) {
  let query = supabase
    .from('profiles')
    .select('id, email, full_name, role, created_at, updated_at')
    .order('created_at', { ascending: false });

  const q = search?.trim();
  if (q) {
    query = query.or(`email.ilike.%${q}%,full_name.ilike.%${q}%`);
  }

  const { data, error } = await query;
  return {
    data: (data as ProfileRow[] | null) ?? [],
    error: error?.message ?? null,
  };
}

/** Admin: edit another user's name and/or role. */
export async function updateProfileAdmin(
  id: string,
  patch: { full_name?: string | null; role?: Role }
) {
  const { error } = await supabase
    .from('profiles')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  return { error: error?.message ?? null };
}

/** Admin: delete a profile row. NOTE: does not delete the auth.users row. */
export async function deleteProfile(id: string) {
  const { error } = await supabase.from('profiles').delete().eq('id', id);
  return { error: error?.message ?? null };
}