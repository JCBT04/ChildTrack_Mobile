import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TouchableOpacity,
  Alert,
  ScrollView,
  RefreshControl,
  Image,
  ActivityIndicator,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage"; 
// Backend base URL (matches other screens)
const DEFAULT_RENDER_BACKEND_URL = "https://childtrack-backend.onrender.com/";
const BACKEND_URL = DEFAULT_RENDER_BACKEND_URL.replace(/\/$/, "");
import { useTheme } from "../components/ThemeContext";

const Settings = ({ navigation }) => {
  const { darkModeEnabled, setDarkModeEnabled } = useTheme();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [qrText, setQrText] = useState(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrRaw, setQrRaw] = useState(null);
  const [qrNotFound, setQrNotFound] = useState(false);
  const [searchedStudent, setSearchedStudent] = useState(null);
  const [showQrData, setShowQrData] = useState(false);
  const [qrEnlarged, setQrEnlarged] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const isDark = darkModeEnabled;

  // Try to load QR rendering component dynamically. If not installed, we'll fall back to text.
  let QRCodeSVG = null;
  try {
    // `react-native-qrcode-svg` exports a default component
    // npm packages to install if missing:
    // expo: `expo install react-native-svg` then `npm install react-native-qrcode-svg`
    // bare RN: `npm install react-native-svg react-native-qrcode-svg`
    QRCodeSVG = require('react-native-qrcode-svg').default;
  } catch (e) {
    QRCodeSVG = null;
  }
  

  const handleLogout = () => {
    // Immediate logout flow (no confirmation) to ensure tap works.
    // If you want a confirmation dialog, re-enable Alert.alert around logoutNow().
    logoutNow();
  };

  const logoutNow = async () => {
    try {
      console.log('logoutNow: removing session keys (preserving username)');
      // Remove known session keys atomically. Keep `username` so it can be prefilled.
      const keysToRemove = ['lastRoute', 'parent', 'token', 'parents'];
      try {
        await AsyncStorage.multiRemove(keysToRemove);
        console.log('logoutNow: multiRemove succeeded', keysToRemove);
      } catch (mrErr) {
        console.warn('logoutNow: multiRemove failed, falling back to individual removes', mrErr);
        await AsyncStorage.removeItem('lastRoute');
        await AsyncStorage.removeItem('parent');
        await AsyncStorage.removeItem('token');
        await AsyncStorage.removeItem('parents');
      }

      const checkLast = await AsyncStorage.getItem('lastRoute');
      const checkParent = await AsyncStorage.getItem('parent');
      console.log('logoutNow post-remove lastRoute:', checkLast, 'parent:', checkParent);

      // If sensitive session data still exists after removal, clear storage as fallback.
      if (checkParent) {
        console.warn('logoutNow: parent data still present — clearing all AsyncStorage');
        await AsyncStorage.clear();
      }

      navigation.reset({ index: 0, routes: [{ name: 'login' }] });
      try { navigation.replace && navigation.replace('login'); } catch (e) {}

      console.log('logoutNow: navigated to login');
    } catch (error) {
      console.error('logoutNow Error:', error);
      Alert.alert('Error', 'Something went wrong while logging out.');
    }
  };

  const fetchAttendanceQr = async () => {
    // Fetch and return QR payload string (do not auto-show unless caller sets it)
    setQrLoading(true);
    try {
      // Fetch parent records the same way Home does so we match the same student
      const username = await AsyncStorage.getItem('username');
      const token = await AsyncStorage.getItem('token');
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Token ${token}`;

      // Prefer cached parent saved by Home/login — this is the authoritative primary student
      const storedParentRaw = await AsyncStorage.getItem('parent');
      if (storedParentRaw) {
        try {
          const p = JSON.parse(storedParentRaw);
          const studentLrn = p.student_lrn || (p.student && p.student.lrn) || null;
          const studentName = p.student_name || (p.student && p.student.name) || null;

          // Use cached values to query attendance and avoid fetching parent list
          const url = `${BACKEND_URL}/api/attendance/public/`;
          const resp = await fetch(url);
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const data = await resp.json();
          const list = Array.isArray(data) ? data : (data && data.results ? data.results : []);

          let match = null;
          if (studentLrn) {
            match = list.find(it => (it.student_lrn || it.lrn || '').toString() === studentLrn.toString());
          }
          if (!match && studentName) {
            match = list.find(it => (it.student_name || '').toLowerCase() === (studentName || '').toLowerCase());
          }
          // Do NOT fall back to the first attendance record when no exact match
          // returning the first record produced misleading QR results for other students.
          if (!match) {
            console.warn('[Setting] No attendance record matched cached parent', { studentLrn, studentName });
            // store last queried student for UI
            return { searched: { studentLrn, studentName } , result: null };
          }

          const qr = match.qr_code_data || match.qr_data || null;
          if (!qr) return { searched: { studentLrn, studentName }, result: null };

          const raw = qr.toString();
          try {
            const parsed = JSON.parse(raw);
            const pretty = JSON.stringify(parsed, null, 2);
            return { searched: { studentLrn, studentName }, result: { raw, pretty } };
          } catch (e) {
            return { searched: { studentLrn, studentName }, result: { raw, pretty: raw } };
          }
        } catch (e) {
          // if parsing/fetching from cached parent fails, fall back to normal flow below
          console.warn('[Setting] cached parent flow failed', e);
        }
      }

      const extractParentsFromTeachers = (payload) => {
        const teachersArray = Array.isArray(payload)
          ? payload
          : payload && Array.isArray(payload.results)
            ? payload.results
            : [];

        const aggregated = [];
        teachersArray.forEach((teacher) => {
          if (!teacher || typeof teacher !== 'object') return;
          const students = Array.isArray(teacher.students) ? teacher.students : [];
          students.forEach((student) => {
            if (!student || typeof student !== 'object') return;
            const parents = Array.isArray(student.parents_guardians) ? student.parents_guardians : [];
            parents.forEach((parent) => {
              if (parent) aggregated.push(parent);
            });
          });
        });
        return aggregated;
      };

      // Try to fetch parents list (may require token); fallback to all-teachers endpoint like Home
      let fetchedParentRecords = [];
      try {
        const parentsResp = await fetch(`${BACKEND_URL}/api/parents/parents/`, { headers });
        if (!parentsResp.ok) throw new Error(`HTTP ${parentsResp.status}`);
        const parentsData = await parentsResp.json();
        fetchedParentRecords = Array.isArray(parentsData) ? parentsData : (parentsData && parentsData.results ? parentsData.results : []);
      } catch (e) {
        // fallback to all-teachers-students endpoint when token present
        if (token) {
          try {
            const fallbackResp = await fetch(`${BACKEND_URL}/api/parents/all-teachers-students/`, { headers });
            if (fallbackResp.ok) {
              const fallbackData = await fallbackResp.json();
              fetchedParentRecords = extractParentsFromTeachers(fallbackData);
            }
          } catch (fb) {
            console.warn('[Setting] fallback parents fetch failed', fb);
          }
        }
        // last resort: try cached parent
        if (!fetchedParentRecords.length) {
          try {
            const storedParent = await AsyncStorage.getItem('parent');
            if (storedParent) fetchedParentRecords = [JSON.parse(storedParent)];
          } catch (pe) { /* ignore */ }
        }
      }

      const parentsList = username ? fetchedParentRecords.filter(p => p.username === username) : fetchedParentRecords;
      const kids = parentsList.filter(p => p && p.student_name).map(p => ({
        lrn: p.student_lrn || '',
        name: p.student_name,
      }));

      let studentLrn = null;
      let studentName = null;
      if (kids.length) {
        studentLrn = kids[0].lrn;
        studentName = kids[0].name;
      } else {
        // fallback to parent stored record
        const parentRaw = await AsyncStorage.getItem('parent');
        if (parentRaw) {
          try {
            const parent = JSON.parse(parentRaw);
            studentLrn = parent.student_lrn || (parent.student && parent.student.lrn) || null;
            studentName = parent.student_name || (parent.student && parent.student.name) || null;
          } catch (e) { }
        }
      }

      const url = `${BACKEND_URL}/api/attendance/public/`;
      const resp = await fetch(url);
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }
      const data = await resp.json();
      const list = Array.isArray(data) ? data : (data && data.results ? data.results : []);

      // try to find a matching attendance record
      let match = null;
      if (studentLrn) {
        match = list.find(it => (it.student_lrn || it.lrn || '').toString() === studentLrn.toString());
      }
      if (!match && studentName) {
        match = list.find(it => (it.student_name || '').toLowerCase() === studentName.toLowerCase());
      }

      // Do NOT fall back to a different student's attendance record; if there's no
      // exact match, we should report no data so the QR panel doesn't show unrelated information.
      if (!match) {
        console.warn('[Setting] No attendance record matched (no fallback)', { studentLrn, studentName, attendanceCount: list.length });
        return { searched: { studentLrn, studentName }, result: null };
      }

      const qr = match.qr_code_data || match.qr_data || null;
      if (!qr) return { searched: { studentLrn, studentName }, result: null };

      const raw = qr.toString();
      try {
        const parsed = JSON.parse(raw);
        const pretty = JSON.stringify(parsed, null, 2);
        return { searched: { studentLrn, studentName }, result: { raw, pretty } };
      } catch (e) {
        return { searched: { studentLrn, studentName }, result: { raw, pretty: raw } };
      }
    } catch (err) {
      console.warn('[Setting] fetchAttendanceQr error', err);
      // Let caller decide whether to alert; return null on error
      return null;
    } finally {
      setQrLoading(false);
    }
  };

  const handleToggleAttendanceQr = async () => {
    // If currently showing any QR UI (visual or data), hide it on second press
    if (qrRaw || qrText || qrNotFound) {
      setQrText(null);
      setQrRaw(null);
      setQrNotFound(false);
      setSearchedStudent(null);
      setShowQrData(false);
      return;
    }
    setQrNotFound(false);
    const result = await fetchAttendanceQr();
    // result may be null (error), or { searched, result: { raw, pretty } } or { searched, result: null }
    if (!result) {
      setQrRaw(null);
      setQrText(null);
      setQrNotFound(true);
      setSearchedStudent(null);
      return;
    }
    setSearchedStudent(result.searched || null);
    if (result.result) {
      setQrRaw(result.result.raw);
      setQrText(result.result.pretty);
      setQrNotFound(false);
      // keep data hidden by default; user must press "Show data"
      setShowQrData(false);
    } else {
      setQrRaw(null);
      setQrText(null);
      setQrNotFound(true);
      setShowQrData(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      // Fetch but do NOT auto-open the QR panel when closed.
      const result = await fetchAttendanceQr();
      if (!result) {
        // error occurred while fetching
        setSearchedStudent(null);
        // keep existing QR if visible, otherwise show no-data
        if (!qrRaw && !qrText) setQrNotFound(true);
        return;
      }

      // Always update which student we searched for
      setSearchedStudent(result.searched || null);

      // If the QR panel is currently visible, refresh its contents
      if (qrRaw || qrText) {
        if (result.result) {
          setQrRaw(result.result.raw);
          setQrText(result.result.pretty);
          setQrNotFound(false);
        } else {
          // No matching attendance record after refresh
          setQrRaw(null);
          setQrText(null);
          setQrNotFound(true);
        }
      } else {
        // Panel closed: don't auto-open. But update not-found indicator so the UI is accurate when opened.
        if (result.result) {
          setQrNotFound(false);
        } else {
          setQrNotFound(true);
        }
      }
    } catch (e) {
      console.warn('[Setting] onRefresh error', e);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <LinearGradient
      colors={isDark ? ["#0b0f19", "#1a1f2b"] : ["#f5f5f5", "#e0e0e0"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
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
          Settings
        </Text>
      </View>

      {/* Profile */}
      <TouchableOpacity onPress={() => navigation.navigate("profile")}>
        <LinearGradient
          colors={isDark ? ["#1e1e1e", "#121212"] : ["#ffffff", "#f4f6f9"]}
          style={styles.item}
        >
          <Ionicons name="person-circle-outline" size={24} color="#3498db" />
          <Text style={[styles.itemText, { color: isDark ? "#fff" : "#333" }]}>
            Profile
          </Text>
        </LinearGradient>
      </TouchableOpacity>

      {/* Fetch Attendance QR */}
      <TouchableOpacity onPress={handleToggleAttendanceQr}>
        <LinearGradient
          colors={isDark ? ["#1e1e1e", "#121212"] : ["#ffffff", "#f4f6f9"]}
          style={styles.item}
        >
          <Ionicons name="qr-code-outline" size={24} color="#16a085" />
          <Text style={[styles.itemText, { color: isDark ? "#fff" : "#333" }]}>Fetch Attendance QR</Text>
        </LinearGradient>
      </TouchableOpacity>

      {qrRaw ? (
        <LinearGradient
          colors={isDark ? ["#121212", "#0b0f19"] : ["#ffffff", "#f4f6f9"]}
          style={[styles.item, { alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }]}
        >
          {qrLoading ? (
            <ActivityIndicator size="small" color={isDark ? '#fff' : '#333'} />
          ) : null}

          {/* If the QR payload is an image data URL, show it as an image */}
          {qrRaw && typeof qrRaw === 'string' && qrRaw.startsWith('data:') ? (
            <TouchableOpacity activeOpacity={0.9} onPress={() => setQrEnlarged(true)}>
              <View style={{ padding: 6, backgroundColor: '#fff', borderRadius: 8, marginBottom: 8 }}>
                <Image source={{ uri: qrRaw }} style={{ width: 220, height: 220 }} resizeMode="contain" />
              </View>
            </TouchableOpacity>
          ) : qrRaw && QRCodeSVG ? (
            // Render a QR widget when library is available
            <TouchableOpacity activeOpacity={0.9} onPress={() => setQrEnlarged(true)}>
              <View style={{ alignItems: 'center', marginBottom: 8 }}>
                <View style={{ padding: 6, backgroundColor: '#fff', borderRadius: 8 }}>
                  <QRCodeSVG value={qrRaw} size={200} color="#000" backgroundColor="#fff" />
                </View>
              </View>
            </TouchableOpacity>
          ) : (
            // When library missing, we'll still show the pretty text below
            <View style={{ paddingHorizontal: 6 }} />
          )}

          {/* Toggle show/hide of the QR payload text */}
          {qrRaw ? (
            <View style={{ flexDirection: 'row', marginTop: 6 }}>
              <TouchableOpacity
                onPress={() => setShowQrData(s => !s)}
                style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: isDark ? '#2b2b2b' : '#eef2f5' }}
              >
                <Text style={{ color: isDark ? '#fff' : '#333', fontSize: 12 }}>
                  {showQrData ? 'Hide data' : 'Show data'}
                </Text>
              </TouchableOpacity>
              
            </View>
          ) : null}

          {/* Always show the QR payload text (pretty-printed when available) under the visual QR */}
          {qrText && showQrData ? (
            <View style={{ paddingHorizontal: 8, marginTop: 6 }}>
              <Text style={{ color: isDark ? '#fff' : '#333', fontSize: 12 }}>{qrText}</Text>
            </View>
          ) : null}
        </LinearGradient>
      ) : null}

      {qrNotFound ? (
        <LinearGradient
          colors={isDark ? ["#121212", "#0b0f19"] : ["#ffffff", "#f4f6f9"]}
          style={[styles.item, { alignItems: 'center', justifyContent: 'center' }]}
        >
              <Text style={{ color: isDark ? '#fff' : '#333', fontSize: 14 }}>
                {`No attendance QR data found${searchedStudent && (searchedStudent.studentName || searchedStudent.studentLrn) ? ' for ' : ''}`}
                {searchedStudent && searchedStudent.studentName ? `${searchedStudent.studentName}` : ''}
                {searchedStudent && searchedStudent.studentLrn ? ` ${searchedStudent.studentLrn ? `(LRN: ${searchedStudent.studentLrn})` : ''}` : ''}
                .
              </Text>
        </LinearGradient>
      ) : null}

      {/* Modal for enlarged QR */}
      <Modal visible={qrEnlarged} transparent animationType="fade" onRequestClose={() => setQrEnlarged(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setQrEnlarged(false)}>
          <View style={styles.modalContent}>
            {qrRaw && typeof qrRaw === 'string' && qrRaw.startsWith('data:') ? (
              <View style={{ padding: 12, backgroundColor: '#fff', borderRadius: 12 }}>
                <Image source={{ uri: qrRaw }} style={{ width: 340, height: 340 }} resizeMode="contain" />
              </View>
            ) : QRCodeSVG ? (
              <View style={{ alignItems: 'center' }}>
                <View style={{ padding: 12, backgroundColor: '#fff', borderRadius: 12 }}>
                  <QRCodeSVG value={qrRaw} size={340} color="#000" backgroundColor="#fff" />
                </View>
              </View>
            ) : null}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Notifications */}
      <LinearGradient
        colors={isDark ? ["#1e1e1e", "#121212"] : ["#ffffff", "#f4f6f9"]}
        style={styles.item}
      >
        <Ionicons name="notifications-outline" size={24} color="#f39c12" />
        <Text style={[styles.itemText, { color: isDark ? "#fff" : "#333" }]}>
          Notifications
        </Text>
        <Switch
          value={notificationsEnabled}
          onValueChange={setNotificationsEnabled}
          thumbColor={notificationsEnabled ? "#27ae60" : "#ccc"}
        />
      </LinearGradient>

      {/* Dark Mode */}
      <LinearGradient
        colors={isDark ? ["#1e1e1e", "#121212"] : ["#ffffff", "#f4f6f9"]}
        style={styles.item}
      >
        <Ionicons name="moon-outline" size={24} color="#8e44ad" />
        <Text style={[styles.itemText, { color: isDark ? "#fff" : "#333" }]}>
          Dark Mode
        </Text>
        <Switch
          value={isDark}
          onValueChange={setDarkModeEnabled}
          thumbColor={isDark ? "#27ae60" : "#ccc"}
        />
      </LinearGradient>

      {/* Change Password */}
      <TouchableOpacity onPress={() => navigation.navigate("changepass")}>
        <LinearGradient
          colors={isDark ? ["#1e1e1e", "#121212"] : ["#ffffff", "#f4f6f9"]}
          style={styles.item}
        >
          <Ionicons name="lock-closed-outline" size={24} color="#2ecc71" />
          <Text style={[styles.itemText, { color: isDark ? "#fff" : "#333" }]}>
            Change Password
          </Text>
        </LinearGradient>
      </TouchableOpacity>

      {/* Logout */}
      <TouchableOpacity onPress={handleLogout}>
        <LinearGradient
          colors={isDark ? ["#1e1e1e", "#121212"] : ["#ffffff", "#f4f6f9"]}
          style={styles.item}
        >
          <Ionicons name="log-out-outline" size={24} color="#e74c3c" />
          <Text style={[styles.itemText, { color: isDark ? "#fff" : "#333" }]}>
            Logout
          </Text>
        </LinearGradient>
      </TouchableOpacity>
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
    borderBottomColor: "#ddd",
    marginTop: 40,
  },
  headerTitle: { fontSize: 20, fontWeight: "700", marginLeft: 12 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 8,
    elevation: 2,
  },
  itemText: {
    flex: 1,
    fontSize: 16,
    marginLeft: 12,
    fontWeight: "500",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'transparent',
    padding: 12,
    borderRadius: 12,
  },
});

export default Settings;
