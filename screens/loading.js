import React, { useEffect } from "react";
import {
  View,
  Image,
  StyleSheet,
  Text,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from "../components/ThemeContext";

const LoadingScreen = ({ navigation }) => {
  const { darkModeEnabled } = useTheme();
  const isDark = darkModeEnabled;

  useEffect(() => {
    // On load, always require an explicit login (do not auto-restore sessions)
    // This enforces that closing and reopening the app requires signing in again.
    const MIN_DISPLAY_MS = 3000;
    let mounted = true;
    (async () => {
      const start = Date.now();
      try {
        // Clear any persisted session tokens so the app always lands on login.
        // Preserve `username` so the login screen can prefill it for convenience.
        await AsyncStorage.removeItem('token');
        await AsyncStorage.removeItem('parent');
        await AsyncStorage.removeItem('parent_must_change');
        const elapsed = Date.now() - start;
        const wait = Math.max(0, MIN_DISPLAY_MS - elapsed);
        if (!mounted) return;
        setTimeout(() => {
          if (!mounted) return;
          try {
            navigation.replace('login');
          } catch (e) {
            navigation.navigate('login');
          }
        }, wait);
      } catch (err) {
        const elapsed = Date.now() - start;
        const wait = Math.max(0, MIN_DISPLAY_MS - elapsed);
        setTimeout(() => {
          if (!mounted) return;
          navigation.replace('login');
        }, wait);
      }
    })();

    return () => { mounted = false; };
  }, [navigation]);

  return (
    <LinearGradient
     colors={isDark ? ['#0b0f19', '#1a1f2b'] : ['#f5f5f5', '#e0e0e0']}
      style={styles.container}
    >
      <Image
        source={require("../assets/lg.png")} // place your logo here
        style={styles.logo}
        resizeMode="contain"
      />
      <ActivityIndicator
        size="large"
        color={isDark ? "#fff" : "#000"}
        style={{ marginTop: 20 }}
      />
      <Text style={[styles.text, { color: isDark ? "#fff" : "#000" }]}>
        Loading...
      </Text>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  logo: {
    width: 180,
    height: 180,
  },
  text: {
    marginTop: 10,
    fontSize: 18,
    fontWeight: "600",
  },
});

export default LoadingScreen;
