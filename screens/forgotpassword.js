import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../components/ThemeContext";

const ForgotPassword = ({ navigation }) => {
  const { darkModeEnabled } = useTheme();
  const isDark = darkModeEnabled;
  const [email, setEmail] = useState("");

  const handleReset = () => {
    alert("Reset link sent to: " + email);
    navigation.replace("login");
  };

  return (
    <LinearGradient
      colors={isDark ? ["#0b0f19", "#1a1f2b"] : ["#f5f5f5", "#e0e0e0"]}
      style={styles.container}
    >
      {/* Logo */}
      <Image
        source={require("../assets/lg.png")}
        style={styles.logo}
        resizeMode="contain"
      />

      {/* Card */}
      <View style={[styles.card, isDark ? styles.darkCard : styles.lightCard]}>
        <Text style={[styles.title, isDark ? styles.darkText : styles.lightText]}>
          Reset Password
        </Text>
        <Text
          style={[
            styles.subtitle,
            isDark ? styles.darkSubText : styles.lightSubText,
          ]}
        >
          Enter your email to receive a reset link
        </Text>

        {/* Email Input */}
        <View
          style={[
            styles.inputContainer,
            isDark ? styles.darkInput : styles.lightInput,
          ]}
        >
          <Ionicons
            name="mail-outline"
            size={20}
            color={isDark ? "#aaa" : "#666"}
            style={styles.icon}
          />
          <TextInput
            placeholder="Email"
            placeholderTextColor={isDark ? "#aaa" : "#666"}
            style={[styles.input, { color: isDark ? "#fff" : "#000" }]}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        {/* Reset Button */}
        <TouchableOpacity onPress={handleReset}>
          <LinearGradient
            colors={
              isDark
                ? ["#0D47A1", "#1565C0"] // dark mode = deep blue button
                : ["#3498db", "#2980b9"] // light mode = bright blue button
            }
            style={styles.button}
          >
            <Text style={styles.buttonText}>Send Reset Link</Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* Back to Login */}
        <TouchableOpacity
          onPress={() => navigation.replace("login")}
          style={{ marginTop: 15 }}
        >
          <Text style={[styles.backText, isDark ? styles.darkLink : styles.lightLink]}>
            ← Back to Login
          </Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  logo: {
    width: 180,
    height: 180,
    marginBottom: 20,
  },
  card: {
    width: "100%",
    borderRadius: 20,
    padding: 25,
    elevation: 5,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 5 },
    shadowRadius: 10,
  },
  lightCard: {
    backgroundColor: "#fff",
  },
  darkCard: {
    backgroundColor: "#1a1a1a",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 20,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    padding: 12,
    borderRadius: 12,
    marginBottom: 15,
  },
  input: {
    flex: 1,
    fontSize: 16,
    marginLeft: 8,
  },
  lightInput: {
    backgroundColor: "#f2f2f2",
  },
  darkInput: {
    backgroundColor: "#2a2a2a",
  },
  icon: {
    marginRight: 6,
  },
  button: {
    width: "100%",
    padding: 15,
    borderRadius: 12,
    alignItems: "center",
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  lightText: {
    color: "#000",
  },
  darkText: {
    color: "#fff",
  },
  lightSubText: {
    color: "#444",
  },
  darkSubText: {
    color: "#bbb",
  },
  lightLink: {
    color: "#0288D1",
  },
  darkLink: {
    color: "#4FC3F7",
  },
  backText: {
    fontSize: 14,
    textDecorationLine: "underline",
    textAlign: "center",
  },
});

export default ForgotPassword;
