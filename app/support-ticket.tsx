import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../supabase';

export default function SupportTicketScreen() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);

    // Dados do formulário
    const [assunto, setAssunto] = useState('');
    const [mensagem, setMensagem] = useState('');

    // Dados automáticos do utilizador
    const [userInfo, setUserInfo] = useState({
        userId: '',
        nome: '',
        email: '',
        salonId: null as number | null,
        salonName: ''
    });

    useEffect(() => {
        fetchUserInfo();
    }, []);

    async function fetchUserInfo() {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                Alert.alert("Erro", "Sessão não encontrada.");
                return router.back();
            }

            const userName = user.user_metadata?.full_name || 'Utilizador';
            const userEmail = user.email || '';
            let foundSalonId = null;
            let foundSalonName = 'Não associado';

            // 1. Tentar encontrar como DONO
            const { data: salonOwner } = await supabase
                .from('salons')
                .select('id, nome_salao')
                .eq('dono_id', user.id)
                .single();

            if (salonOwner) {
                foundSalonId = salonOwner.id;
                foundSalonName = salonOwner.nome_salao;
            } else {
                // 2. Tentar encontrar como STAFF (Gerente)
                const { data: staffRecord } = await supabase
                    .from('salon_staff')
                    .select('salon_id, salons(nome_salao)')
                    .eq('user_id', user.id)
                    .eq('role', 'gerente') // Apenas gerentes
                    .single();

                if (staffRecord && staffRecord.salons) {
                    foundSalonId = staffRecord.salon_id;
                    // @ts-ignore
                    foundSalonName = staffRecord.salons.nome_salao;
                }
            }

            setUserInfo({
                userId: user.id,
                nome: userName,
                email: userEmail,
                salonId: foundSalonId,
                salonName: foundSalonName
            });

        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }

    async function handleSubmit() {
        if (!mensagem.trim()) {
            return Alert.alert("Falta informação", "Por favor descreve o problema ou dúvida.");
        }
        if (!assunto.trim()) {
            return Alert.alert("Falta informação", "Por favor indica um assunto.");
        }

        setSending(true);
        Keyboard.dismiss();

        try {
            const { error } = await supabase.from('support_tickets').insert({
                user_id: userInfo.userId,
                salon_id: userInfo.salonId,
                nome: userInfo.nome,
                email: userInfo.email,
                nome_salao: userInfo.salonName,
                assunto: assunto.trim(),
                mensagem: mensagem.trim()
            });

            if (error) throw error;

            Alert.alert("Enviado", "O teu ticket foi criado. Entraremos em contacto brevemente.", [
                { text: "OK", onPress: () => router.back() }
            ]);

        } catch (error: any) {
            Alert.alert("Erro", "Falha ao enviar ticket: " + error.message);
        } finally {
            setSending(false);
        }
    }

    if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#333" /></View>;

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color="#333" />
                </TouchableOpacity>
                <Text style={styles.title}>Ajuda & Suporte</Text>
            </View>

            <KeyboardAvoidingView 
                behavior={Platform.OS === "ios" ? "padding" : "height"} 
                style={{ flex: 1 }}
            >
                <ScrollView contentContainerStyle={styles.content}>
                    
                    {/* INFO CARTÃO */}
                    <View style={styles.infoCard}>
                        <Text style={styles.sectionTitle}>Os teus dados</Text>
                        <View style={styles.infoRow}>
                            <Ionicons name="person" size={16} color="#666" />
                            <Text style={styles.infoText}>{userInfo.nome}</Text>
                        </View>
                        <View style={styles.infoRow}>
                            <Ionicons name="mail" size={16} color="#666" />
                            <Text style={styles.infoText}>{userInfo.email}</Text>
                        </View>
                        <View style={styles.infoRow}>
                            <Ionicons name="business" size={16} color="#666" />
                            <Text style={styles.infoText}>{userInfo.salonName}</Text>
                        </View>
                        <Text style={styles.autoNote}>*Estes dados serão enviados automaticamente.</Text>
                    </View>

                    {/* FORMULÁRIO */}
                    <Text style={styles.label}>Assunto</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Ex: Dúvida sobre faturação, Erro na agenda..."
                        value={assunto}
                        onChangeText={setAssunto}
                    />

                    <Text style={styles.label}>Mensagem</Text>
                    <TextInput
                        style={[styles.input, styles.textArea]}
                        placeholder="Descreve detalhadamente o que precisas..."
                        value={mensagem}
                        onChangeText={setMensagem}
                        multiline
                        textAlignVertical="top"
                    />

                    <TouchableOpacity 
                        style={[styles.submitBtn, sending && { backgroundColor: '#ccc' }]} 
                        onPress={handleSubmit}
                        disabled={sending}
                    >
                        {sending ? (
                            <ActivityIndicator color="white" />
                        ) : (
                            <>
                                <Text style={styles.submitBtnText}>Enviar Pedido</Text>
                                <Ionicons name="send" size={18} color="white" />
                            </>
                        )}
                    </TouchableOpacity>

                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8F9FA' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: { flexDirection: 'row', alignItems: 'center', padding: 20, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#eee' },
    backBtn: { padding: 5, marginRight: 10 },
    title: { fontSize: 20, fontWeight: 'bold', color: '#333' },
    content: { padding: 20 },
    
    infoCard: { backgroundColor: '#E3F2FD', padding: 15, borderRadius: 12, marginBottom: 25, borderWidth: 1, borderColor: '#BBDEFB' },
    sectionTitle: { fontSize: 14, fontWeight: 'bold', color: '#1565C0', marginBottom: 10, textTransform: 'uppercase' },
    infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
    infoText: { fontSize: 15, color: '#333', fontWeight: '500' },
    autoNote: { fontSize: 11, color: '#666', marginTop: 8, fontStyle: 'italic' },

    label: { fontSize: 14, fontWeight: 'bold', color: '#333', marginBottom: 8, marginLeft: 4 },
    input: { backgroundColor: 'white', padding: 15, borderRadius: 12, borderWidth: 1, borderColor: '#DDD', fontSize: 16, marginBottom: 20 },
    textArea: { height: 150 },

    submitBtn: { backgroundColor: '#1a1a1a', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 16, borderRadius: 12, gap: 10 },
    submitBtnText: { color: 'white', fontSize: 16, fontWeight: 'bold' }
});