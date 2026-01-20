import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    KeyboardAvoidingView,
    Platform,
    ScrollView, // <--- IMPORTANTE: Importar ScrollView
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { supabase } from '../supabase';

export default function LoginScreen() {
    const router = useRouter();
    
    // --- ESTADOS ---
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    
    // Estado para o género
    const [gender, setGender] = useState<'Homem' | 'Mulher'>('Mulher');
    
    const [loading, setLoading] = useState(false);
    const [isRegistering, setIsRegistering] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    // --- LÓGICA DE AUTENTICAÇÃO ---
    async function handleAuth() {
        if (!email || !password) return Alert.alert("Campos vazios", "Preenche todos os dados.");
        setLoading(true);

        try {
            if (isRegistering) {
                if (!name) {
                    setLoading(false);
                    return Alert.alert("Nome necessário", "Diz-nos como te chamas.");
                }
                const { error } = await supabase.auth.signUp({
                    email: email,
                    password: password,
                    options: { 
                        data: { 
                            full_name: name, 
                            avatar_url: '',
                            gender: gender 
                        } 
                    }
                });
                if (error) throw error;
                Alert.alert("Bem-vindo!", "Conta criada. Verifica o teu email.");
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
            Alert.alert("Erro", error.message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <View style={styles.container}>
            <StatusBar style="light" />
            
            {/* --- HERO IMAGE (30%) --- */}
            <View style={styles.heroContainer}>
                <Image 
                    source={{ uri: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?q=80&w=1000&auto=format&fit=crop' }} 
                    style={styles.heroImage}
                />
                <View style={styles.heroOverlay} />
                
                <View style={styles.heroTextContainer}>
                    <Text style={styles.heroBrand}>FindIt.</Text>
                </View>
            </View>

            {/* --- FORMULÁRIO COM SCROLL (Evita tapar inputs) --- */}
            <KeyboardAvoidingView 
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                style={styles.formContainer}
            >
                <ScrollView 
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    
                    {/* --- GRUPO DE TOPO (Header + Inputs) --- */}
                    <View>
                        {/* Cabeçalho */}
                        <View style={styles.formHeader}>
                            <Text style={styles.welcomeTitle}>
                                {isRegistering ? "Criar Conta" : "Bem-vindo"}
                            </Text>
                            <Text style={styles.welcomeSubtitle}>
                                {isRegistering ? "Junta-te a nós em segundos." : "Acede à tua conta."}
                            </Text>
                        </View>

                        {/* Tabs Login/Registo */}
                        <View style={styles.toggleContainer}>
                            <TouchableOpacity 
                                style={[styles.toggleBtn, !isRegistering && styles.toggleBtnActive]} 
                                onPress={() => setIsRegistering(false)}
                            >
                                <Text style={[styles.toggleText, !isRegistering && styles.toggleTextActive]}>Login</Text>
                            </TouchableOpacity>
                            <TouchableOpacity 
                                style={[styles.toggleBtn, isRegistering && styles.toggleBtnActive]} 
                                onPress={() => setIsRegistering(true)}
                            >
                                <Text style={[styles.toggleText, isRegistering && styles.toggleTextActive]}>Registar</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Campos de Texto */}
                        <View style={styles.inputsArea}>
                            {isRegistering && (
                                <>
                                    <View style={styles.inputGroup}>
                                        <Text style={styles.inputLabel}>Nome</Text>
                                        <TextInput
                                            style={styles.input}
                                            placeholder="Ana Silva"
                                            value={name}
                                            onChangeText={setName}
                                        />
                                    </View>

                                    {/* --- SELETOR DE GÉNERO --- */}
                                    <View style={styles.inputGroup}>
                                        <Text style={styles.inputLabel}>Género</Text>
                                        <View style={styles.genderRow}>
                                            <TouchableOpacity 
                                                style={[styles.genderBtn, gender === 'Mulher' && styles.genderBtnActive]}
                                                onPress={() => setGender('Mulher')}
                                            >
                                                <Ionicons name="woman" size={18} color={gender === 'Mulher' ? 'white' : '#666'} />
                                                <Text style={[styles.genderText, gender === 'Mulher' && styles.genderTextActive]}>Mulher</Text>
                                            </TouchableOpacity>

                                            <TouchableOpacity 
                                                style={[styles.genderBtn, gender === 'Homem' && styles.genderBtnActive]}
                                                onPress={() => setGender('Homem')}
                                            >
                                                <Ionicons name="man" size={18} color={gender === 'Homem' ? 'white' : '#666'} />
                                                <Text style={[styles.genderText, gender === 'Homem' && styles.genderTextActive]}>Homem</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                </>
                            )}

                            <View style={styles.inputGroup}>
                                <Text style={styles.inputLabel}>Email</Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder="nome@email.com"
                                    keyboardType="email-address"
                                    autoCapitalize="none"
                                    value={email}
                                    onChangeText={setEmail}
                                />
                            </View>

                            <View style={styles.inputGroup}>
                                <Text style={styles.inputLabel}>Password</Text>
                                <View style={styles.passwordContainer}>
                                    <TextInput
                                        style={styles.inputPassword}
                                        placeholder="••••••"
                                        secureTextEntry={!showPassword}
                                        value={password}
                                        onChangeText={setPassword}
                                    />
                                    <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                                        <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color="#999" />
                                    </TouchableOpacity>
                                </View>
                            </View>

                            {!isRegistering && (
                                <TouchableOpacity style={{alignSelf: 'flex-end'}}>
                                    <Text style={styles.forgotText}>Esqueceste-te?</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>

                    {/* --- RODAPÉ (Botão no Fundo) --- */}
                    <View style={{marginTop: 30}}>
                        <TouchableOpacity 
                            style={styles.mainButton} 
                            onPress={handleAuth}
                            activeOpacity={0.9}
                            disabled={loading}
                        >
                            {loading ? (
                                <ActivityIndicator color="white" />
                            ) : (
                                <Text style={styles.mainButtonText}>
                                    {isRegistering ? "Registar" : "Entrar"}
                                </Text>
                            )}
                        </TouchableOpacity>
                        
                        <Text style={styles.footerNote}>
                            Ao continuar, aceitas os nossos Termos.
                        </Text>
                    </View>

                </ScrollView>
            </KeyboardAvoidingView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },

    // --- HERO ---
    heroContainer: { 
        height: '30%', 
        width: '100%', 
        position: 'relative',
        justifyContent: 'center', alignItems: 'center'
    },
    heroImage: { width: '100%', height: '100%', resizeMode: 'cover', opacity: 0.9 },
    heroOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)' },
    heroTextContainer: { position: 'absolute', bottom: 60, left: 30 },
    heroBrand: { fontSize: 36, fontWeight: '900', color: 'white', letterSpacing: -1 },

    // --- FORM (SHEET) ---
    formContainer: {
        flex: 1,
        backgroundColor: 'white',
        borderTopLeftRadius: 30,
        borderTopRightRadius: 30,
        marginTop: -50,
        overflow: 'hidden',
    },
    // Substituímos 'staticContent' por 'scrollContent'
    scrollContent: { 
        flexGrow: 1, 
        padding: 30, 
        paddingTop: 40,
        paddingBottom: 40, 
        justifyContent: 'space-between' // Mantém o layout esticado quando o teclado está fechado
    },

    // --- HEADER ---
    formHeader: { marginBottom: 20 },
    welcomeTitle: { fontSize: 24, fontWeight: 'bold', color: '#1a1a1a', marginBottom: 4 },
    welcomeSubtitle: { fontSize: 14, color: '#888' },

    // --- TABS ---
    toggleContainer: { 
        flexDirection: 'row', 
        backgroundColor: '#F5F5F5', 
        borderRadius: 12, 
        padding: 4, 
        marginBottom: 20
    },
    toggleBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
    toggleBtnActive: { backgroundColor: 'white', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
    toggleText: { fontWeight: '600', color: '#999', fontSize: 13 },
    toggleTextActive: { color: '#1a1a1a' },

    // --- INPUTS ---
    inputsArea: { gap: 14 }, 
    inputGroup: { gap: 6 },
    inputLabel: { fontSize: 12, fontWeight: '600', color: '#333' },
    input: {
        backgroundColor: '#F7F8FA',
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderRadius: 12,
        fontSize: 15,
        color: '#333',
        borderWidth: 1,
        borderColor: '#F0F0F0'
    },
    
    // --- ESTILOS DO GÉNERO ---
    genderRow: { flexDirection: 'row', gap: 10 },
    genderBtn: { 
        flex: 1, 
        flexDirection: 'row', 
        alignItems: 'center', 
        justifyContent: 'center', 
        gap: 8,
        paddingVertical: 12, 
        borderRadius: 12, 
        backgroundColor: '#F7F8FA',
        borderWidth: 1,
        borderColor: '#F0F0F0'
    },
    genderBtnActive: {
        backgroundColor: '#1a1a1a',
        borderColor: '#1a1a1a'
    },
    genderText: { fontSize: 14, fontWeight: '600', color: '#666' },
    genderTextActive: { color: 'white' },

    passwordContainer: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#F7F8FA',
        borderRadius: 12, borderWidth: 1, borderColor: '#F0F0F0',
        paddingRight: 16
    },
    inputPassword: {
        flex: 1, paddingVertical: 14, paddingHorizontal: 16,
        fontSize: 15, color: '#333'
    },
    forgotText: { color: '#666', fontSize: 12, fontWeight: '500' },

    // --- BOTÃO (FOOTER) ---
    mainButton: {
        backgroundColor: '#1a1a1a',
        paddingVertical: 18,
        borderRadius: 16,
        alignItems: 'center',
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4
    },
    mainButtonText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
    footerNote: { textAlign: 'center', color: '#CCC', fontSize: 11, marginTop: 15 }
});