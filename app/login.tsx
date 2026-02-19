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
    
    // --- ESTADOS ---
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    
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
                            avatar_url: ''
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
            
            {/* --- TOP HEADER (BRANDING) --- */}
            <View style={styles.headerArea}>
                <Image 
                    source={require('../assets/images/white_logo.png')} 
                    style={styles.logo}
                    resizeMode="contain"
                />
                <Text style={styles.slogan}>A tua beleza, ao teu tempo.</Text>
            </View>

            {/* --- FORMULÁRIO (BOTTOM SHEET) --- */}
            <KeyboardAvoidingView 
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                style={styles.formWrapper}
            >
                <ScrollView 
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    
                    <View>
                        {/* Títulos */}
                        <View style={styles.titleContainer}>
                            <Text style={styles.welcomeTitle}>
                                {isRegistering ? "Criar nova conta" : "Bem-vindo de volta"}
                            </Text>
                            <Text style={styles.welcomeSubtitle}>
                                {isRegistering ? "Regista-te para começares a explorar." : "Insere os teus dados para entrar."}
                            </Text>
                        </View>

                        {/* Tabs Login/Registo (Estilo Segmented Control) */}
                        <View style={styles.tabContainer}>
                            <TouchableOpacity 
                                style={[styles.tabButton, !isRegistering && styles.tabButtonActive]} 
                                onPress={() => setIsRegistering(false)}
                                activeOpacity={0.8}
                            >
                                <Text style={[styles.tabText, !isRegistering && styles.tabTextActive]}>Login</Text>
                            </TouchableOpacity>
                            <TouchableOpacity 
                                style={[styles.tabButton, isRegistering && styles.tabButtonActive]} 
                                onPress={() => setIsRegistering(true)}
                                activeOpacity={0.8}
                            >
                                <Text style={[styles.tabText, isRegistering && styles.tabTextActive]}>Registar</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Campos de Texto com Ícones */}
                        <View style={styles.inputsContainer}>
                            {isRegistering && (
                                <View style={styles.inputGroup}>
                                    <Text style={styles.inputLabel}>Nome Completo</Text>
                                    <View style={styles.inputField}>
                                        <Ionicons name="person-outline" size={20} color="#9CA3AF" style={styles.inputIcon} />
                                        <TextInput
                                            style={styles.textInput}
                                            placeholder="Ex: Ana Silva"
                                            placeholderTextColor="#9CA3AF"
                                            value={name}
                                            onChangeText={setName}
                                        />
                                    </View>
                                </View>
                            )}

                            <View style={styles.inputGroup}>
                                <Text style={styles.inputLabel}>Email</Text>
                                <View style={styles.inputField}>
                                    <Ionicons name="mail-outline" size={20} color="#9CA3AF" style={styles.inputIcon} />
                                    <TextInput
                                        style={styles.textInput}
                                        placeholder="nome@email.com"
                                        placeholderTextColor="#9CA3AF"
                                        keyboardType="email-address"
                                        autoCapitalize="none"
                                        value={email}
                                        onChangeText={setEmail}
                                    />
                                </View>
                            </View>

                            <View style={styles.inputGroup}>
                                <Text style={styles.inputLabel}>Password</Text>
                                <View style={styles.inputField}>
                                    <Ionicons name="lock-closed-outline" size={20} color="#9CA3AF" style={styles.inputIcon} />
                                    <TextInput
                                        style={styles.textInput}
                                        placeholder="••••••••"
                                        placeholderTextColor="#9CA3AF"
                                        secureTextEntry={!showPassword}
                                        value={password}
                                        onChangeText={setPassword}
                                    />
                                    <TouchableOpacity 
                                        onPress={() => setShowPassword(!showPassword)}
                                        style={styles.eyeButton}
                                    >
                                        <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color="#6B7280" />
                                    </TouchableOpacity>
                                </View>
                            </View>

                            {!isRegistering && (
                                <TouchableOpacity style={styles.forgotPasswordBtn}>
                                    <Text style={styles.forgotPasswordText}>Esqueceste-te da password?</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>

                    {/* --- BOTÃO PRINCIPAL E RODAPÉ --- */}
                    <View style={styles.footerContainer}>
                        <TouchableOpacity 
                            style={styles.mainButton} 
                            onPress={handleAuth}
                            activeOpacity={0.8}
                            disabled={loading}
                        >
                            {loading ? (
                                <ActivityIndicator color="white" />
                            ) : (
                                <Text style={styles.mainButtonText}>
                                    {isRegistering ? "Criar Conta" : "Entrar na App"}
                                </Text>
                            )}
                        </TouchableOpacity>
                        
                        <Text style={styles.termsText}>
                            Ao continuares, aceitas os nossos <Text style={styles.termsLink}>Termos</Text> e <Text style={styles.termsLink}>Política de Privacidade</Text>.
                        </Text>
                    </View>

                </ScrollView>
            </KeyboardAvoidingView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { 
        flex: 1, 
        backgroundColor: '#050505' // Fundo ultra escuro
    },

    // --- HEADER ---
    headerArea: { 
        height: '22%', // Reduzimos o espaço do topo para a caixa branca subir mais
        justifyContent: 'center', 
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 40, // Espaço para a status bar
    },
    logo: { 
        width: 140, // Ligeiramente menor para compensar o espaço
        height: 45, 
        marginBottom: 8 
    },
    slogan: {
        color: '#A1A1AA',
        fontSize: 13,
        fontWeight: '500',
        letterSpacing: 0.5,
    },

    // --- FORM WRAPPER (SHEET) ---
    formWrapper: {
        flex: 1, // Agora ocupa todo o espaço restante do ecrã
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        overflow: 'hidden',
    },
    scrollContent: { 
        flexGrow: 1, 
        paddingHorizontal: 28, 
        paddingTop: 30, // Reduzido
        paddingBottom: 24, // Reduzido para evitar scroll desnecessário
        justifyContent: 'space-between'
    },

    // --- TÍTULOS ---
    titleContainer: { marginBottom: 20 }, // Reduzido de 28
    welcomeTitle: { 
        fontSize: 26, 
        fontWeight: '800', 
        color: '#111827', 
        marginBottom: 4,
        letterSpacing: -0.5
    },
    welcomeSubtitle: { 
        fontSize: 14, 
        color: '#6B7280',
        fontWeight: '400' 
    },

    // --- TABS (Segmented Control) ---
    tabContainer: { 
        flexDirection: 'row', 
        backgroundColor: '#F3F4F6',
        borderRadius: 14, 
        padding: 4, 
        marginBottom: 20 // Reduzido de 28
    },
    tabButton: { 
        flex: 1, 
        paddingVertical: 12, 
        alignItems: 'center', 
        borderRadius: 10 
    },
    tabButtonActive: { 
        backgroundColor: '#FFFFFF', 
        shadowColor: '#000', 
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06, 
        shadowRadius: 4, 
        elevation: 2 
    },
    tabText: { 
        fontWeight: '600', 
        color: '#9CA3AF', 
        fontSize: 14 
    },
    tabTextActive: { 
        color: '#111827' 
    },

    // --- INPUTS ---
    inputsContainer: { gap: 14 }, // Reduzido de 18
    inputGroup: { gap: 6 }, // Reduzido de 8
    inputLabel: { 
        fontSize: 13, 
        fontWeight: '600', 
        color: '#4B5563',
        marginLeft: 4
    },
    inputField: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F9FAFB',
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 16,
        height: 54, // Ligeiramente mais fino (de 56 para 54)
        paddingHorizontal: 16,
    },
    inputIcon: {
        marginRight: 12,
    },
    textInput: {
        flex: 1,
        fontSize: 15,
        color: '#111827',
        height: '100%',
    },
    eyeButton: {
        padding: 4,
    },
    forgotPasswordBtn: { 
        alignSelf: 'flex-end',
        marginTop: -2,
        paddingVertical: 4
    },
    forgotPasswordText: { 
        color: '#4B5563', 
        fontSize: 13, 
        fontWeight: '600' 
    },

    // --- FOOTER & BUTTON ---
    footerContainer: { 
        marginTop: 24 // Reduzido de 40
    },
    mainButton: {
        backgroundColor: '#111827',
        height: 56, // Reduzido de 58
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000', 
        shadowOffset: { width: 0, height: 8 }, 
        shadowOpacity: 0.15, 
        shadowRadius: 12, 
        elevation: 5
    },
    mainButtonText: { 
        color: '#FFFFFF', 
        fontSize: 16, 
        fontWeight: '700' 
    },
    termsText: { 
        textAlign: 'center', 
        color: '#9CA3AF', 
        fontSize: 12, 
        marginTop: 16,
        lineHeight: 18
    },
    termsLink: {
        color: '#4B5563',
        fontWeight: '600'
    }
});