import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    KeyboardAvoidingView,
    Platform,
    SafeAreaView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
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
    profiles?: { nome: string };
};

export default function ManagerTeam() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [salonId, setSalonId] = useState<number | null>(null);
    const [salonName, setSalonName] = useState('');

    // Dados da Lista
    const [staffList, setStaffList] = useState<StaffMember[]>([]);

    // Formulário de Convite
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

            // 2. Verifica se é GERENTE (Staff com role 'gerente')
            const { data: staff } = await supabase
                .from('salon_staff')
                .select('salon_id, role')
                .eq('user_id', user.id)
                .eq('status', 'ativo')
                .single();

            if (staff && staff.role === 'gerente') {
                setSalonId(staff.salon_id);
                // Buscar nome do salão
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
            .select('*, profiles ( nome )')
            .eq('salon_id', salonId)
            .neq('status', 'recusado'); // Opcional: não mostrar quem recusou

        if (error) {
            Alert.alert("Erro", "Falha ao carregar equipa.");
        }

        if (data) {
            // Ordenação: Gerentes > Ativos > Pendentes
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
        if (!newStaffEmail.trim()) return Alert.alert("Campo Vazio", "Por favor, escreve o email.");
        if (!newStaffName.trim()) return Alert.alert("Campo Vazio", "Por favor, escreve o nome do funcionário.");
        if (!salonId) return;

        setInviting(true);
        const emailLower = newStaffEmail.trim().toLowerCase();

        try {
            // Verificar se já existe na equipa
            const { data: existingMember, error: checkError } = await supabase
                .from('salon_staff')
                .select('*')
                .eq('salon_id', salonId)
                .eq('email', emailLower)
                .maybeSingle();

            if (checkError) throw checkError;

            // Função auxiliar para notificar
            const notifyUser = async () => {
                const { data: userProfile } = await supabase
                    .from('profiles')
                    .select('id')
                    .eq('email', emailLower)
                    .maybeSingle();

                if (userProfile) {
                    await sendNotification(
                        userProfile.id,
                        "Novo Convite de Trabalho",
                        `O salão ${salonName} convidou-te para fazer parte da equipa.`,
                        { screen: '/invites' }
                    );
                }
            };

            if (existingMember) {
                if (existingMember.status === 'recusado') {
                    // Reenviar convite se foi recusado anteriormente
                    await supabase
                        .from('salon_staff')
                        .update({ status: 'pendente', temp_name: newStaffName.trim(), user_id: null })
                        .eq('id', existingMember.id);
                    
                    await notifyUser();
                    Alert.alert("Sucesso", "O convite foi reenviado!");
                } else {
                    Alert.alert("Duplicado", "Este email já faz parte da equipa ou tem convite pendente.");
                    setInviting(false);
                    return;
                }
            } else {
                // Inserir novo
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
        const mensagem = isPromoting
            ? "Dar acesso total? Ele poderá gerir a agenda e definições."
            : "Retirar acesso? Ele passará a ver apenas a agenda.";

        Alert.alert(titulo, mensagem, [
            { text: "Cancelar", style: "cancel" },
            {
                text: "Confirmar",
                onPress: async () => {
                    // Atualização Otimista (Visual Imediato)
                    const updatedList = staffList.map(s => s.id === staffMember.id ? { ...s, role: newRole } : s);
                    setStaffList(updatedList);

                    const { error } = await supabase
                        .from('salon_staff')
                        .update({ role: newRole })
                        .eq('id', staffMember.id);

                    if (error) {
                        Alert.alert("Erro", "Falha ao alterar cargo.");
                        fetchStaff(); // Reverte
                    }
                }
            }
        ]);
    }

    function removeStaff(id: number) {
        Alert.alert("Remover da Equipa", "Tens a certeza? O membro perderá o acesso.", [
            { text: "Cancelar", style: "cancel" },
            {
                text: "Remover",
                style: "destructive",
                onPress: async () => {
                    await supabase.from('salon_staff').delete().eq('id', id);
                    fetchStaff();
                }
            }
        ]);
    }

    // --- RENDER ---
    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: 'white' }}>
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
                
                {/* HEADER */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                        <Ionicons name="arrow-back" size={24} color="#333" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Gestão de Equipa</Text>
                    <View style={{ width: 40 }} />
                </View>

                {/* FORMULÁRIO DE ADIÇÃO */}
                <View style={styles.addForm}>
                    <Text style={styles.sectionTitle}>Adicionar Membro</Text>
                    
                    <View style={styles.inputRow}>
                        <Ionicons name="person-outline" size={20} color="#999" style={styles.inputIcon} />
                        <TextInput
                            style={styles.input}
                            placeholder="Nome do Funcionário"
                            value={newStaffName}
                            onChangeText={setNewStaffName}
                            autoCapitalize="words"
                        />
                    </View>

                    <View style={styles.inputRow}>
                        <Ionicons name="mail-outline" size={20} color="#999" style={styles.inputIcon} />
                        <TextInput
                            style={styles.input}
                            placeholder="email@funcionario.com"
                            value={newStaffEmail}
                            onChangeText={setNewStaffEmail}
                            autoCapitalize="none"
                            keyboardType="email-address"
                        />
                    </View>

                    <TouchableOpacity style={styles.inviteBtn} onPress={inviteStaff} disabled={inviting}>
                        {inviting ? <ActivityIndicator color="white" /> : <Text style={styles.inviteBtnText}>Enviar Convite</Text>}
                    </TouchableOpacity>
                </View>

                {/* LISTA DE MEMBROS */}
                <FlatList
                    data={staffList}
                    keyExtractor={item => item.id.toString()}
                    contentContainerStyle={{ padding: 20, paddingBottom: 50 }}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Ionicons name="people-outline" size={48} color="#CCC" />
                            <Text style={styles.emptyText}>Ainda não tens equipa.</Text>
                        </View>
                    }
                    renderItem={({ item }) => {
                        // Cores de Status
                        let statusColor = '#FF9500';
                        let statusText = 'Pendente';
                        if (item.status === 'ativo') { statusColor = '#4CD964'; statusText = 'Ativo'; }
                        else if (item.status === 'recusado') { statusColor = '#FF3B30'; statusText = 'Recusado'; }

                        return (
                            <View style={styles.staffCard}>
                                <View style={{ flex: 1 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                        <Text style={styles.memberName}>
                                            {item.profiles?.nome || item.temp_name || "Convidado"}
                                        </Text>

                                        {item.role === 'gerente' && (
                                            <View style={styles.badgeManager}>
                                                <Text style={styles.badgeManagerText}>GERENTE</Text>
                                            </View>
                                        )}
                                        {item.role !== 'gerente' && item.status === 'ativo' && (
                                            <View style={styles.badgeStaff}>
                                                <Text style={styles.badgeStaffText}>FUNCIONÁRIO</Text>
                                            </View>
                                        )}
                                    </View>

                                    <Text style={styles.memberEmail}>{item.email}</Text>

                                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 6 }}>
                                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: statusColor }} />
                                        <Text style={{ fontSize: 12, color: statusColor, fontWeight: '600' }}>{statusText}</Text>
                                    </View>
                                </View>

                                {/* AÇÕES */}
                                <View style={styles.actionsContainer}>
                                    <TouchableOpacity onPress={() => toggleManagerRole(item)} style={styles.actionBtn}>
                                        <MaterialCommunityIcons
                                            name={item.role === 'gerente' ? "crown" : "crown-outline"}
                                            size={24}
                                            color={item.role === 'gerente' ? "#FFD700" : "#CCC"}
                                        />
                                    </TouchableOpacity>

                                    <TouchableOpacity onPress={() => removeStaff(item.id)} style={styles.actionBtn}>
                                        <Ionicons name="trash-outline" size={22} color="#FF3B30" />
                                    </TouchableOpacity>
                                </View>
                            </View>
                        );
                    }}
                />
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
    backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center', borderRadius: 20, backgroundColor: '#F5F7FA' },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#1A1A1A' },

    addForm: { margin: 20, backgroundColor: 'white', borderRadius: 16, padding: 20, shadowColor: '#000', shadowOpacity: 0.05, elevation: 3 },
    sectionTitle: { fontSize: 14, fontWeight: 'bold', color: '#333', marginBottom: 15, textTransform: 'uppercase' },
    inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F7FA', borderRadius: 10, marginBottom: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: '#EEE' },
    inputIcon: { marginRight: 10 },
    input: { flex: 1, paddingVertical: 12, fontSize: 14, color: '#333' },
    inviteBtn: { backgroundColor: '#1A1A1A', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 5 },
    inviteBtnText: { color: 'white', fontWeight: 'bold', fontSize: 14 },

    emptyContainer: { alignItems: 'center', marginTop: 40 },
    emptyText: { color: '#CCC', marginTop: 10 },

    staffCard: {
        backgroundColor: 'white', borderRadius: 14, padding: 15, marginBottom: 12,
        flexDirection: 'row', alignItems: 'center',
        shadowColor: '#000', shadowOpacity: 0.03, elevation: 2, borderWidth: 1, borderColor: '#FAFAFA'
    },
    memberName: { fontSize: 16, fontWeight: '700', color: '#333' },
    memberEmail: { fontSize: 13, color: '#666', marginTop: 2 },
    
    badgeManager: { backgroundColor: '#FFF9C4', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: '#FBC02D' },
    badgeManagerText: { fontSize: 9, color: '#F57F17', fontWeight: 'bold' },
    
    badgeStaff: { backgroundColor: '#E3F2FD', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: '#64B5F6' },
    badgeStaffText: { fontSize: 9, color: '#1976D2', fontWeight: 'bold' },

    actionsContainer: { flexDirection: 'row', alignItems: 'center', gap: 10, marginLeft: 10 },
    actionBtn: { padding: 5 }
});