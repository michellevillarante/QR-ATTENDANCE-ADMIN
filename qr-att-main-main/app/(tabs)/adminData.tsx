import { supabase } from '@/lib/supabase';

export type ProfileRow = {
  id: string;
  email: string;
  full_name: string | null;
  role: 'student' | 'teacher' | 'admin';
  created_at: string;
  updated_at: string;
};

export type EventRow = {
  id: string;
  event_code: string;
  title: string;
  start_time: string | null;
  end_time: string | null;
  created_by: string | null;
  created_at: string;
};

export type AttendanceRow = {
  id: string;
  student_id: string;
  event_id: string;
  scanned_at: string;
  profile?: { email: string; full_name: string | null } | null;
  event?:   { event_code: string; title: string } | null;
};

export async function listProfiles(search: string) {
  let q = supabase.from('profiles').select('*').order('email');
  const term = search.trim();
  if (term) {
    const esc = term.replace(/[,%()]/g, (c) => `\\${c}`);
    q = q.or(`full_name.ilike.%${esc}%,email.ilike.%${esc}%`);
  }
  const { data, error } = await q;
  return { data: (data ?? []) as ProfileRow[], error: error?.message ?? null };
}

export async function listEvents(search: string) {
  let q = supabase
    .from('events')
    .select('*')
    .order('start_time', { ascending: false, nullsFirst: false });
  const term = search.trim();
  if (term) {
    const esc = term.replace(/[,%()]/g, (c) => `\\${c}`);
    q = q.or(`title.ilike.%${esc}%,event_code.ilike.%${esc}%`);
  }
  const { data, error } = await q;
  return { data: (data ?? []) as EventRow[], error: error?.message ?? null };
}

export async function deleteEvent(id: string) {
  const { error } = await supabase.from('events').delete().eq('id', id);
  return { error: error?.message ?? null };
}

export async function updateEvent(
  id: string,
  patch: Partial<Pick<EventRow, 'title' | 'event_code' | 'start_time' | 'end_time'>>
) {
  const { error } = await supabase.from('events').update(patch).eq('id', id);
  return { error: error?.message ?? null };
}

export async function listAttendance(limit = 200) {
  const { data, error } = await supabase
    .from('attendance')
    .select(`
      id, student_id, event_id, scanned_at,
      profile:profiles(email, full_name),
      event:events(event_code, title)
    `)
    .order('scanned_at', { ascending: false })
    .limit(limit);
  return { data: (data ?? []) as AttendanceRow[], error: error?.message ?? null };
}

/** Delete an attendance row (admin only by RLS). */
export async function deleteAttendance(id: string) {
  const { error } = await supabase.from('attendance').delete().eq('id', id);
  return { error: error?.message ?? null };
}

export type ReportSummary = {
  totalUsers: number;
  totalStudents: number;
  totalTeachers: number;
  totalAdmins: number;
  totalEvents: number;
  totalCheckins: number;
  recentEvents: EventRow[];
  topEvents: { event_code: string; title: string; count: number }[];
};

export async function getReportSummary(): Promise<{
  data: ReportSummary | null;
  error: string | null;
}> {
  // Parallel simple counts — cheap for a school-size dataset.
  const [
    usersAll,
    usersStudents,
    usersTeachers,
    usersAdmins,
    events,
    checkins,
    recentEvents,
  ] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'student'),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'teacher'),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin'),
    supabase.from('events').select('id', { count: 'exact', head: true }),
    supabase.from('attendance').select('id', { count: 'exact', head: true }),
    supabase
      .from('events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  const firstError =
    usersAll.error || events.error || checkins.error || recentEvents.error;
  if (firstError) return { data: null, error: firstError.message };

  // Top events by check-in count (client-side aggregation).
  const { data: allAtt, error: attErr } = await supabase
    .from('attendance')
    .select('event_id, event:events(event_code, title)');
  if (attErr) return { data: null, error: attErr.message };

  const counts = new Map<string, { event_code: string; title: string; count: number }>();
  (allAtt ?? []).forEach((row: any) => {
    const ev = row.event;
    if (!ev) return;
    const key = ev.event_code;
    const existing = counts.get(key);
    if (existing) existing.count++;
    else counts.set(key, { event_code: ev.event_code, title: ev.title, count: 1 });
  });
  const topEvents = [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 5);

  return {
    data: {
      totalUsers: usersAll.count ?? 0,
      totalStudents: usersStudents.count ?? 0,
      totalTeachers: usersTeachers.count ?? 0,
      totalAdmins: usersAdmins.count ?? 0,
      totalEvents: events.count ?? 0,
      totalCheckins: checkins.count ?? 0,
      recentEvents: (recentEvents.data ?? []) as EventRow[],
      topEvents,
    },
    error: null,
  };
}