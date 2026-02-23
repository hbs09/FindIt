import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
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
    temp_name?: string | null;
    profiles?: {
        nome: string;
        avatar_url?: string | null;
    };
};

type SalonService = {
    id: number;
    nome: string;
    service_categories?: { nome: string } | null;
};

export default function ManagerTeam() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [salonId, setSalonId] = useState<number | null>(null);
    const [salonName, setSalonName] = useState('');

    // Dados da Lista
    const [staffList, setStaffList] = useState<StaffMember[]>([]);
    const [salonServices, setSalonServices] = useState<SalonService[]>([]);

    // Estados do Modal de Convite
    const [isModalVisible, setModalVisible] = useState(false);
    const [newStaffEmail, setNewStaffEmail] = useState('');
    const [inviting, setInviting] = useState(false);

    // Estados do Modal de Especialidades
    const [isSpecModalVisible, setSpecModalVisible] = useState(false);
    const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
    const [staffSpecialties, setStaffSpecialties] = useState<Set<number>>(new Set());
    const [savingSpec, setSavingSpec] = useState(false);
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

    const [refreshing, setRefreshing] = useState(false);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);

    // --- INICIALIZAÇÃO ---
    useEffect(() => {
        checkPermission();
    }, []);

    useEffect(() => {
        if (salonId) {
            fetchStaff();
            fetchSalonServices();
        }
    }, [salonId]);

    // --- VERIFICAÇÃO DE PERMISSÕES ---
    async function checkPermission() {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return router.replace('/login');

            setCurrentUserId(user.id);

            const { data: salonOwner } = await supabase.from('salons').select('id, nome_salao').eq('dono_id', user.id).single();

            if (salonOwner) {
                setSalonId(salonOwner.id);
                setSalonName(salonOwner.nome_salao);
                return;
            }

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

    // --- CARREGAR EQUIPA E SERVIÇOS ---
    async function fetchStaff(showLoadingIndicator = true) {
        if (!salonId) return;
        if (showLoadingIndicator) setLoading(true);

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

        if (showLoadingIndicator) setLoading(false);
    }

    async function fetchSalonServices() {
        if (!salonId) return;
        const { data } = await supabase
            .from('services')
            .select('id, nome, service_categories(nome)')
            .eq('salon_id', salonId)
            .order('nome');

        if (data) {
            const formattedData = data.map((item: any) => ({
                id: item.id,
                nome: item.nome,
                service_categories: Array.isArray(item.service_categories)
                    ? item.service_categories[0]
                    : item.service_categories
            }));
            setSalonServices(formattedData);
        }
    }

    async function onRefresh() {
        setRefreshing(true);
        await fetchStaff(false);
        await fetchSalonServices();
        setRefreshing(false);
    }

    // --- MAGIA DE AGRUPAMENTO E ACORDEÃO (ESPECIALIDADES) ---
    const groupedSalonServices = useMemo(() => {
        const groups: { [key: string]: SalonService[] } = {};
        salonServices.forEach(service => {
            const catName = service.service_categories?.nome || 'Geral';
            if (!groups[catName]) groups[catName] = [];
            groups[catName].push(service);
        });
        return Object.keys(groups).sort().map(title => ({
            title,
            data: groups[title]
        }));
    }, [salonServices]);

    function toggleGroupExpansion(groupTitle: string) {
        setExpandedGroups(prev => {
            const newSet = new Set(prev);
            if (newSet.has(groupTitle)) newSet.delete(groupTitle);
            else newSet.add(groupTitle);
            return newSet;
        });
    }

    function toggleGroupSelection(group: { title: string, data: SalonService[] }) {
        const groupServiceIds = group.data.map(s => s.id);
        const allSelected = groupServiceIds.every(id => staffSpecialties.has(id));

        setStaffSpecialties(prev => {
            const newSet = new Set(prev);
            if (allSelected) {
                groupServiceIds.forEach(id => newSet.delete(id));
            } else {
                groupServiceIds.forEach(id => newSet.add(id));
            }
            return newSet;
        });
    }

    // --- AÇÕES: ESPECIALIDADES ---
    async function openSpecialtiesModal(staff: StaffMember) {
        setSelectedStaff(staff);
        setSpecModalVisible(true);
        
        const { data } = await supabase
            .from('staff_services')
            .select('service_id')
            .eq('staff_id', staff.id);
            
        if (data) {
            const currentSpecs = new Set(data.map(s => s.service_id));
            setStaffSpecialties(currentSpecs);
        }
    }

    function toggleSpecialty(serviceId: number) {
        setStaffSpecialties(prev => {
            const newSet = new Set(prev);
            if (newSet.has(serviceId)) newSet.delete(serviceId);
            else newSet.add(serviceId);
            return newSet;
        });
    }

    async function saveSpecialties() {
        if (!selectedStaff) return;
        setSavingSpec(true);

        try {
            await supabase.from('staff_services').delete().eq('staff_id', selectedStaff.id);

            if (staffSpecialties.size > 0) {
                const arrayToInsert = Array.from(staffSpecialties).map(serviceId => ({
                    staff_id: selectedStaff.id,
                    service_id: serviceId
                }));
                const { error } = await supabase.from('staff_services').insert(arrayToInsert);
                if (error) throw error;
            }

            Alert.alert("Sucesso", "Especialidades atualizadas!");
            setSpecModalVisible(false);
        } catch (error) {
            console.error(error);
            Alert.alert("Erro", "Não foi possível guardar as especialidades.");
        } finally {
            setSavingSpec(false);
        }
    }

    // --- AÇÕES: CONVIDAR ---
    async function inviteStaff() {
        if (!newStaffEmail.trim()) {
            return Alert.alert("Campo Vazio", "Por favor, escreve o email.");
        }

        setInviting(true);
        const emailLower = newStaffEmail.trim().toLowerCase();

        try {
            const { data: userProfile, error: profileError } = await supabase
                .from('profiles')
                .select('id')
                .eq('email', emailLower)
                .maybeSingle();

            if (profileError) throw profileError;

            if (!userProfile) {
                Alert.alert(
                    "Utilizador não encontrado",
                    "Este email não está registado no FindIt. O funcionário precisa de criar conta na app primeiro."
                );
                setInviting(false);
                return;
            }

            const { data: existingMember, error: checkError } = await supabase
                .from('salon_staff')
                .select('*')
                .eq('salon_id', salonId)
                .eq('email', emailLower)
                .maybeSingle();

            if (checkError) throw checkError;

            const notifyUser = async () => {
                await sendNotification(
                    userProfile.id,
                    "Novo Convite de Trabalho",
                    `O salão ${salonName} convidou-te para fazer parte da equipa.`,
                    { screen: '/invites' }
                );
            };

            if (existingMember) {
                if (existingMember.status === 'recusado') {
                    const { error: updateError } = await supabase
                        .from('salon_staff')
                        .update({
                            status: 'pendente',
                            temp_name: null,
                            user_id: null
                        })
                        .eq('id', existingMember.id);

                    if (updateError) throw updateError;

                    await notifyUser();
                    Alert.alert("Sucesso", "O convite foi reenviado ao utilizador!");
                    setNewStaffEmail('');
                    setModalVisible(false);
                    fetchStaff();
                }
                else {
                    Alert.alert("Duplicado", "Este funcionário já faz parte da equipa ou tem um convite pendente.");
                }
            }
            else {
                const { error: insertError } = await supabase
                    .from('salon_staff')
                    .insert({
                        salon_id: salonId,
                        email: emailLower,
                        temp_name: null,
                        status: 'pendente'
                    });

                if (insertError) throw insertError;

                await notifyUser();
                Alert.alert("Sucesso", "Convite enviado!");
                setNewStaffEmail('');
                setModalVisible(false);
                fetchStaff();
            }

        } catch (error: any) {
            console.error(error);
            Alert.alert("Erro", error.message || "Ocorreu um erro ao enviar o convite.");
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
        <View style={{ flex: 1, backgroundColor: '#f8f9fa' }}>
            <StatusBar barStyle="dark-content" backgroundColor="white" />

            <SafeAreaView edges={['top']} style={{ backgroundColor: 'white' }}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                        <Ionicons name="arrow-back" size={24} color="#1A1A1A" />
                    </TouchableOpacity>

                    <Text style={styles.headerTitle}>Gestão de Staff</Text>

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
                    refreshing={refreshing}
                    onRefresh={onRefresh}
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
                        const hasName = item.profiles?.nome || item.temp_name;
                        const avatarUrl = item.profiles?.avatar_url;
                        const initial = (hasName || item.email).charAt(0).toUpperCase();

                        const isManager = item.role === 'gerente';
                        const isActive = item.status === 'ativo';
                        const isMe = item.user_id === currentUserId;

                        const statusConfig = isActive
                            ? { color: '#4CD964', text: 'Ativo', bg: '#E8F5E9' }
                            : { color: '#FF9500', text: 'Pendente', bg: '#FFF3E0' };

                        return (
                            <View style={styles.card}>
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

                                <View style={styles.infoContainer}>
                                    {hasName ? (
                                        <Text style={styles.nameText} numberOfLines={1}>{hasName}</Text>
                                    ) : null}

                                    <Text style={styles.emailText} numberOfLines={1}>{item.email}</Text>

                                    <View style={[styles.statusBadge, { backgroundColor: statusConfig.bg }]}>
                                        <View style={[styles.statusDot, { backgroundColor: statusConfig.color }]} />
                                        <Text style={[styles.statusText, { color: statusConfig.color }]}>
                                            {statusConfig.text}
                                        </Text>
                                    </View>
                                </View>

                                {/* AÇÕES DA EQUIPA */}
                                <View style={styles.actions}>
                                    <TouchableOpacity onPress={() => openSpecialtiesModal(item)} style={styles.actionIconBtn}>
                                        <Ionicons name="cut-outline" size={20} color="#1a1a1a" />
                                    </TouchableOpacity>

                                    {!isMe && (
                                        <TouchableOpacity onPress={() => toggleManagerRole(item)} style={styles.actionIconBtn}>
                                            <MaterialCommunityIcons
                                                name={isManager ? "shield-check" : "shield-outline"}
                                                size={22}
                                                color={isManager ? "#1a1a1a" : "#aaa"}
                                            />
                                        </TouchableOpacity>
                                    )}

                                    {!isMe && (
                                        <TouchableOpacity onPress={() => removeStaff(item.id)} style={[styles.actionIconBtn, { backgroundColor: '#FFEBEE' }]}>
                                            <Ionicons name="trash-outline" size={20} color="#D32F2F" />
                                        </TouchableOpacity>
                                    )}
                                </View>
                            </View>
                        );
                    }}
                />
            </View>

            {/* --- MODAL DE ADICIONAR MEMBRO --- */}
            <Modal
                animationType="fade"
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
                            <Text style={styles.modalTitle}>Adicionar Staff</Text>
                            <TouchableOpacity onPress={() => setModalVisible(false)}>
                                <Ionicons name="close" size={24} color="#aaa" />
                            </TouchableOpacity>
                        </View>

                        <Text style={styles.modalSubtitle}>
                            Insere o email do profissional. Ele receberá uma notificação para aceitar o convite.
                        </Text>

                        <View style={styles.inputContainer}>
                            <Text style={styles.label}>Email do Utilizador</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="exemplo@email.com"
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

            {/* --- MODAL DE ESPECIALIDADES --- */}
            <Modal
                animationType="slide"
                transparent={true}
                visible={isSpecModalVisible}
                onRequestClose={() => setSpecModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { height: '80%', paddingBottom: 20 }]}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Especialidades</Text>
                            <TouchableOpacity onPress={() => setSpecModalVisible(false)}>
                                <Ionicons name="close" size={24} color="#aaa" />
                            </TouchableOpacity>
                        </View>

                        <Text style={styles.modalSubtitle}>
                            Selecione os serviços que {selectedStaff?.profiles?.nome || selectedStaff?.temp_name || 'este profissional'} está habilitado a realizar.
                        </Text>

                        {/* LISTA DE SERVIÇOS AGRUPADOS (ACORDEÃO) */}
                        <ScrollView style={{ flex: 1, marginBottom: 20 }} showsVerticalScrollIndicator={false}>
                            {groupedSalonServices.length === 0 ? (
                                <Text style={{ textAlign: 'center', marginTop: 20, color: '#888' }}>Não tens serviços criados no salão.</Text>
                            ) : (
                                groupedSalonServices.map((group) => {
                                    const isExpanded = expandedGroups.has(group.title);
                                    const groupIds = group.data.map(s => s.id);
                                    const selectedCount = groupIds.filter(id => staffSpecialties.has(id)).length;
                                    const allSelected = selectedCount === groupIds.length;
                                    const someSelected = selectedCount > 0 && !allSelected;

                                    return (
                                        <View key={group.title} style={styles.groupContainer}>
                                            <View style={styles.groupHeaderRow}>
                                                <TouchableOpacity
                                                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
                                                    onPress={() => toggleGroupExpansion(group.title)}
                                                    activeOpacity={0.7}
                                                >
                                                    <Ionicons
                                                        name={isExpanded ? "chevron-down" : "chevron-forward"}
                                                        size={20}
                                                        color="#6B7280"
                                                        style={{ marginRight: 8 }}
                                                    />
                                                    <Text style={styles.groupTitleText}>{group.title}</Text>
                                                    <Text style={styles.groupCountText}>
                                                        ({selectedCount}/{groupIds.length})
                                                    </Text>
                                                </TouchableOpacity>

                                                <TouchableOpacity
                                                    style={[
                                                        styles.checkbox,
                                                        (allSelected || someSelected) && styles.checkboxSelected,
                                                        someSelected && { backgroundColor: '#CCFBF1', borderColor: '#14B8A6' }
                                                    ]}
                                                    onPress={() => toggleGroupSelection(group)}
                                                >
                                                    {allSelected && <Ionicons name="checkmark" size={16} color="white" />}
                                                    {someSelected && <Ionicons name="remove" size={16} color="#0F766E" />}
                                                </TouchableOpacity>
                                            </View>

                                            {isExpanded && (
                                                <View style={styles.expandedContent}>
                                                    {group.data.map((service) => {
                                                        const isSelected = staffSpecialties.has(service.id);
                                                        return (
                                                            <TouchableOpacity
                                                                key={service.id}
                                                                style={[styles.specItem, isSelected && styles.specItemSelected]}
                                                                onPress={() => toggleSpecialty(service.id)}
                                                                activeOpacity={0.7}
                                                            >
                                                                <Text style={[styles.specName, isSelected && styles.specNameSelected]}>
                                                                    {service.nome}
                                                                </Text>

                                                                <View style={[styles.checkbox, isSelected && styles.checkboxSelected, { width: 20, height: 20 }]}>
                                                                    {isSelected && <Ionicons name="checkmark" size={14} color="white" />}
                                                                </View>
                                                            </TouchableOpacity>
                                                        );
                                                    })}
                                                </View>
                                            )}
                                        </View>
                                    );
                                })
                            )}
                        </ScrollView>

                        <TouchableOpacity style={styles.sendButton} onPress={saveSpecialties} disabled={savingSpec}>
                            {savingSpec ? (
                                <ActivityIndicator color="white" />
                            ) : (
                                <Text style={styles.sendButtonText}>Guardar Especialidades</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 15,
        backgroundColor: 'white',
        borderBottomWidth: 1,
        borderBottomColor: '#F0F0F0'
    },
    backButton: {
        width: 40, height: 40, justifyContent: 'center', alignItems: 'center',
        borderRadius: 12, backgroundColor: '#FFFFFF',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 5, elevation: 2,
    },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#1A1A1A' },
    addButton: {
        width: 40, height: 40, borderRadius: 20, backgroundColor: '#1a1a1a',
        justifyContent: 'center', alignItems: 'center',
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
        flexDirection: 'row', alignItems: 'center', backgroundColor: 'white',
        borderRadius: 16, padding: 15, marginBottom: 12,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
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

    actions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
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
    sendButtonText: { color: 'white', fontWeight: 'bold', fontSize: 16 },

    // --- ESTILOS DO ACORDEÃO E ESPECIALIDADES ---
    groupContainer: { marginBottom: 12, backgroundColor: 'white', borderRadius: 12, borderWidth: 1, borderColor: '#F3F4F6', overflow: 'hidden' },
    groupHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, backgroundColor: '#F9FAFB' },
    groupTitleText: { fontSize: 15, fontWeight: '700', color: '#374151', textTransform: 'uppercase' },
    groupCountText: { fontSize: 13, color: '#9CA3AF', marginLeft: 8, fontWeight: '600' },
    
    expandedContent: { padding: 12, paddingTop: 4, backgroundColor: 'white' },
    
    specItem: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingVertical: 12, paddingHorizontal: 12,
        borderRadius: 8, marginBottom: 4
    },
    specItemSelected: { backgroundColor: '#F0FDFA' },
    specName: { fontSize: 15, fontWeight: '500', color: '#4B5563' },
    specNameSelected: { color: '#0F766E', fontWeight: '600' },

    checkbox: {
        width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#D1D5DB',
        justifyContent: 'center', alignItems: 'center'
    },
    checkboxSelected: { backgroundColor: '#14B8A6', borderColor: '#14B8A6' }
});