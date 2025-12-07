import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient"; // ✅ Gradient
import { useTheme } from "../components/ThemeContext";
import AsyncStorage from '@react-native-async-storage/async-storage';


const Unauthorized = ({ navigation }) => {
  const { darkModeEnabled } = useTheme();
  const isDark = darkModeEnabled;

  const [unauthorizedGuardians, setUnauthorizedGuardians] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const loadUnauthorized = async ({ skipLoading = false } = {}) => {
    if (!skipLoading) setLoading(true);
    try {
      const username = await AsyncStorage.getItem('username');
      let studentId = null;

      if (username) {
        const parentsResp = await fetch(`${BACKEND_URL}/api/parent/`);
        const parentsData = await parentsResp.json();
        const parent = Array.isArray(parentsData)
          ? parentsData.find(p => p.username === username)
          : (parentsData && parentsData.results ? parentsData.results.find(p => p.username === username) : null);

        if (parent) {
          const studentsResp = await fetch(`${BACKEND_URL}/api/student/`);
          let students = await studentsResp.json();
          if (students && students.results) students = students.results;
          if (!Array.isArray(students)) students = [];

          const student = students.find(s => {
            if (!s) return false;
            const sParent = s.parent;
            if (sParent == null) return false;
            if (typeof sParent === 'object') return (sParent.id === parent.id || sParent === parent.id);
            return sParent === parent.id;
          });

          if (student) studentId = student.id;
        }
      }

      const resp = await fetch(`${BACKEND_URL}/api/guardian/`);
      let data = await resp.json();
      if (data && data.results) data = data.results;
      if (!Array.isArray(data)) data = [];

      const filtered = data.filter(g => {
        if (!g) return false;
        if (g.authorized) return false;
        if (!studentId) return true;
        const gStudent = g.student;
        if (!gStudent) return false;
        if (typeof gStudent === 'object') return (gStudent.id === studentId || gStudent === studentId);
        return gStudent === studentId;
      }).map(g => ({
        id: g.id,
        name: g.name,
        reason: g.phone ? `Phone: ${g.phone}` : 'Not registered in system'
      }));

      setUnauthorizedGuardians(filtered);
      setError(null);
    } catch (err) {
      console.warn('Failed to load unauthorized guardians', err);
      setError('Failed to load data');
      setUnauthorizedGuardians([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { loadUnauthorized(); }, []);

  const onRefresh = async () => {
    console.log('[Unauthorized] onRefresh called');
    setRefreshing(true);
    await loadUnauthorized({ skipLoading: true });
  };

  const renderItem = ({ item }) => (
    <View
      style={[
        styles.card,
        { backgroundColor: isDark ? "#1e1e1e" : "#fff" },
      ]}
    >
      <Ionicons
        name="person-remove-outline"
        size={40}
        color="#e74c3c"
        style={styles.icon}
      />
      <View style={{ flex: 1 }}>
        <Text style={[styles.name, { color: isDark ? "#fff" : "#333" }]}>
          {item.name}
        </Text>
        <Text style={[styles.reason, { color: isDark ? "#bbb" : "#777" }]}> 
          {item.reason}
        </Text>
      </View>
      <Ionicons name="close-circle" size={28} color="#e74c3c" />
    </View>
  );

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
          Unauthorized Guardians
        </Text>
      </View>

      {/* List */}
      {loading ? (
        <View style={{ padding: 16 }}>
          <Text style={{ color: isDark ? '#fff' : '#333' }}>Loading…</Text>
        </View>
      ) : (
        <FlatList
          data={unauthorizedGuardians}
          renderItem={renderItem}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={() => (
            <View style={{ padding: 24, alignItems: 'center' }}>
              <Text style={{ color: isDark ? '#ddd' : '#555' }}>{error ? error : 'No unauthorized guardians.'}</Text>
            </View>
          )}
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
      )}
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
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  icon: {
    marginRight: 12,
  },
  name: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 2,
  },
  reason: {
    fontSize: 13,
  },
});

export default Unauthorized;
