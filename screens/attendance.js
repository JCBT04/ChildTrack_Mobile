import React, { useEffect, useState, useRef } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Calendar } from "react-native-calendars";
import { LinearGradient } from "expo-linear-gradient"; // ✅ Added gradient
import { useTheme } from "../components/ThemeContext";
import AsyncStorage from '@react-native-async-storage/async-storage';

// const DEFAULT_RENDER_BACKEND_URL = "https://capstone-foal.onrender.com";
const DEFAULT_RENDER_BACKEND_URL = "https://childtrack-backend.onrender.com";

const BACKEND_URL = DEFAULT_RENDER_BACKEND_URL.replace(/\/$/, "");

const Attendance = ({ navigation }) => {
  const { darkModeEnabled } = useTheme();
  const isDark = darkModeEnabled;
  const [markedDates, setMarkedDates] = useState({});
  const [loading, setLoading] = useState(true);
  const [attDataState, setAttDataState] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const mountedRef = useRef(true);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  });
  const [kids, setKids] = useState([]);
  const [activeKidIndex, setActiveKidIndex] = useState(0);
  const activeKid = kids[activeKidIndex] || null;
  // School year boundaries (SY 2025-2026)
  const SY_START = new Date(2025, 5, 16); // June 16, 2025 (month is 0-based)
  const SY_END = new Date(2026, 2, 31); // March 31, 2026

  const buildMarkedForMonth = (attData, year, month) => {
    const map = {};
    const daysInMonth = new Date(year, month, 0).getDate();
    const today = new Date();

    const recordsForMonth = (attData || []).filter(a => {
      if (!a || !a.date) return false;
      const [y, m] = a.date.split('-').map(Number);
      return y === year && m === month;
    });

    // Default: for any day that is <= today (past and present), mark absent by default
    // Future days are not auto-marked. Records (present/absent/other) will override defaults.
    for (let d = 1; d <= daysInMonth; d++) {
      const dd = String(d).padStart(2, '0');
      const mm = String(month).padStart(2, '0');
      const key = `${year}-${mm}-${dd}`;
      const dateObj = new Date(year, month - 1, d);
      const dayOfWeek = dateObj.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) continue; // skip weekends
      if (dateObj < SY_START || dateObj > SY_END) continue; // outside school year

      // only default-mark days that are not in the future
      if (dateObj <= today) {
        map[key] = {
          customStyles: {
            container: { backgroundColor: 'red', borderRadius: 8 },
            text: { color: 'white', fontWeight: 'bold' },
          },
        };
      }
    }

    // Override with actual records (present/absent/other)
    recordsForMonth.forEach(a => {
      const date = a.date; if (!date) return;
      const normalizedStatus = (a.status || 'present').toLowerCase();
      const color = normalizedStatus === 'present' ? 'green' : (normalizedStatus === 'absent' ? 'red' : 'orange');
      map[date] = {
        customStyles: {
          container: { backgroundColor: color, borderRadius: 8 },
          text: { color: 'white', fontWeight: 'bold' },
        },
      };
    });

    return map;
  };

  const fetchParentsForUsername = async (username) => {
    const token = await AsyncStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Token ${token}`;

    try {
      const parentsResp = await fetch(`${BACKEND_URL}/api/parents/parents/`, { headers });
      if (!parentsResp.ok) {
        throw new Error(`HTTP ${parentsResp.status}`);
      }
      const data = await parentsResp.json();
      let parentsList = Array.isArray(data) ? data : (data && data.results ? data.results : []);
      parentsList = parentsList.filter(p => p.username === username);
      if (parentsList.length) return parentsList;
    } catch (e) {
      console.warn('Failed to fetch parents from API, falling back to cached parent', e);
    }

    try {
      const storedParent = await AsyncStorage.getItem('parent');
      if (storedParent) {
        const parsed = JSON.parse(storedParent);
        if (parsed && parsed.username === username) {
          return [parsed];
        }
      }
    } catch (e) {
      console.warn('Failed to read parent from storage', e);
    }
    return [];
  };

  const fetchAttendanceRecords = async (kid) => {
    if (!kid) return [];
    const { name: studentName, lrn: studentLrn } = kid;
    if (!studentName && !studentLrn) return [];

    const resp = await fetch(`${BACKEND_URL}/api/attendance/public/`);
    if (!resp.ok) {
      throw new Error(`Attendance HTTP ${resp.status}`);
    }
    let data = await resp.json();
    if (data && data.results) data = data.results;
    if (!Array.isArray(data)) data = [];

    const normalizedKidName = (studentName || '').trim().toLowerCase();
    const normalizedKidLrn = (studentLrn || '').trim();
    const filtered = data.filter(a => {
      const recName = (a.student_name || '').trim().toLowerCase();
      const recLrn = (a.student_lrn || '').trim();
      const matchesName = normalizedKidName && recName === normalizedKidName;
      const matchesLrn = normalizedKidLrn && recLrn && recLrn === normalizedKidLrn;
      return matchesName || matchesLrn;
    });
    return filtered;
  };

  const loadAttendance = async ({ skipLoading = false } = {}) => {
    if (!skipLoading) setLoading(true);
    try {
      const username = await AsyncStorage.getItem('username');
      if (!username) {
        if (mountedRef.current) setLoading(false);
        return;
      }

      const parentsList = await fetchParentsForUsername(username);
      if (!parentsList.length) {
        if (mountedRef.current) setLoading(false);
        return;
      }

      const kidsData = parentsList
        .filter(p => p && p.student_name)
        .map(p => ({
          id: p.student_lrn || p.student || p.id,
          lrn: p.student_lrn || '',
          name: p.student_name,
          teacherName: p.teacher_name || '',
          teacherPhone: p.contact_number || '',
        }));

      if (!kidsData.length) {
        if (mountedRef.current) setLoading(false);
        return;
      }

      const nextActiveIndex = Math.min(activeKidIndex, kidsData.length - 1);
      const kid = kidsData[nextActiveIndex];
      const attData = await fetchAttendanceRecords(kid);
      const map = buildMarkedForMonth(attData, currentMonth.year, currentMonth.month);

      if (mountedRef.current) {
        setKids(kidsData);
        setActiveKidIndex(nextActiveIndex);
        setAttDataState(attData);
        setMarkedDates(map);
        setLoading(false);
      }
    } catch (err) {
      console.warn('Failed to load attendance', err);
      if (mountedRef.current) setLoading(false);
    } finally {
      if (mountedRef.current) setRefreshing(false);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    loadAttendance();
    return () => { mountedRef.current = false; };
  }, []);

  // when month changes in the calendar, rebuild markedDates for that month
  const onMonthChange = async (monthObj) => {
    const { year, month } = monthObj;
    setCurrentMonth({ year, month });

    const kid = kids[activeKidIndex] || kids[0];
    if (!kid) return;

    setLoading(true);
    try {
      const attData = await fetchAttendanceRecords(kid);
      const map = buildMarkedForMonth(attData, year, month);
      setAttDataState(attData);
      setMarkedDates(map);
    } catch (e) {
      console.warn('Failed to load month attendance', e);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    console.log('[Attendance] onRefresh called');
    setRefreshing(true);
    await loadAttendance({ skipLoading: true });
  };

  return (
    <LinearGradient
      colors={isDark ? ["#0b0f19", "#1a1f2b"] : ["#f5f5f5", "#e0e0e0"]}
      style={styles.container}
    >
      {/* Header */}
      <View
        style={[
          styles.header,
          { borderBottomColor: isDark ? "#333" : "#ddd" },
        ]}
      >
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
          Attendance
        </Text>
      </View>

      {/* Active child info */}
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={isDark ? '#fff' : '#333'} colors={[isDark ? '#fff' : '#333']} progressBackgroundColor={isDark ? '#111' : '#fff'} />}>
      {activeKid ? (
        <View style={[styles.childCard, { backgroundColor: isDark ? "#1e1e1e" : "#fff" }]}>
          <Text style={[styles.childLabel, { color: isDark ? "#bbb" : "#666" }]}>
            Showing attendance for
          </Text>
          <Text style={[styles.childName, { color: isDark ? "#fff" : "#333" }]}>
            {activeKid.name}
          </Text>
        </View>
      ) : !loading ? (
        <View style={[styles.childCard, { backgroundColor: isDark ? "#1e1e1e" : "#fff" }]}>
          <Text style={[styles.childLabel, { color: isDark ? "#bbb" : "#666" }]}>
            No student record found for this account.
          </Text>
        </View>
      ) : null}

      {/* Calendar */}
      <View
        style={[
          styles.card,
          { backgroundColor: isDark ? "#1e1e1e" : "#fff" },
        ]}
      >
        <Calendar
          markingType={"custom"}
          markedDates={markedDates}
          onMonthChange={onMonthChange}
          theme={{
            backgroundColor: isDark ? "#1e1e1e" : "#fff",
            calendarBackground: isDark ? "#1e1e1e" : "#fff",
            dayTextColor: isDark ? "#fff" : "#000",
            monthTextColor: isDark ? "#fff" : "#000",
            todayTextColor: "#3498db",
            arrowColor: "#3498db",
          }}
        />
      </View>

      {/* Legend */}
      <View style={styles.legendContainer}>
        <View
          style={[
            styles.legendCard,
            { backgroundColor: isDark ? "#1e1e1e" : "#fff" },
          ]}
        >
          <View style={[styles.dot, { backgroundColor: "green" }]} />
          <Text style={{ color: isDark ? "#fff" : "#333" }}>Present</Text>
        </View>
        <View
          style={[
            styles.legendCard,
            { backgroundColor: isDark ? "#1e1e1e" : "#fff" },
          ]}
        >
          <View style={[styles.dot, { backgroundColor: "red" }]} />
          <Text style={{ color: isDark ? "#fff" : "#333" }}>Absent</Text>
        </View>
      </View>
      </ScrollView>
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
    margin: 16,
    borderRadius: 16,
    padding: 10,
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  legendContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 20,
    paddingHorizontal: 20,
  },
  legendCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 6,
  },
  childCard: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 16,
    padding: 16,
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  childLabel: {
    fontSize: 14,
  },
  childName: {
    fontSize: 20,
    fontWeight: "700",
    marginTop: 4,
  },
});

export default Attendance;
