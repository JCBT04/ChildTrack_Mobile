import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient"; // ✅ Added gradient
import { useTheme } from "../components/ThemeContext";
import AsyncStorage from '@react-native-async-storage/async-storage';

// const DEFAULT_RENDER_BACKEND_URL = "https://capstone-foal.onrender.com";
const DEFAULT_RENDER_BACKEND_URL = "https://childtrack-backend.onrender.com";

const BACKEND_URL = DEFAULT_RENDER_BACKEND_URL.replace(/\/$/, "");
const PARENTS_ENDPOINT = `${BACKEND_URL}/api/parents/parents/`;
const SCHEDULE_ENDPOINTS = [
  `${BACKEND_URL}/api/parents/schedules/`,
  `${BACKEND_URL}/api/schedule/`,
];

const Schedule = ({ navigation }) => {
  const { darkModeEnabled } = useTheme();
  const isDark = darkModeEnabled;

  // Color strategy: set to true to make all schedule banners the same color.
  // If false, a deterministic palette is used so each schedule gets a consistent distinct color.
  const USE_SINGLE_COLOR = false; // change to true to force one color for all schedules
  const SINGLE_COLOR = '#8e44ad';
  const PALETTE = ['#1f77b4','#ff7f0e','#2ca02c','#d62728','#9467bd','#8c564b','#e377c2','#7f7f7f'];

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

  const pickColor = (key) => {
    if (USE_SINGLE_COLOR) return SINGLE_COLOR;
    // namespace the key so schedules produce different colors than events/notifications
    const seededKey = `schedule:${String(key || '')}`;
    const seed = Math.abs(hashStringToInt(seededKey));
    const rnd = mulberry32(seed)();
    const idx = Math.floor(rnd * PALETTE.length);
    return PALETTE[idx];
  };

  const [scheduleData, setScheduleData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const capitalize = (value) => {
    if (!value || typeof value !== 'string') return '';
    return value.charAt(0).toUpperCase() + value.slice(1);
  };

  const buildTimeWindow = (start, end) => {
    const format = (raw) => {
      if (!raw) return null;
      const date = new Date(`1970-01-01T${raw}`);
      if (Number.isNaN(date.getTime())) return raw;
      return date
        .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
        .replace(/^0/, '');
    };
    const startLabel = format(start);
    const endLabel = format(end);
    if (startLabel && endLabel) return `${startLabel} - ${endLabel}`;
    return startLabel || endLabel || '';
  };

  const determineStudentLrn = async (username) => {
    let storedParent = null;
    try {
      const localParent = await AsyncStorage.getItem('parent');
      if (localParent) storedParent = JSON.parse(localParent);
    } catch (err) {
      console.warn('Failed to parse stored parent for schedule', err);
    }
    const storedLrn =
      storedParent?.student_lrn ||
      storedParent?.student?.lrn ||
      storedParent?.student?.id ||
      null;
    if (storedLrn) {
      return storedLrn;
    }

    if (!username) return null;

    const token = await AsyncStorage.getItem('token');
    if (!token) return null;

    try {
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Token ${token}`,
      };
      const parentsResp = await fetch(PARENTS_ENDPOINT, { headers });
      if (!parentsResp.ok) {
        throw new Error(`Parents HTTP ${parentsResp.status}`);
      }
      const parentsData = await parentsResp.json();
      const parentsList = Array.isArray(parentsData)
        ? parentsData
        : parentsData?.results || [];
      const parentRecord = parentsList.find((p) => p?.username === username);
      if (parentRecord) {
        return parentRecord.student_lrn || parentRecord.student || null;
      }
    } catch (err) {
      console.warn('Schedule parents lookup failed', err);
    }
    return null;
  };

  const loadSchedule = async ({ skipLoading = false } = {}) => {
    if (!skipLoading) {
      setLoading(true);
      setErrorMessage(null);
    }
    try {
      const username = await AsyncStorage.getItem('username');
      const studentLrn = await determineStudentLrn(username);

      let schedules = [];
      let lastError = null;
      for (const endpoint of SCHEDULE_ENDPOINTS) {
        const query = studentLrn
          ? `${endpoint}?lrn=${encodeURIComponent(studentLrn)}`
          : endpoint;
        try {
          const resp = await fetch(query);
          if (!resp.ok) {
            throw new Error(`Schedule HTTP ${resp.status}`);
          }

          let payload = await resp.json();
          if (payload && payload.results) payload = payload.results;
          if (!Array.isArray(payload)) payload = [];
          schedules = payload;
          break;
        } catch (fetchErr) {
          lastError = fetchErr;
        }
      }

      if (!Array.isArray(schedules) || !schedules.length) {
        if (lastError) throw lastError;
        schedules = [];
      }

      const mapped = schedules.map((s) => {
        const dayLabel = s.day_of_week ? capitalize(s.day_of_week) : '';
        const timeLabel =
          s.time_label ||
          buildTimeWindow(s.start_time, s.end_time) ||
          s.extra_data?.time ||
          '';
        const combinedTime = [dayLabel, timeLabel]
          .filter(Boolean)
          .join(dayLabel && timeLabel ? ' • ' : '');

        return {
          id: s.id,
          subject: s.subject || s.title || 'Subject',
          time: combinedTime || 'Schedule pending',
          room: s.room || s.extra_data?.room || 'Room not set',
          icon: s.icon || 'book-outline',
          color: pickColor(s.id || s.subject || s.student_lrn || s.student),
        };
      });

      setScheduleData(mapped);
      setErrorMessage(null);
    } catch (err) {
      console.warn('Failed loading schedule', err);
      setScheduleData([]);
      setErrorMessage('Unable to load schedule right now.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadSchedule();
  }, []);

  const onRefresh = async () => {
    console.log('[Schedule] onRefresh called');
    setRefreshing(true);
    await loadSchedule({ skipLoading: true });
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={[
        styles.card,
        { backgroundColor: isDark ? "#1e1e1e" : "#fff" },
      ]}
      onPress={() => console.log("Open Schedule Details")}
    >
      {/* Subject Banner */}
      <View style={[styles.banner, { backgroundColor: item.color }]}>
        <Ionicons name={item.icon} size={24} color="#fff" />
        <Text style={styles.bannerText}>{item.subject}</Text>
      </View>

      {/* Details */}
      <View style={styles.details}>
        <Text style={[styles.time, { color: isDark ? "#bbb" : "#333" }]}>
          ⏰ {item.time}
        </Text>
        <Text style={[styles.room, { color: isDark ? "#ddd" : "#555" }]}>
          📍 {item.room}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <LinearGradient
      colors={isDark ? ["#0b0f19", "#1a1f2b"] : ["#f5f5f5", "#e0e0e0"]}
      style={styles.container}
    >
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: isDark ? "#333" : "#ddd" }]}>
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
          Student Schedule
        </Text>
      </View>

      {/* Schedule List */}
      <FlatList
        data={scheduleData}
        renderItem={renderItem}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={!loading ? (
          <View style={{ padding: 24, alignItems: 'center' }}>
            <Text style={{ color: isDark ? '#ddd' : '#555', textAlign: 'center' }}>
              {errorMessage || 'No schedule found.'}
            </Text>
          </View>
        ) : null}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={isDark ? '#fff' : '#333'}
            colors={[isDark ? '#fff' : '#333']}
            progressBackgroundColor={isDark ? '#111' : '#fff'}
          />
        }
      />
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    marginTop: 40,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginLeft: 12,
  },
  card: {
    borderRadius: 16,
    marginBottom: 20,
    elevation: 4,
    overflow: "hidden",
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
  },
  bannerText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    marginLeft: 8,
  },
  details: {
    padding: 14,
  },
  time: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 6,
  },
  room: {
    fontSize: 14,
  },
});

export default Schedule;
