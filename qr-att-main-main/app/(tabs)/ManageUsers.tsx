import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';

import AppButton from '@/components/AppButton';
import { COLORS } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import { updateProfileAdmin, deleteProfile, type Role } from '@/lib/profiles';
import { listProfiles, type ProfileRow } from '@/lib/adminData';

const ROLES = ['student', 'teacher', 'admin'] as Role[];

export default function ManageUsers() {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<ProfileRow | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState<Role>('student');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await listProfiles(search);
    if (error) setError(error); else setProfiles(data);
    setLoading(false);
  }, [search]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openEdit = (p: ProfileRow) => {
    setEditing(p);
    setEditName(p.full_name ?? '');
    setEditRole(p.role);
    setError(null);
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    const { error } = await updateProfileAdmin(editing.id, {
      full_name: editName.trim() || null,
      role: editRole,
    });
    setSaving(false);
    if (error) return setError(error);
    setEditing(null);
    load();
  };

  const confirmDelete = (p: ProfileRow) => {
    if (p.id === user?.id) {
      Alert.alert('Not allowed', 'You cannot delete your own account here.');
      return;
    }
    Alert.alert(
      'Delete profile row?',
      `This removes ${p.email} from public.profiles. The auth user still exists.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { error } = await deleteProfile(p.id);
            if (error) Alert.alert('Error', error); else load();
          },
        },
      ]
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.searchWrap}>
        <View style={styles.searchRow}>
          <Ionicons name="search" size={18} color={COLORS.textSecondary} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search by name or email"
            placeholderTextColor={COLORS.textSecondary}
            onSubmitEditing={load}
            returnKeyType="search"
          />
          <Pressable onPress={load} hitSlop={8}>
            <Ionicons name="refresh" size={20} color={COLORS.primary} />
          </Pressable>
        </View>
        {error && <Text style={styles.error}>{error}</Text>}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={profiles}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 40 }}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>{item.full_name || '(no name)'}</Text>
                <Text style={styles.rowEmail}>{item.email}</Text>
                <RoleBadge role={item.role} />
              </View>
              <Pressable style={styles.rowButton} onPress={() => openEdit(item)} hitSlop={8}>
                <Ionicons name="create-outline" size={20} color={COLORS.primary} />
              </Pressable>
              <Pressable style={styles.rowButton} onPress={() => confirmDelete(item)} hitSlop={8}>
                <Ionicons name="trash-outline" size={20} color="#B00020" />
              </Pressable>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.emptyText}>No users found.</Text>}
        />
      )}

      <Modal visible={!!editing} animationType="slide" transparent onRequestClose={() => setEditing(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>Edit user</Text>
              <Text style={styles.modalEmail}>{editing?.email}</Text>

              <Text style={styles.label}>Full name</Text>
              <TextInput
                style={styles.input}
                value={editName}
                onChangeText={setEditName}
                placeholder="Full name"
                placeholderTextColor={COLORS.textSecondary}
              />

              <Text style={styles.label}>Role</Text>
              <View style={styles.roleRow}>
                {ROLES.map((r) => (
                  <Pressable
                    key={r}
                    style={[styles.chip, editRole === r && styles.chipActive]}
                    onPress={() => setEditRole(r)}
                  >
                    <Text style={[styles.chipText, editRole === r && styles.chipTextActive]}>{r}</Text>
                  </Pressable>
                ))}
              </View>

              <View style={{ height: 16 }} />
              <AppButton
                theme="primary"
                title={saving ? 'Saving...' : 'Save'}
                icon="checkmark-circle-outline"
                onPress={saveEdit}
              />
              <View style={{ height: 8 }} />
              <Pressable onPress={() => setEditing(null)} style={styles.cancel}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function RoleBadge({ role }: { role: Role }) {
  const color = String(role) === 'admin' ? '#B00020' : role === 'teacher' ? '#1565C0' : COLORS.primary;
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[styles.badgeText, { color }]}>{role.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  searchWrap: { paddingHorizontal: 24, paddingVertical: 8 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchInput: { flex: 1, marginHorizontal: 8, fontSize: 15, color: COLORS.textPrimary },
  error: { marginTop: 8, color: '#B00020', fontSize: 13 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  rowName: { fontSize: 15, fontWeight: '600', color: COLORS.textPrimary },
  rowEmail: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  rowButton: { padding: 6 },
  emptyText: { textAlign: 'center', marginTop: 32, color: COLORS.textSecondary },
  badge: {
    marginTop: 6,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    maxHeight: '85%',
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: COLORS.textPrimary },
  modalEmail: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2, marginBottom: 12 },
  label: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary, marginBottom: 6, marginTop: 10 },
  input: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  roleRow: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginRight: 8,
    marginBottom: 8,
    backgroundColor: COLORS.card,
  },
  chipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.surface },
  chipText: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  chipTextActive: { color: COLORS.primary },
  cancel: { alignItems: 'center', paddingVertical: 10 },
  cancelText: { fontSize: 14, color: COLORS.textSecondary, fontWeight: '600' },
});