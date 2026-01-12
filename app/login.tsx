import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { supabase } from '../supabase';

export default function LoginScreen() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [loading, setLoading] = useState(false);
    const [isRegistering, setIsRegistering] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    async function handleAuth() {
        if (!email || !password) return Alert.alert("Erro", "Por favor preencha todos os campos.");
        setLoading(true);

        try {
            if (isRegistering) {
                if (!name) {
                    setLoading(false);
                    return Alert.alert("Erro", "Por favor introduza o seu nome.");
                }
                const { error } = await supabase.auth.signUp({
                    email: email,
                    password: password,
                    options: { data: { full_name: name, avatar_url: '' } }
                });
                if (error) throw error;
                Alert.alert("Sucesso", "Conta criada! Verifica o teu email ou entra agora.");
                setIsRegistering(false);
            } else {
                const { error } = await supabase.auth.signInWithPassword({
                    email: email,
                    password: password,
                });
                if (error) throw error;
                router.replace('/(tabs)');
            }
        } catch (error: any) {
            Alert.alert("Erro", error.message || "Ocorreu um erro inesperado.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar style="light" />
            <KeyboardAvoidingView 
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                style={{ flex: 1 }}
            >
                <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                    
                    {/* --- CABEÇALHO --- */}
                    <View style={styles.header}>
                        {/* MUDANÇA: Nome FindIt e ponto Azul */}
                        <Text style={styles.brandText}>FindIt<Text style={{color:'#007AFF'}}>.</Text></Text>
                        <Text style={styles.welcomeText}>
                            {isRegistering ? "Cria a tua conta\ne começa a explorar." : "Bem-vindo de volta.\nEncontra o que precisas."}
                        </Text>
                    </View>

                    {/* --- ABAS DE NAVEGAÇÃO --- */}
                    <View style={styles.tabContainer}>
                        <TouchableOpacity onPress={() => setIsRegistering(false)} style={styles.tabBtn}>
                            <Text style={[styles.tabText, !isRegistering && styles.tabTextActive]}>Login</Text>
                            {/* MUDANÇA: Linha Azul */}
                            {!isRegistering && <View style={styles.activeLine} />}
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setIsRegistering(true)} style={styles.tabBtn}>
                            <Text style={[styles.tabText, isRegistering && styles.tabTextActive]}>Registar</Text>
                            {/* MUDANÇA: Linha Azul */}
                            {isRegistering && <View style={styles.activeLine} />}
                        </TouchableOpacity>
                    </View>

                    {/* --- FORMULÁRIO --- */}
                    <View style={styles.form}>
                        {isRegistering && (
                            <View style={styles.inputGroup}>
                                <Text style={styles.label}>NOME COMPLETO</Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder="Ex: João Silva"
                                    placeholderTextColor="#666"
                                    value={name}
                                    onChangeText={setName}
                                    autoCapitalize="words"
                                />
                            </View>
                        )}

                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>EMAIL</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="exemplo@email.com"
                                placeholderTextColor="#666"
                                value={email}
                                onChangeText={setEmail}
                                autoCapitalize="none"
                                keyboardType="email-address"
                            />
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>PASSWORD</Text>
                            <View style={styles.passwordContainer}>
                                <TextInput
                                    style={[styles.input, {flex:1, marginBottom: 0}]}
                                    placeholder="••••••"
                                    placeholderTextColor="#666"
                                    value={password}
                                    onChangeText={setPassword}
                                    secureTextEntry={!showPassword}
                                />
                                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
                                    <Ionicons name={showPassword ? "eye-off" : "eye"} size={20} color="#666" />
                                </TouchableOpacity>
                            </View>
                        </View>

                        {!isRegistering && (
                            <TouchableOpacity style={{alignSelf: 'flex-end', marginTop: 5}}>
                                <Text style={styles.forgotPass}>Esqueceste-te da password?</Text>
                            </TouchableOpacity>
                        )}

                        <TouchableOpacity style={styles.submitBtn} onPress={handleAuth} disabled={loading}>
                            {loading ? (
                                <ActivityIndicator color="black" />
                            ) : (
                                <Text style={styles.submitBtnText}>
                                    {isRegistering ? "Começar Agora" : "Entrar"}
                                </Text>
                            )}
                            {!loading && <Ionicons name="arrow-forward" size={20} color="black" style={{marginLeft: 5}} />}
                        </TouchableOpacity>
                    </View>

                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#121212' }, 
    scrollContent: { flexGrow: 1, padding: 30, justifyContent: 'center' },
    
    header: { marginBottom: 40, marginTop: 20 },
    brandText: { fontSize: 24, fontWeight: 'bold', color: 'white', marginBottom: 10, letterSpacing: 1 },
    welcomeText: { fontSize: 32, fontWeight: '300', color: 'white', lineHeight: 40 },

    tabContainer: { flexDirection: 'row', marginBottom: 30, borderBottomWidth: 1, borderBottomColor: '#333' },
    tabBtn: { marginRight: 30, paddingBottom: 10 },
    tabText: { fontSize: 16, color: '#666', fontWeight: '600' },
    tabTextActive: { color: 'white' },
    
    // MUDANÇA: Azul padrão da app (#007AFF) em vez do verde
    activeLine: { height: 2, backgroundColor: '#007AFF', width: '50%', marginTop: 5 },

    form: { gap: 20 },
    inputGroup: { gap: 8 },
    label: { color: '#666', fontSize: 12, fontWeight: 'bold', letterSpacing: 1 },
    
    input: { 
        backgroundColor: '#1E1E1E', 
        color: 'white', 
        padding: 18, 
        borderRadius: 12, 
        fontSize: 16,
        borderWidth: 1,
        borderColor: '#333'
    },
    
    passwordContainer: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        backgroundColor: '#1E1E1E', 
        borderRadius: 12, 
        borderWidth: 1, 
        borderColor: '#333',
        overflow: 'hidden'
    },
    eyeIcon: { padding: 18 },

    forgotPass: { color: '#888', fontSize: 13 },

    submitBtn: { 
        backgroundColor: 'white', 
        height: 60, 
        borderRadius: 30, 
        justifyContent: 'center', 
        alignItems: 'center', 
        marginTop: 20, 
        flexDirection: 'row',
        shadowColor: '#fff',
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 5
    },
    submitBtnText: { color: 'black', fontSize: 16, fontWeight: 'bold' },
});