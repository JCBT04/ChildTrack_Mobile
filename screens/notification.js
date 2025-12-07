import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { TouchableOpacity } from 'react-native';
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../components/ThemeContext";
import AsyncStorage from "@react-native-async-storage/async-storage";

const DEFAULT_RENDER_BACKEND_URL = "https://childtrack-backend.onrender.com";
const BACKEND_URL = DEFAULT_RENDER_BACKEND_URL.replace(/\/$/, "");
const Notifications = ({ navigation }) => {
  const { darkModeEnabled } = useTheme();
  const isDark = darkModeEnabled;

  // Backend base URL is provided by centralized config

  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [readIds, setReadIds] = useState(new Set());

  // Notification color strategy: single color or deterministic per-notification
  const USE_SINGLE_COLOR_NOTIF = false; // set true to force one color for all notifications
  const SINGLE_COLOR_NOTIF = '#3498db';
  const NOTIF_PALETTE = ['#e74c3c','#27ae60','#3498db','#9b59b6','#f39c12','#2ecc71'];

  const hashStringToInt = (str) => {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h;
  };

  const mulberry32 = (a) => {
    return function() {
      var t = a += 0x6D2B79F5;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
  };

  const pickColorForNotif = (key) => {
    if (USE_SINGLE_COLOR_NOTIF) return SINGLE_COLOR_NOTIF;
    // namespace the key so notifications use a different mapping than events/schedules
    const seededKey = `notif:${String(key || '')}`;
    const seed = Math.abs(hashStringToInt(seededKey));
    const rnd = mulberry32(seed)();
    const idx = Math.floor(rnd * NOTIF_PALETTE.length);
    return NOTIF_PALETTE[idx];
  };

  // Fetch helper (returns mapped notifications)
  const READ_IDS_KEY = 'read_notifications';

  const fetchNotificationsFromAPI = async () => {
    const parentRaw = await AsyncStorage.getItem("parent");
    let query = "";
    if (parentRaw) {
      try {
        const parent = JSON.parse(parentRaw);
        if (parent && parent.id) {
          query = `?parent=${encodeURIComponent(parent.id)}`;
        }
      } catch (err) {
        console.warn("Failed to parse parent cache", err);
      }
    }

    const url = `${BACKEND_URL}/api/parents/notifications/${query}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Network response not ok');
    const data = await res.json();
    // data may be an array or an object; normalize
    const serverItems = Array.isArray(data) ? data : (Array.isArray(data.results) ? data.results : (Array.isArray(data.value) ? data.value : []));
    const TYPE_LABELS = { attendance: 'Attendance', pickup: 'Pickup', event: 'Event', other: 'Other' };

    // map server notifications first
    const mappedServer = (serverItems || []).map((n) => ({
      id: String(n.id),
      type: n.type,
      typeLabel: TYPE_LABELS[n.type] || (n.type ? String(n.type).charAt(0).toUpperCase() + String(n.type).slice(1) : 'Other'),
      message: n.message || (n.extra_data && JSON.stringify(n.extra_data)) || '',
      time: (n.created_at || n.timestamp) ? new Date(n.created_at || n.timestamp).toLocaleString() : '',
      icon: (n.type === 'attendance' ? 'people' : n.type === 'pickup' ? 'person-circle-outline' : (n.type === 'event' ? 'calendar' : 'notifications-outline')),
      color: pickColorForNotif(n.id || n.type),
      raw: n,
      read: !!n.read,
      source: 'parent',
    }));

    // also fetch attendance public endpoint to generate 'child in classroom' notifications
    let attendanceItems = [];
    try {
      const attendResp = await fetch(`${BACKEND_URL}/api/attendance/public/`);
      if (attendResp.ok) {
        let attendData = await attendResp.json();
        attendData = Array.isArray(attendData) ? attendData : (Array.isArray(attendData.results) ? attendData.results : []);
        console.log('[Notifications] attendance total records:', (attendData || []).length);
        // try to personalize using stored parent student info
        let storedParent = null;
        try { storedParent = parentRaw ? JSON.parse(parentRaw) : null; } catch (e) { storedParent = null; }
        const myStudentName = storedParent?.student_name?.trim().toLowerCase() || null;
        const myStudentLrn = storedParent?.student_lrn || storedParent?.student || null;

        const filtered = (attendData || []).filter(a => {
          if (!a) return false;
          const recName = (a.student_name || '').trim().toLowerCase();
          const recLrn = (a.student_lrn || '').toString();
          if (myStudentLrn && recLrn && String(myStudentLrn) === recLrn) return true;
          if (myStudentName && recName && myStudentName === recName) return true;
          return false;
        });
        console.log('[Notifications] attendance filtered for student:', { myStudentName, myStudentLrn, matched: (filtered || []).length });

        const isSameDay = (d1, d2) => {
          if (!d1 || !d2) return false;
          return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
        };

        // Only keep records for today and with present/in status
        const today = new Date();
        const todaysMatches = (filtered || []).filter(it => {
          const rawDate = it.date || it.timestamp || it.created_at;
          if (!rawDate) return false;
          const recDate = new Date(rawDate);
          if (Number.isNaN(recDate.getTime())) return false;
          const status = (it.status || '').toString().toLowerCase();
          return (status === 'present' || status === 'in') && isSameDay(recDate, today);
        });

        console.log('[Notifications] attendance todaysMatches count:', (todaysMatches || []).length);

        attendanceItems = (todaysMatches || []).map(it => {
          return {
            id: `attendance-${it.id}`,
            type: 'attendance',
            typeLabel: 'Attendance',
            message: 'Your child is already in the classroom',
            time: it.date || it.timestamp ? new Date(it.date || it.timestamp).toLocaleString() : '',
            icon: 'people',
            color: '#27ae60',
            raw: it,
            read: false,
            source: 'attendance',
          };
        });
      }
    } catch (e) {
      // ignore attendance fetch failure
    }

    // also fetch events for the student's section (upcoming)
    let eventItems = [];
    try {
      // reuse storedParent from above if present
      let storedParentForEvents = null;
      try { storedParentForEvents = parentRaw ? JSON.parse(parentRaw) : null; } catch (e) { storedParentForEvents = null; }
      const section = storedParentForEvents?.student_section || storedParentForEvents?.student?.section || null;
      const eventsQuery = section ? `${BACKEND_URL}/api/parents/events/?section=${encodeURIComponent(section)}` : `${BACKEND_URL}/api/parents/events/`;
      console.log('[Notifications] fetching events with query:', eventsQuery, 'section:', section);
      const eventsResp = await fetch(eventsQuery);
      if (eventsResp.ok) {
        let eventsData = await eventsResp.json();
        eventsData = Array.isArray(eventsData) ? eventsData : (Array.isArray(eventsData.results) ? eventsData.results : []);
        console.log('[Notifications] events total records:', (eventsData || []).length);
        const now = new Date();
        const cutoff = new Date();
        cutoff.setDate(now.getDate() + 7); // next 7 days

        const isSameDay = (d1, d2) => {
          if (!d1 || !d2) return false;
          return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
        };

        const upcoming = (eventsData || []).filter(ev => {
          const raw = ev.scheduled_at || ev.timestamp || ev.date;
          if (!raw) return false;
          const d = new Date(raw);
          if (Number.isNaN(d.getTime())) return false;
          // include events happening today (any time) or within the next 7 days
          return isSameDay(d, now) || (d >= now && d <= cutoff);
        });
        console.log('[Notifications] upcoming events count:', (upcoming || []).length);

        eventItems = (upcoming || []).map(ev => ({
          id: `event-${ev.id}`,
          type: 'event',
          // Label as 'Event' and keep event_type for subType
          typeLabel: 'Event',
          subType: ev.event_type || '',
          // For attendance-like layout, use event_type as the message
          message: ev.event_type || ev.title || 'Event',
          time: ev.scheduled_at ? new Date(ev.scheduled_at).toLocaleString() : (ev.timestamp ? new Date(ev.timestamp).toLocaleString() : ''),
          // Use calendar icon for events and blue color
          icon: 'calendar',
          color: '#3498db',
          raw: ev,
          read: false,
          source: 'event',
        }));
      }
    } catch (e) {
      // ignore event fetch failure
      console.warn('[Notifications] events fetch failed', e);
    }

    // also fetch unregistered guardians (public) to create notifications for pending requests
    let unregisteredItems = [];
    try {
      const guardiansResp = await fetch(`${BACKEND_URL}/api/guardian/public/`);
      if (guardiansResp.ok) {
        let guardiansData = await guardiansResp.json();
        guardiansData = Array.isArray(guardiansData) ? guardiansData : (Array.isArray(guardiansData.results) ? guardiansData.results : (Array.isArray(guardiansData.value) ? guardiansData.value : []));
        console.log('[Notifications] guardian public total records:', (guardiansData || []).length);

        // personalize using stored parent student info
        let storedParentForGuardians = null;
        try { storedParentForGuardians = parentRaw ? JSON.parse(parentRaw) : null; } catch (e) { storedParentForGuardians = null; }
        const myStudentName = storedParentForGuardians?.student_name?.trim().toLowerCase() || null;
        const myStudentLrn = storedParentForGuardians?.student_lrn || storedParentForGuardians?.student || null;

        const matched = (guardiansData || []).filter(g => {
          if (!g) return false;
          const status = (g.status || '').toString().toLowerCase();
          // consider 'pending' or 'unregistered' as candidates depending on backend shape
          if (status !== 'pending' && status !== 'unregistered') return false;
          const recName = (g.student_name || '').trim().toLowerCase();
          const recLrn = (g.student_lrn || '').toString();
          if (myStudentLrn && recLrn && String(myStudentLrn) === recLrn) return true;
          if (myStudentName && recName && myStudentName === recName) return true;
          return false;
        });
        console.log('[Notifications] unregistered guardians matched:', (matched || []).length);

        unregisteredItems = (matched || []).map(u => ({
          id: `unregistered-${u.id}`,
          type: 'unregistered',
          typeLabel: 'Unregistered',
          // message: guardian name + student context when available
          message: (u.name || u.guardian_name || u.username || 'Unregistered guardian') + (u.student_name ? ` for ${u.student_name}` : ''),
          time: u.created_at ? new Date(u.created_at).toLocaleString() : (u.timestamp ? new Date(u.timestamp).toLocaleString() : ''),
          icon: 'close-circle',
          color: '#e74c3c',
          raw: u,
          read: false,
          source: 'guardian',
        }));
      }
    } catch (e) {
      // ignore guardian fetch failures
    }

    // combine and return (include events & unregistered guardian notifications)
    const combined = [...mappedServer, ...attendanceItems, ...eventItems, ...unregisteredItems];
    // dedupe by id
    const seen = new Map();
    combined.forEach(it => { if (!seen.has(it.id)) seen.set(it.id, it); });
    return Array.from(seen.values());
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const items = await fetchNotificationsFromAPI();
        // Prefer server-side read flags when available
        const serverReadIds = items.filter(it => it.read).map(it => String(it.id));
        const storedReadRaw = await AsyncStorage.getItem(READ_IDS_KEY);
        const storedRead = storedReadRaw ? JSON.parse(storedReadRaw) : [];
        const fallbackReadIds = Array.isArray(storedRead) ? storedRead.map(String) : [];
        const combinedRead = new Set([...serverReadIds, ...fallbackReadIds]);
        if (!mounted) return;
        setReadIds(combinedRead);
        setNotifications(items);
      } catch (err) {
        console.warn('Failed to load notifications:', err.message || err);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      const items = await fetchNotificationsFromAPI();
      setNotifications(items);
    } catch (err) {
      console.warn('Refresh failed:', err);
    } finally {
      setRefreshing(false);
    }
  };

  const saveReadIds = async (setObj) => {
    try {
      const arr = Array.from(setObj);
      await AsyncStorage.setItem(READ_IDS_KEY, JSON.stringify(arr));
    } catch (e) {
      console.warn('Failed saving read ids', e);
    }
  };

  const markAsRead = async (id) => {
    try {
      const sid = String(id);
      if (readIds.has(sid)) return;
      const next = new Set(readIds);
      next.add(sid);
      setReadIds(next);
      await saveReadIds(next);
      // Also persist to server
      try {
        const token = await AsyncStorage.getItem('token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers.Authorization = `Token ${token}`;
        const resp = await fetch(`${BACKEND_URL}/api/parents/notifications/${sid}/`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ read: true }),
        });
        if (resp.ok) {
          // update local notifications array to reflect server read
          setNotifications((prev) => prev.map((it) => (String(it.id) === sid ? { ...it, read: true } : it)));
        }
      } catch (e) {
        console.warn('Failed to persist read to server', e);
      }
    } catch (e) {
      console.warn('markAsRead error', e);
    }
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity onPress={() => handlePressNotification(item)} activeOpacity={0.8}>
    <LinearGradient
      colors={isDark ? ["#1e1e1e", "#121212"] : ["#ffffff", "#f4f6f9"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.card}
    >
      <Ionicons
        name={item.icon}
        size={32}
        color={item.color}
        style={styles.icon}
      />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
          <View style={[styles.badge, { backgroundColor: item.color }]}>
            <Text style={styles.badgeText}>{item.typeLabel}</Text>
          </View>
          {item.type !== 'event' && item.subType ? (
            <Text style={[styles.subBadgeText, { color: isDark ? '#cbd5e0' : '#666', marginLeft: 8 }]}>{item.subType}</Text>
          ) : null}
        </View>

        <Text style={[styles.message, { color: isDark ? "#fff" : "#333", fontWeight: readIds.has(String(item.id)) ? '400' : '700' }]}> 
          {item.message}
        </Text>
        <Text style={[styles.time, { color: isDark ? "#bbb" : "#777" }]}>{item.time}</Text>
      </View>
          {/* small unread dot */}
          {!readIds.has(String(item.id)) ? (
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: '#e74c3c', marginLeft: 8 }} />
          ) : null}
        </LinearGradient>
      </TouchableOpacity>
    );

  const handlePressNotification = async (item) => {
    await markAsRead(item.id);
    // If the notification has extra_data with deep link info, navigate
    const raw = item.raw || {};
    try {
      const extra = raw.extra_data || (raw.extra_data === null ? null : raw.extra_data);
      if (extra && typeof extra === 'object') {
        if (extra.event_id) {
          navigation.navigate('event', { id: extra.event_id });
          return;
        }
      }
    } catch (e) {
      // ignore
    }
  };

  return (
    <LinearGradient
      colors={isDark ? ['#0b0f19', '#1a1f2b'] : ['#f5f5f5', '#e0e0e0']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      {/* Header */}
      <View style={styles.header}>
        <Ionicons
          name="arrow-back"
          size={24}
          color={isDark ? "#fff" : "#333"}
          onPress={() => {
            if (navigation.canGoBack && navigation.canGoBack()) {
              navigation.goBack();
            } else {
              navigation.navigate('home');
            }
          }}
        />
        <Text style={[styles.headerTitle, { color: isDark ? "#fff" : "#333" }]}>
          Notifications
        </Text>
        {Array.from(readIds).length < notifications.length ? (
          <View style={{ marginLeft: 8, backgroundColor: '#e74c3c', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>{Math.max(0, notifications.length - Array.from(readIds).length)}</Text>
          </View>
        ) : null}
      </View>

      {/* List */}
      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={isDark ? '#fff' : '#333'} />
        </View>
      ) : (
        <FlatList
          data={notifications}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16 }}
          showsVerticalScrollIndicator={false}
          style={{ flex: 1 }}
          extraData={notifications}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={() => (
            <View style={{ padding: 20, alignItems: 'center' }}>
              <Text style={{ color: isDark ? '#fff' : '#333' }}>No notifications</Text>
            </View>
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { console.log('[Notifications] onRefresh called'); onRefresh(); }}
              tintColor={isDark ? '#fff' : '#333'}
              colors={[isDark ? '#fff' : '#333']}
              progressBackgroundColor={isDark ? '#111' : '#fff'}
            />
          }
        />
      )}
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
    marginTop: 40,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginLeft: 12,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    elevation: 3,
  },
  icon: {
    marginRight: 12,
  },
  message: {
    fontSize: 15,
    fontWeight: "500",
    marginBottom: 4,
  },
  time: {
    fontSize: 12,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  eventDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  eventTitleColored: {
    fontSize: 15,
    marginBottom: 4,
  },
  eventTypeUnder: {
    fontSize: 12,
    marginTop: 4,
  },
});

export default Notifications;
