import type { CloudEvent } from './events';
import type { Role } from './profiles';
import { supabase } from './supabase';

export type AdminUser = {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  created_at: string;
};

export type AdminAttendance = {
  id: string;
  student_id: string;
  event_id: string;
  scanned_at: string;
  student_name: string | null;
  event_code: string;
  event_title: string;
};

export type AdministratorData = {
  users: AdminUser[];
  events: CloudEvent[];
  attendance: AdminAttendance[];
};

const PAGE_SIZE = 500;

async function readAllPages<T>(
  loadPage: (
    from: number,
    to: number
  ) => Promise<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await loadPage(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

export async function getAdministratorData(): Promise<AdministratorData> {
  const [users, events, attendance] = await Promise.all([
    readAllPages<AdminUser>(async (from, to) => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, full_name, role, created_at')
        .order('created_at', { ascending: false })
        .range(from, to);
      return { data: data as AdminUser[] | null, error };
    }),
    readAllPages<CloudEvent>(async (from, to) => {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, to);
      return { data: data as CloudEvent[] | null, error };
    }),
    readAllPages<{
      id: string;
      student_id: string;
      event_id: string;
      scanned_at: string;
    }>(async (from, to) => {
      const { data, error } = await supabase
        .from('attendance')
        .select('id, student_id, event_id, scanned_at')
        .order('scanned_at', { ascending: false })
        .range(from, to);
      return { data, error };
    }),
  ]);

  const usersById = new Map(users.map((user) => [user.id, user]));
  const eventsById = new Map(events.map((event) => [event.id, event]));

  return {
    users,
    events,
    attendance: attendance.map((record) => {
      const user = usersById.get(record.student_id);
      const event = eventsById.get(record.event_id);
      return {
        ...record,
        student_name: user?.full_name ?? null,
        event_code: event?.event_code ?? 'Unknown event',
        event_title: event?.title ?? 'Unknown event',
      };
    }),
  };
}

export async function updateAdminUser(
  userId: string,
  fullName: string,
  role: Role
): Promise<void> {
  if (!fullName.trim()) throw new Error('Name is required.');
  const { error } = await supabase
    .from('profiles')
    .update({ full_name: fullName.trim(), role })
    .eq('id', userId);
  if (error) throw new Error(error.message);
}

export async function updateAdminEvent(
  eventId: string,
  updates: Pick<CloudEvent, 'event_code' | 'title' | 'start_time' | 'end_time'>
): Promise<void> {
  if (!updates.event_code.trim() || !updates.title.trim()) {
    throw new Error('Event title and code are required.');
  }
  const { error } = await supabase
    .from('events')
    .update({
      event_code: updates.event_code.trim(),
      title: updates.title.trim(),
      start_time: updates.start_time,
      end_time: updates.end_time,
    })
    .eq('id', eventId);
  if (error) throw new Error(error.message);
}

export async function deleteAdminEvent(eventId: string): Promise<void> {
  const { error } = await supabase.from('events').delete().eq('id', eventId);
  if (error) throw new Error(error.message);
}

export async function updateAdminAttendance(
  attendanceId: string,
  scannedAt: string
): Promise<void> {
  const timestamp = new Date(scannedAt);
  if (!Number.isFinite(timestamp.getTime())) {
    throw new Error('Enter a valid attendance date and time.');
  }
  const { error } = await supabase
    .from('attendance')
    .update({ scanned_at: timestamp.toISOString() })
    .eq('id', attendanceId);
  if (error) throw new Error(error.message);
}

export async function deleteAdminAttendance(
  attendanceId: string
): Promise<void> {
  const { error } = await supabase
    .from('attendance')
    .delete()
    .eq('id', attendanceId);
  if (error) throw new Error(error.message);
}
