import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TouchableOpacity,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage"; 
import { useTheme } from "../components/ThemeContext";

const Settings = ({ navigation }) => {
  const { darkModeEnabled, setDarkModeEnabled } = useTheme();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  const isDark = darkModeEnabled;

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

  return (
    <LinearGradient
      colors={isDark ? ["#0b0f19", "#1a1f2b"] : ["#f5f5f5", "#e0e0e0"]}
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
});

export default Settings;
