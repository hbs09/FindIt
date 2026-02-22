import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native'; // Deteta o tema do sistema
import { Colors } from '../constants/Colors';

type ThemeType = 'light' | 'dark';

interface ThemeContextData {
    theme: ThemeType;
    isDarkMode: boolean;
    colors: typeof Colors.light;
    toggleTheme: (value: boolean) => void;
}

const ThemeContext = createContext<ThemeContextData>({} as ThemeContextData);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    // Começa com o tema do sistema do telemóvel do utilizador
    const systemTheme = useColorScheme() as ThemeType;
    const [theme, setTheme] = useState<ThemeType>(systemTheme || 'light');

    // Ao abrir a app, verifica se o utilizador já tinha forçado um tema
    useEffect(() => {
        async function loadTheme() {
            const savedTheme = await AsyncStorage.getItem('@app_theme');
            if (savedTheme) {
                setTheme(savedTheme as ThemeType);
            }
        }
        loadTheme();
    }, []);

    // Função para alterar o tema e guardar no telemóvel
    const toggleTheme = async (isDark: boolean) => {
        const newTheme = isDark ? 'dark' : 'light';
        setTheme(newTheme);
        await AsyncStorage.setItem('@app_theme', newTheme);
    };

    const isDarkMode = theme === 'dark';
    const colors = Colors[theme];

    return (
        <ThemeContext.Provider value={{ theme, isDarkMode, colors, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

// Hook personalizado para usar o tema facilmente em qualquer ecrã
export function useTheme() {
    return useContext(ThemeContext);
}