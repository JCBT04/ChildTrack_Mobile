
import React, { createContext, useContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  const [darkModeEnabled, setDarkModeEnabled] = useState(false);

  // Load saved theme on app start
  useEffect(() => {
    const loadTheme = async () => {
      try {
        const savedTheme = await AsyncStorage.getItem("darkMode");
        if (savedTheme !== null) {
          setDarkModeEnabled(savedTheme === "true");
        }
      } catch (e) {
        console.log("Error loading theme:", e);
      }
    };
    loadTheme();
  }, []);

  // Save theme whenever it changes
  const toggleTheme = async (value) => {
    try {
      setDarkModeEnabled(value);
      await AsyncStorage.setItem("darkMode", value.toString());
    } catch (e) {
      console.log("Error saving theme:", e);
    }
  };

  return (
    <ThemeContext.Provider
      value={{ darkModeEnabled, setDarkModeEnabled: toggleTheme }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
