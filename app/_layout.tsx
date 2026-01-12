import { Session } from '@supabase/supabase-js';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { supabase } from '../supabase';

// 1. Tenta manter o Splash visível. Se falhar (já não existe), ignora o erro.
SplashScreen.preventAutoHideAsync().catch(() => null);

export default function RootLayout() {
    const [session, setSession] = useState<Session | null>(null);
    const [initialized, setInitialized] = useState(false);
    const router = useRouter();
    const segments = useSegments();

    useEffect(() => {
        // Escutar alterações na autenticação
        const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
            setSession(session);
            setInitialized(true);
        });

        return () => {
            data.subscription.unsubscribe();
        };
    }, []);

    useEffect(() => {
        if (!initialized) return;

        // 2. Tenta esconder o Splash. Se der erro, ignora silenciosamente.
        SplashScreen.hideAsync().catch(() => null);

        const inLoginGroup = segments[0] === 'login';

        if (!session && !inLoginGroup) {
            // Se não tem sessão e não está no login -> Manda para login
            router.replace('/login');
        } else if (session && inLoginGroup) {
            // Se tem sessão e tenta ir ao login -> Manda para home
            router.replace('/(tabs)');
        }
        
    }, [session, initialized, segments]);

    if (!initialized) {
        // Ecrã de fundo enquanto carrega para não piscar
        return <View style={{ flex: 1, backgroundColor: '#121212' }} />;
    }

    return (
        <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="login" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="salon/[id]" options={{ presentation: 'modal' }} />
            <Stack.Screen name="history" />
            <Stack.Screen name="favorites" />
            <Stack.Screen name="manager" />
        </Stack>
    );
}