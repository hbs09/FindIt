import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
// IMPORTANTE: Alterado para usar o safe-area-context
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../../supabase';
import { sendNotification } from '../../../utils/notifications';

// --- TIPOS ---
type StaffMember = {
    id: number;
    email: string;
    user_id: string | null;
    status: string;
    role: string;
    temp_name?: string;
    profiles?: { 
        nome: string;
        avatar_url?: string | null;
    };
};

export default function ManagerTeam() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [salonId, setSalonId] = useState<number | null>(null);
    const [salonName, setSalonName] = useState('');

    // Dados da Lista
    const [staffList, setStaffList] = useState<StaffMember[]>([]);

    // Estados do Modal de Convite
    const [isModalVisible, setModalVisible] = useState(false);
    const [newStaffEmail, setNewStaffEmail] = useState('');
    const [newStaffName, setNewStaffName] = useState('');
    const [inviting, setInviting] = useState(false);

    // --- INICIALIZAÇÃO ---
    useEffect(() => {
        checkPermission();
    }, []);

    useEffect(() => {
        if (salonId) {
            fetchStaff();
        }
    }, [salonId]);

    // --- VERIFICAÇÃO DE PERMISSÕES ---
    async function checkPermission() {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return router.replace('/login');

            // 1. Verifica se é DONO
            const { data: salonOwner } = await supabase.from('salons').select('id, nome_salao').eq('dono_id', user.id).single();
            
            if (salonOwner) {
                setSalonId(salonOwner.id);
                setSalonName(salonOwner.nome_salao);
                return;
            }

            // 2. Verifica se é GERENTE
            const { data: staff } = await supabase
                .from('salon_staff')
                .select('salon_id, role')
                .eq('user_id', user.id)
                .eq('status', 'ativo')
                .single();

            if (staff && staff.role === 'gerente') {
                setSalonId(staff.salon_id);
                const { data: salon } = await supabase.from('salons').select('nome_salao').eq('id', staff.salon_id).single();
                if (salon) setSalonName(salon.nome_salao);
            } else {
                Alert.alert("Acesso Negado", "Apenas gerentes podem gerir a equipa.");
                router.back();
            }
        } catch (error) {
            console.error(error);
            router.back();
        } finally {
            setLoading(false);
        }
    }

    // --- CARREGAR EQUIPA ---
    async function fetchStaff() {
        if (!salonId) return;
        setLoading(true);

        const { data, error } = await supabase
            .from('salon_staff')
            .select('*, profiles ( nome, avatar_url )')
            .eq('salon_id', salonId)
            .neq('status', 'recusado');

        if (error) Alert.alert("Erro", "Falha ao carregar equipa.");

        if (data) {
            const sortedList = (data as any[]).sort((a, b) => {
                const isManagerA = a.role === 'gerente' ? 1 : 0;
                const isManagerB = b.role === 'gerente' ? 1 : 0;
                if (isManagerA > isManagerB) return -1;
                if (isManagerA < isManagerB) return 1;

                const isActiveA = a.status === 'ativo' ? 1 : 0;
                const isActiveB = b.status === 'ativo' ? 1 : 0;
                if (isActiveA > isActiveB) return -1;
                if (isActiveA < isActiveB) return 1;
                return 0;
            });
            setStaffList(sortedList);
        }
        setLoading(false);
    }

    // --- AÇÕES: CONVIDAR ---
    async function inviteStaff() {
        if (!newStaffEmail.trim() || !newStaffName.trim()) {
            return Alert.alert("Campos Vazios", "Preenche o nome e o email.");
        }
        if (!salonId) return;

        setInviting(true);
        const emailLower = newStaffEmail.trim().toLowerCase();

        try {
            const { data: existingMember, error: checkError } = await supabase
                .from('salon_staff')
                .select('*')
                .eq('salon_id', salonId)
                .eq('email', emailLower)
                .maybeSingle();

            if (checkError) throw checkError;

            const notifyUser = async () => {
                const { data: userProfile } = await supabase.from('profiles').select('id').eq('email', emailLower).maybeSingle();
                if (userProfile) {
                    await sendNotification(userProfile.id, "Novo Convite de Trabalho", `O salão ${salonName} convidou-te para a equipa.`, { screen: '/invites' });
                }
            };

            if (existingMember) {
                if (existingMember.status === 'recusado') {
                    await supabase.from('salon_staff')
                        .update({ status: 'pendente', temp_name: newStaffName.trim(), user_id: null })
                        .eq('id', existingMember.id);
                    await notifyUser();
                    Alert.alert("Sucesso", "O convite foi reenviado!");
                } else {
                    Alert.alert("Duplicado", "Este email já faz parte da equipa.");
                    setInviting(false);
                    return;
                }
            } else {
                await supabase.from('salon_staff').insert({
                    salon_id: salonId,
                    email: emailLower,
                    temp_name: newStaffName.trim(),
                    status: 'pendente'
                });
                await notifyUser();
                Alert.alert("Sucesso", "Convite enviado!");
            }

            setNewStaffEmail('');
            setNewStaffName('');
            setModalVisible(false);
            fetchStaff();

        } catch (error: any) {
            Alert.alert("Erro", error.message || "Erro ao enviar convite.");
        } finally {
            setInviting(false);
        }
    }

    // --- AÇÕES: GERIR CARGOS ---
    function toggleManagerRole(staffMember: StaffMember) {
        const isPromoting = staffMember.role !== 'gerente';
        const newRole = isPromoting ? 'gerente' : 'funcionario';
        const titulo = isPromoting ? "Promover a Gerente" : "Remover Gerência";
        
        Alert.alert(titulo, isPromoting ? "Dar acesso total à gestão?" : "Retirar acesso de gestão?", [
            { text: "Cancelar", style: "cancel" },
            {
                text: "Confirmar",
                onPress: async () => {
                    const updatedList = staffList.map(s => s.id === staffMember.id ? { ...s, role: newRole } : s);
                    setStaffList(updatedList);
                    const { error } = await supabase.from('salon_staff').update({ role: newRole }).eq('id', staffMember.id);
                    if (error) { Alert.alert("Erro", "Falha ao alterar cargo."); fetchStaff(); }
                }
            }
        ]);
    }

    function removeStaff(id: number) {
        Alert.alert("Remover da Equipa", "Esta ação é irreversível.", [
            { text: "Cancelar", style: "cancel" },
            {
                text: "Remover", style: "destructive",
                onPress: async () => {
                    await supabase.from('salon_staff').delete().eq('id', id);
                    fetchStaff();
                }
            }
        ]);
    }

    // --- RENDER ---
    return (
        // 1. View principal cinza para cobrir TODO o fundo
        <View style={{ flex: 1, backgroundColor: '#f8f9fa' }}>
            <StatusBar barStyle="dark-content" backgroundColor="white" />
            
            {/* 2. SafeAreaView apenas no topo para manter a Status Bar branca */}
            <SafeAreaView edges={['top']} style={{ backgroundColor: 'white' }}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                        <Ionicons name="arrow-back" size={24} color="#333" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Minha Equipa</Text>
                    
                    <TouchableOpacity onPress={() => setModalVisible(true)} style={styles.addButton}>
                        <Ionicons name="add" size={24} color="white" />
                    </TouchableOpacity>
                </View>
            </SafeAreaView>

            <View style={styles.content}>
                <FlatList
                    data={staffList}
                    keyExtractor={item => item.id.toString()}
                    contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={
                        !loading ? (
                            <View style={styles.emptyState}>
                                <View style={styles.emptyIconBg}>
                                    <Ionicons name="people" size={40} color="#ccc" />
                                </View>
                                <Text style={styles.emptyTitle}>Sem equipa</Text>
                                <Text style={styles.emptyText}>Adiciona funcionários para começares.</Text>
                                <TouchableOpacity style={styles.emptyBtn} onPress={() => setModalVisible(true)}>
                                    <Text style={styles.emptyBtnText}>Adicionar Membro</Text>
                                </TouchableOpacity>
                            </View>
                        ) : null
                    }
                    renderItem={({ item }) => {
                        const displayName = item.profiles?.nome || item.temp_name || "Convidado";
                        const avatarUrl = item.profiles?.avatar_url;
                        const initial = displayName.charAt(0).toUpperCase();
                        const isManager = item.role === 'gerente';
                        const isActive = item.status === 'ativo';

                        const statusConfig = isActive 
                            ? { color: '#4CD964', text: 'Ativo', bg: '#E8F5E9' }
                            : { color: '#FF9500', text: 'Pendente', bg: '#FFF3E0' };

                        return (
                            <View style={styles.card}>
                                {/* Lado Esquerdo: Avatar */}
                                <View style={styles.avatarContainer}>
                                    {avatarUrl ? (
                                        <Image source={{ uri: avatarUrl }} style={styles.avatar} />
                                    ) : (
                                        <View style={styles.avatarPlaceholder}>
                                            <Text style={styles.avatarLetter}>{initial}</Text>
                                        </View>
                                    )}
                                    {isManager && (
                                        <View style={styles.crownBadge}>
                                            <MaterialCommunityIcons name="crown" size={10} color="white" />
                                        </View>
                                    )}
                                </View>

                                {/* Centro: Informação */}
                                <View style={styles.infoContainer}>
                                    <Text style={styles.nameText} numberOfLines={1}>{displayName}</Text>
                                    <Text style={styles.emailText} numberOfLines={1}>{item.email}</Text>
                                    
                                    <View style={[styles.statusBadge, { backgroundColor: statusConfig.bg }]}>
                                        <View style={[styles.statusDot, { backgroundColor: statusConfig.color }]} />
                                        {/* 3. ALTERADO: Mostra sempre o estado (Ativo/Pendente) e não "Gerente" */}
                                        <Text style={[styles.statusText, { color: statusConfig.color }]}>
                                            {statusConfig.text}
                                        </Text>
                                    </View>
                                </View>

                                {/* Lado Direito: Ações */}
                                <View style={styles.actions}>
                                    <TouchableOpacity onPress={() => toggleManagerRole(item)} style={styles.actionIconBtn}>
                                        <MaterialCommunityIcons 
                                            name={isManager ? "shield-check" : "shield-outline"} 
                                            size={22} 
                                            color={isManager ? "#1a1a1a" : "#aaa"} 
                                        />
                                    </TouchableOpacity>
                                    
                                    <TouchableOpacity onPress={() => removeStaff(item.id)} style={[styles.actionIconBtn, { backgroundColor: '#FFEBEE' }]}>
                                        <Ionicons name="trash-outline" size={20} color="#D32F2F" />
                                    </TouchableOpacity>
                                </View>
                            </View>
                        );
                    }}
                />
            </View>

            {/* --- MODAL DE ADICIONAR MEMBRO --- */}
            <Modal
                animationType="slide"
                transparent={true}
                visible={isModalVisible}
                onRequestClose={() => setModalVisible(false)}
            >
                <KeyboardAvoidingView 
                    behavior={Platform.OS === "ios" ? "padding" : "height"}
                    style={styles.modalOverlay}
                >
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Novo Membro</Text>
                            <TouchableOpacity onPress={() => setModalVisible(false)}>
                                <Ionicons name="close" size={24} color="#aaa" />
                            </TouchableOpacity>
                        </View>
                        
                        <Text style={styles.modalSubtitle}>Envia um convite por email para se juntarem à equipa.</Text>

                        <View style={styles.inputContainer}>
                            <Text style={styles.label}>Nome</Text>
                            <TextInput 
                                style={styles.input} 
                                placeholder="Ex: João Silva" 
                                value={newStaffName} 
                                onChangeText={setNewStaffName} 
                            />
                        </View>

                        <View style={styles.inputContainer}>
                            <Text style={styles.label}>Email</Text>
                            <TextInput 
                                style={styles.input} 
                                placeholder="Ex: joao@email.com" 
                                value={newStaffEmail} 
                                onChangeText={setNewStaffEmail}
                                autoCapitalize="none"
                                keyboardType="email-address"
                            />
                        </View>

                        <TouchableOpacity style={styles.sendButton} onPress={inviteStaff} disabled={inviting}>
                            {inviting ? (
                                <ActivityIndicator color="white" />
                            ) : (
                                <Text style={styles.sendButtonText}>Enviar Convite</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    header: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        padding: 20, 
        backgroundColor: 'white', 
        borderBottomWidth: 1, 
        borderBottomColor: '#F0F0F0' 
    },
    backButton: { 
        width: 40, 
        height: 40, 
        justifyContent: 'center', 
        alignItems: 'center', 
        borderRadius: 20, 
        backgroundColor: '#F5F7FA' 
    },
    headerTitle: { 
        fontSize: 18, 
        fontWeight: 'bold', 
        color: '#1A1A1A' 
    },
    addButton: {
        width: 40, 
        height: 40, 
        borderRadius: 20,
        backgroundColor: '#1a1a1a', 
        justifyContent: 'center', 
        alignItems: 'center',
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, elevation: 4
    },

    content: { flex: 1, backgroundColor: '#f8f9fa' },

    emptyState: { alignItems: 'center', marginTop: 60 },
    emptyIconBg: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#eee', justifyContent: 'center', alignItems: 'center', marginBottom: 15 },
    emptyTitle: { fontSize: 18, fontWeight: 'bold', color: '#333' },
    emptyText: { fontSize: 14, color: '#888', marginVertical: 5 },
    emptyBtn: { marginTop: 20, backgroundColor: '#1a1a1a', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
    emptyBtnText: { color: 'white', fontWeight: 'bold' },

    card: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'white',
        borderRadius: 16,
        padding: 15,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    
    avatarContainer: { position: 'relative', marginRight: 15 },
    avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#f0f0f0' },
    avatarPlaceholder: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#F5F5F5', justifyContent: 'center', alignItems: 'center' },
    avatarLetter: { fontSize: 20, fontWeight: 'bold', color: '#aaa' },
    crownBadge: {
        position: 'absolute', bottom: -2, right: -2,
        backgroundColor: '#FFD700', width: 20, height: 20, borderRadius: 10,
        justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'white'
    },

    infoContainer: { flex: 1 },
    nameText: { fontSize: 16, fontWeight: 'bold', color: '#1a1a1a', marginBottom: 2 },
    emailText: { fontSize: 12, color: '#888', marginBottom: 6 },
    statusBadge: {
        alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8
    },
    statusDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
    statusText: { fontSize: 11, fontWeight: '700' },

    actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    actionIconBtn: {
        width: 36, height: 36, borderRadius: 10,
        backgroundColor: '#F5F7FA', justifyContent: 'center', alignItems: 'center'
    },

    modalOverlay: {
        flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end'
    },
    modalContent: {
        backgroundColor: 'white',
        borderTopLeftRadius: 25, borderTopRightRadius: 25,
        padding: 25, paddingBottom: 40,
        shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.1, elevation: 10
    },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#1a1a1a' },
    modalSubtitle: { fontSize: 14, color: '#888', marginBottom: 20 },
    
    label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 6 },
    inputContainer: { marginBottom: 15 },
    input: {
        backgroundColor: '#F5F7FA', borderRadius: 12, padding: 15,
        fontSize: 16, color: '#333', borderWidth: 1, borderColor: '#eee'
    },
    sendButton: {
        backgroundColor: '#1a1a1a', borderRadius: 14, padding: 16,
        alignItems: 'center', marginTop: 10,
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, elevation: 3
    },
    sendButtonText: { color: 'white', fontWeight: 'bold', fontSize: 16 }
});