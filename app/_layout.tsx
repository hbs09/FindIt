import { Session } from '@supabase/supabase-js';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { supabase } from '../supabase';

// 1. Tenta manter o Splash visível.
SplashScreen.preventAutoHideAsync().catch(() => null);

export default function RootLayout() {
    const [session, setSession] = useState<Session | null>(null);
    const [initialized, setInitialized] = useState(false);
    const router = useRouter();
    const segments = useSegments();

    useEffect(() => {
        const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
            setSession(session);
            setInitialized(true);
        });

        return () => {
            data.subscription.unsubscribe();
        };
    }, []);

    // 2. Esconder o Splash apenas uma vez quando inicializado
    useEffect(() => {
        if (initialized) {
            SplashScreen.hideAsync().catch(() => null);
        }
    }, [initialized]);

    // 3. Proteção de Rotas
    useEffect(() => {
        if (!initialized) return;

        const inLoginGroup = segments[0] === 'login';

        if (!session && !inLoginGroup) {
            router.replace('/login');
        } else if (session && inLoginGroup) {
            router.replace('/(tabs)');
        }
    }, [session, initialized, segments]);

    if (!initialized) {
        return <View style={{ flex: 1, backgroundColor: '#121212' }} />;
    }

    return (
        <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="login" />
            <Stack.Screen name="(tabs)" />
            
            {/* O salão mantém-se como Modal (com o efeito de folha/contorno) */}
            <Stack.Screen name="salon/[id]" options={{ presentation: 'modal' }} />
            
            {/* CORREÇÃO: 'fullScreenModal' garante que abre POR CIMA do modal do salão */}
            <Stack.Screen name="book-confirm" options={{ presentation: 'fullScreenModal' }} />
            
            {/* Sucesso também cobre tudo e bloqueia o gesto de voltar */}
            <Stack.Screen name="success" options={{ presentation: 'fullScreenModal', gestureEnabled: false }} />
            
            <Stack.Screen name="history" />
            <Stack.Screen name="favorites" />
            <Stack.Screen name="manager" />
        </Stack>
    );
}