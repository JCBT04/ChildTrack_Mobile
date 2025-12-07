import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
  Platform,
  ScrollView,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../components/ThemeContext";

const DEFAULT_RENDER_BACKEND_URL = "https://childtrack-backend.onrender.com/";

const Login = ({ navigation }) => {
  const { darkModeEnabled } = useTheme();
  const isDark = darkModeEnabled;
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [secureText, setSecureText] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [parentsLoading, setParentsLoading] = useState(false);
  const [parentsData, setParentsData] = useState(null);
  const [rememberMe, setRememberMe] = useState(false);

  const handleLogin = async () => {
    const trimmedUsername = (username || '').trim();
    const trimmedPassword = (password || '').trim();
    if (!trimmedUsername || !trimmedPassword) {
      setErrorMessage("Please fill all credentials");
      return;
    }

    setLoading(true);
    setErrorMessage("");

    try {
      const parentLoginUrl = `${DEFAULT_RENDER_BACKEND_URL.replace(/\/$/, "")}/api/parents/login/`;
      const presp = await fetch(parentLoginUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: trimmedUsername, password: trimmedPassword }),
      });
      let pjson = null;
      try {
        pjson = await presp.json();
      } catch (e) {
        pjson = null;
      }

      console.warn('[Login] parent login response', presp.status, pjson);
      if (!presp.ok) {
        const serverMsg = (pjson && (pjson.error || pjson.detail)) || `HTTP ${presp.status}`;
        setErrorMessage(serverMsg.toString());
        setLoading(false);
        return;
      }


      if (pjson && pjson.parent) {
        // Persist parent object (used for offline/public flows)
        await AsyncStorage.setItem("parent", JSON.stringify(pjson.parent));

        // Always remember username to prefill later (more user-friendly)
        await AsyncStorage.setItem("username", trimmedUsername);

        // If user chose Remember me, also store password and token (if present)
        if (rememberMe) {
          // WARNING: storing plain passwords in AsyncStorage is insecure. Use encrypted storage in production.
          await AsyncStorage.setItem("password", trimmedPassword);
          await AsyncStorage.setItem("remember_me", "1");
          if (pjson.token) {
            await AsyncStorage.setItem("token", pjson.token);
          }
        } else {
          // Clean up any previously stored sensitive credentials but keep username
          await AsyncStorage.removeItem("password");
          await AsyncStorage.removeItem("remember_me");
          if (pjson.token) {
            await AsyncStorage.removeItem("token");
          }
        }

        if (pjson.parent.must_change_credentials) {
          await AsyncStorage.setItem('parent_must_change', '1');
        } else {
          await AsyncStorage.removeItem('parent_must_change');
        }

        setErrorMessage("");
        if (pjson.parent.must_change_credentials) {
          navigation.navigate('profile', { forceChange: true });
        } else {
          navigation.navigate('home');
        }
        setLoading(false);
        return;
      }

      try {
        setParentsLoading(true);
        const parents = await fetchParents(json && json.token);
        setParentsData(parents);
      } catch (e) {
        console.warn("[Login] fetchParents failed", e);
      } finally {
        setParentsLoading(false);
      }

      setErrorMessage("");
      navigation.navigate("home");
    } catch (err) {
      console.error("[Login] error", err);
      setErrorMessage("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const fetchParents = async () => {
    const base = DEFAULT_RENDER_BACKEND_URL.replace(/\/$/, "");
    const url = `${base}/api/parents/parents/`;
    try {
      const token = await AsyncStorage.getItem("token");
      const headers = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Token ${token}`;

      const res = await fetch(url, { method: "GET", headers });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }
      const data = await res.json();
      await AsyncStorage.setItem("parents", JSON.stringify(data));
      return data;
    } catch (err) {
      console.error("[fetchParents] error", err);
      throw err;
    }
  };

  const passwordRef = useRef(null);

  useEffect(() => {
    const loadSaved = async () => {
      try {
        const rem = await AsyncStorage.getItem("remember_me");
        if (rem === "1") setRememberMe(true);
        const savedUsername = await AsyncStorage.getItem("username");
        if (savedUsername) setUsername(savedUsername);
        const savedPassword = await AsyncStorage.getItem("password");
        if (savedPassword) setPassword(savedPassword);

        // If a token exists in storage, assume user chose to stay signed in
        const token = await AsyncStorage.getItem("token");
        if (token) {
          // replace to avoid back navigation
          navigation.replace("home");
        }
      } catch (e) {
        console.warn("[Login] loadSaved error", e);
      }
    };
    loadSaved();
  }, []);

  return (
    <LinearGradient
      colors={isDark ? ["#0b0f19", "#1a1f2b"] : ["#f5f5f5", "#e0e0e0"]}
      style={styles.container}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        <TouchableWithoutFeedback onPress={() => Keyboard.dismiss()}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            bounces={false}
            showsVerticalScrollIndicator={false}
          >
            <Image
              source={require("../assets/lg.png")}
              style={styles.logo}
              resizeMode="contain"
            />

            <View style={[styles.card, isDark ? styles.darkCard : styles.lightCard]}>
              <Text style={[styles.title, isDark ? styles.darkText : styles.lightText]}>
                Welcome Back
              </Text>
              <Text
                style={[styles.subtitle, isDark ? styles.darkSubText : styles.lightSubText]}
              >
                Login to continue
              </Text>

              {/* Username Input */}
              <View style={[styles.inputContainer, isDark ? styles.darkInput : styles.lightInput]}>
                <Ionicons
                  name="person-outline"
                  size={20}
                  color={isDark ? "#aaa" : "#666"}
                  style={styles.icon}
                />
                <TextInput
                  placeholder="Username"
                  placeholderTextColor={isDark ? "#aaa" : "#666"}
                  style={[styles.input, { color: isDark ? "#fff" : "#000" }]}
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current && passwordRef.current.focus()}
                />
              </View>

              {/* Password Input */}
              <View style={[styles.inputContainer, isDark ? styles.darkInput : styles.lightInput]}>
                <Ionicons
                  name="lock-closed-outline"
                  size={20}
                  color={isDark ? "#aaa" : "#666"}
                  style={styles.icon}
                />
                <TextInput
                  ref={passwordRef}
                  placeholder="Password"
                  placeholderTextColor={isDark ? "#aaa" : "#666"}
                  style={[styles.input, { color: isDark ? "#fff" : "#000" }]}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={secureText}
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                />
                <TouchableOpacity onPress={() => setSecureText(!secureText)} style={styles.eyeIcon}>
                  <Ionicons
                    name={secureText ? "eye-off-outline" : "eye-outline"}
                    size={20}
                    color={isDark ? "#aaa" : "#666"}
                  />
                </TouchableOpacity>
              </View>

              {/* Error message */}
              {errorMessage ? (
                <Text style={styles.errorText}>{errorMessage}</Text>
              ) : null}

              {/* Remember me checkbox */}
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
                <TouchableOpacity
                  onPress={() => setRememberMe(!rememberMe)}
                  style={[
                    styles.checkbox,
                    isDark ? { borderColor: "#888" } : { borderColor: "#666" },
                  ]}
                >
                  {rememberMe ? (
                    <Ionicons name="checkmark" size={16} color={isDark ? "#fff" : "#000"} />
                  ) : null}
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setRememberMe(!rememberMe)}>
                  <Text style={[styles.rememberText, isDark ? styles.darkText : styles.lightText]}>
                    Remember me
                  </Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity onPress={handleLogin} disabled={loading}>
                <LinearGradient
                  colors={isDark ? ["#0D47A1", "#1565C0"] : ["#4FC3F7", "#0288D1"]}
                  style={styles.button}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.buttonText}>Login</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: { 
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 40,
  },
  logo: { 
    width: 180, 
    height: 180, 
    marginBottom: 20,
    alignSelf: "center"
  },
  card: { 
    width: "100%", 
    borderRadius: 20, 
    padding: 25, 
    elevation: 5, 
    shadowColor: "#000", 
    shadowOpacity: 0.15, 
    shadowOffset: { width: 0, height: 5 }, 
    shadowRadius: 10 
  },
  lightCard: { backgroundColor: "#fff" },
  darkCard: { backgroundColor: "#1a1a1a" },
  title: { fontSize: 26, fontWeight: "700" },
  subtitle: { fontSize: 14, marginBottom: 20 },
  inputContainer: { 
    flexDirection: "row", 
    alignItems: "center", 
    width: "100%", 
    padding: 12, 
    borderRadius: 12, 
    marginBottom: 15 
  },
  input: { flex: 1, fontSize: 16, marginLeft: 8 },
  lightInput: { backgroundColor: "#f2f2f2" },
  darkInput: { backgroundColor: "#2a2a2a" },
  icon: { marginRight: 6, marginLeft: -2 },
  eyeIcon: { position: "absolute", right: 12 },
  forgotPassword: { 
    marginTop: 15, 
    fontSize: 14,
    textAlign: "center"
  },
  lightLink: { color: "#0288D1" },
  darkLink: { color: "#4FC3F7" },
  button: { 
    width: "100%", 
    padding: 15, 
    borderRadius: 12, 
    alignItems: "center",
    marginTop: 10
  },
  buttonText: { fontSize: 16, fontWeight: "600", color: "#fff" },
  lightText: { color: "#000" },
  darkText: { color: "#fff" },
  lightSubText: { color: "#444" },
  darkSubText: { color: "#bbb" },
  errorText: { color: "#d32f2f", marginBottom: 15, textAlign: "center" },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 1.5,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  rememberText: { marginLeft: 10, fontSize: 14 },
});

export default Login