import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    Alert,
    FlatList,
    Modal,
    Platform,
    RefreshControl,
    SafeAreaView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { supabase } from '../../../supabase';
import { sendNotification } from '../../../utils/notifications';

// --- CORES DO TEMA ---
const THEME_COLOR = '#1A1A1A';
const BG_COLOR = '#F8F9FA';
const LINE_COLOR = '#E0E0E0';

// --- TIPOS ---
type Appointment = {
    id: number;
    cliente_nome: string;
    data_hora: string;
    status: string;
    services: { nome: string; preco: number };
    notas?: string;
};

export default function ManagerAgenda() {
    const router = useRouter();

    // --- ESTADOS ---
    const [loading, setLoading] = useState(true);
    const [salonId, setSalonId] = useState<number | null>(null);
    const [userRole, setUserRole] = useState<'owner' | 'staff' | null>(null);

    // Dados
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [pendingCount, setPendingCount] = useState(0);

    // Filtros e Datas
    const [filter, setFilter] = useState<'agenda' | 'pendente' | 'cancelado'>('agenda');
    const [currentDate, setCurrentDate] = useState(new Date());
    const [tempDate, setTempDate] = useState(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);

    // --- INICIALIZAÇÃO ---
    useEffect(() => {
        checkUserAndSalon();
    }, []);

    useEffect(() => {
        if (salonId) {
            fetchAppointments();
            fetchPendingCount();
            setupRealtime();
        }
    }, [salonId, filter, currentDate]);

    // --- FUNÇÕES DE SETUP ---
    async function checkUserAndSalon() {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return router.replace('/login');

            const { data: salonOwner } = await supabase.from('salons').select('id').eq('dono_id', user.id).single();
            if (salonOwner) {
                setSalonId(salonOwner.id);
                setUserRole('owner');
                return;
            }

            const { data: staffRecord } = await supabase
                .from('salon_staff')
                .select('salon_id, role')
                .eq('user_id', user.id)
                .eq('status', 'ativo')
                .single();

            if (staffRecord) {
                setSalonId(staffRecord.salon_id);
                setUserRole(staffRecord.role === 'gerente' ? 'owner' : 'staff');
            } else {
                Alert.alert("Erro", "Não foi possível identificar o salão.");
                router.back();
            }
        } catch (error) {
            console.error(error);
        }
    }

    function setupRealtime() {
        if (!salonId) return;

        const channel = supabase
            .channel('agenda-updates')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'appointments', filter: `salon_id=eq.${salonId}` },
                () => {
                    // Usa 'true' para não mostrar o spinner de loading
                    fetchAppointments(true);
                    fetchPendingCount();
                }
            )
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }
    
    async function fetchPendingCount() {
        if (!salonId) return;
        const { count } = await supabase
            .from('appointments')
            .select('*', { count: 'exact', head: true })
            .eq('salon_id', salonId)
            .eq('status', 'pendente');
        if (count !== null) setPendingCount(count);
    }

    async function fetchAppointments(isBackground = false) {
        if (!salonId) return;

        // Só ativa o loading visual se NÃO for uma atualização em segundo plano
        if (!isBackground) setLoading(true);

        let query = supabase
            .from('appointments')
            .select(`id, cliente_nome, data_hora, status, notas, services (nome, preco)`)
            .eq('salon_id', salonId)
            .order('data_hora', { ascending: true });

        const start = new Date(currentDate); start.setHours(0, 0, 0, 0);
        const end = new Date(currentDate); end.setHours(23, 59, 59, 999);

        query = query.gte('data_hora', start.toISOString()).lte('data_hora', end.toISOString());

        if (filter === 'agenda') query = query.neq('status', 'cancelado');
        else query = query.eq('status', filter);

        const { data } = await query;

        if (data) {
            const normalizedData = data.map((item: any) => ({
                ...item,
                services: Array.isArray(item.services) ? item.services[0] : item.services
            }));
            setAppointments(normalizedData);
        }

        // Só desativa o loading se ele foi ativado
        if (!isBackground) setLoading(false);
    }

    // --- UPDATE STATUS ---
    async function updateStatus(id: number, newStatus: string) {
        if (newStatus === 'faltou') {
            Alert.alert(
                "Marcar Falta",
                "O cliente não compareceu?",
                [
                    { text: "Cancelar", style: "cancel" },
                    { text: "Sim, Faltou", style: 'destructive', onPress: async () => { await executeUpdate(id, newStatus); } }
                ]
            );
        } else {
            await executeUpdate(id, newStatus);
        }
    }

    async function executeUpdate(id: number, newStatus: string) {
        // 1. ATUALIZAÇÃO INSTANTÂNEA (OTIMISTA)
        // Remove ou atualiza o item localmente AGORA, sem esperar pelo servidor
        setAppointments(prevList => {
            // Se estamos num filtro específico (ex: pendentes) e o estado mudou, remove da lista
            if (filter !== 'agenda' && filter !== newStatus) {
                return prevList.filter(item => item.id !== id);
            }
            // Caso contrário, atualiza a cor/estado visualmente
            return prevList.map(item => item.id === id ? { ...item, status: newStatus } : item);
        });

        // 2. Envia para a base de dados em segundo plano
        const { error } = await supabase.from('appointments').update({ status: newStatus }).eq('id', id);

        if (!error) {
            notifyClient(id, newStatus);
            // Atualiza em silêncio (true) para garantir que os dados estão certos, sem piscar
            fetchAppointments(true);
        } else {
            Alert.alert("Erro", "Não foi possível atualizar.");
            fetchAppointments(true); // Reverte em caso de erro
        }
    }

    async function notifyClient(id: number, newStatus: string) {
        // Lógica de notificação simplificada para brevidade
        const { data: appointment } = await supabase.from('appointments').select('cliente_id, services(nome)').eq('id', id).single();
        if (appointment?.cliente_id) {
            let msg = `O estado do seu agendamento mudou para: ${newStatus}.`;
            if (newStatus === 'confirmado') msg = `O seu agendamento foi confirmado!`;
            if (newStatus === 'cancelado') msg = `O seu agendamento foi cancelado pelo estabelecimento.`;
            await sendNotification(appointment.cliente_id, "Atualização de Agendamento", msg, { screen: '/history' });
        }
    }

    // --- DATA HELPERS ---
    function changeDate(days: number) {
        const newDate = new Date(currentDate);
        newDate.setDate(newDate.getDate() + days);
        setCurrentDate(newDate);
    }

    const onChangeDate = (event: any, selectedDate?: Date) => {
        if (Platform.OS === 'android') {
            setShowDatePicker(false);
            if (selectedDate && event.type !== 'dismissed') setCurrentDate(selectedDate);
        } else {
            if (selectedDate) setTempDate(selectedDate);
        }
    };

    // --- UI HELPERS ---
    function getStatusConfig(status: string) {
        switch (status) {
            case 'confirmado': return { color: '#2E7D32', bg: '#E8F5E9', label: 'Confirmado' };
            case 'cancelado': return { color: '#C62828', bg: '#FFEBEE', label: 'Cancelado' };
            case 'pendente': return { color: '#EF6C00', bg: '#FFF3E0', label: 'Pendente' };
            case 'concluido': return { color: '#1A1A1A', bg: '#F5F5F5', label: 'Concluído' };
            case 'faltou': return { color: '#9E9E9E', bg: '#EEEEEE', label: 'Faltou' };
            default: return { color: '#757575', bg: '#F5F5F5', label: status };
        }
    }

    // --- RENDER ---
    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#FFF' }}>
            <View style={{ flex: 1, backgroundColor: BG_COLOR }}>

                {/* HEADER LIMPO */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
                        <Ionicons name="arrow-back" size={24} color={THEME_COLOR} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Agenda</Text>

                    {/* Botão de Calendário */}
                    <TouchableOpacity onPress={() => { setTempDate(currentDate); setShowDatePicker(true); }} style={styles.iconBtn}>
                        <Ionicons name="calendar-outline" size={22} color={THEME_COLOR} />
                    </TouchableOpacity>
                </View>

                {/* CONTROLO DE DATA (DIAS) */}
                <View style={styles.dateStrip}>
                    <TouchableOpacity onPress={() => changeDate(-1)} style={styles.arrowBtn}>
                        <Ionicons name="chevron-back" size={20} color="#666" />
                    </TouchableOpacity>

                    <View style={styles.dateCenter}>
                        <Text style={styles.dateWeek}>
                            {currentDate.toLocaleDateString('pt-PT', { weekday: 'long' }).toUpperCase()}
                        </Text>
                        <Text style={styles.dateDay}>
                            {currentDate.toLocaleDateString('pt-PT', { day: 'numeric', month: 'long' })}
                        </Text>
                    </View>

                    <TouchableOpacity onPress={() => changeDate(1)} style={styles.arrowBtn}>
                        <Ionicons name="chevron-forward" size={20} color="#666" />
                    </TouchableOpacity>
                </View>

                {/* FILTROS (TABS) */}
                <View style={styles.filterContainer}>
                    {[
                        { id: 'agenda', label: 'Agenda' },
                        { id: 'pendente', label: 'Pendentes' },
                        { id: 'cancelado', label: 'Cancelados' }
                    ].map(f => (
                        <TouchableOpacity
                            key={f.id}
                            onPress={() => setFilter(f.id as any)}
                            style={[styles.filterPill, filter === f.id && styles.filterPillActive]}
                        >
                            <Text style={[styles.filterText, filter === f.id && { color: 'white' }]}>
                                {f.label}
                            </Text>
                            {f.id === 'pendente' && pendingCount > 0 && (
                                <View style={styles.badgeDot} />
                            )}
                        </TouchableOpacity>
                    ))}
                </View>

                {/* MODAL DATE PICKER (IOS) */}
                {showDatePicker && Platform.OS === 'ios' && (
                    <Modal visible={showDatePicker} transparent animationType="fade">
                        <View style={styles.modalOverlay}>
                            <View style={styles.modalContent}>
                                <View style={styles.modalHeader}>
                                    <TouchableOpacity onPress={() => setShowDatePicker(false)}><Text style={{ color: '#666' }}>Cancelar</Text></TouchableOpacity>
                                    <TouchableOpacity onPress={() => { setCurrentDate(tempDate); setShowDatePicker(false); }}><Text style={{ color: '#007AFF', fontWeight: 'bold' }}>OK</Text></TouchableOpacity>
                                </View>
                                <DateTimePicker value={tempDate} mode="date" display="spinner" onChange={onChangeDate} style={{ height: 200 }} />
                            </View>
                        </View>
                    </Modal>
                )}
                {/* DATE PICKER (ANDROID) */}
                {showDatePicker && Platform.OS === 'android' && (
                    <DateTimePicker value={currentDate} mode="date" display="default" onChange={onChangeDate} />
                )}

                {/* LISTA (TIMELINE STYLE) */}
                <FlatList
                    data={appointments}
                    keyExtractor={(item) => item.id.toString()}
                    contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: 20, paddingTop: 10 }}
                    refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchAppointments} />}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <View style={styles.emptyIconBg}><Ionicons name="calendar-clear-outline" size={32} color="#CCC" /></View>
                            <Text style={styles.emptyText}>Nada marcado para hoje.</Text>
                        </View>
                    }
                    renderItem={({ item, index }) => {
                        const statusConfig = getStatusConfig(item.status);
                        const isLast = index === appointments.length - 1;
                        const dateObj = new Date(item.data_hora);
                        const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                        return (
                            <View style={styles.timelineRow}>
                                {/* Coluna da Esquerda (Hora + Linha) */}
                                <View style={styles.leftColumn}>
                                    <Text style={styles.timeText}>{timeStr}</Text>
                                    <View style={styles.lineWrapper}>
                                        <View style={[styles.timelineDot, { borderColor: statusConfig.color }]} />
                                        {!isLast && <View style={styles.timelineLine} />}
                                    </View>
                                </View>

                                {/* Coluna da Direita (Cartão) */}
                                <View style={styles.rightColumn}>
                                    <View style={styles.card}>

                                        {/* Cabeçalho do Cartão */}
                                        <View style={styles.cardHeader}>
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.clientName} numberOfLines={1}>{item.cliente_nome}</Text>
                                                <Text style={styles.serviceName}>{item.services?.nome}</Text>
                                            </View>
                                            <View style={[styles.statusBadge, { backgroundColor: statusConfig.bg }]}>
                                                <Text style={[styles.statusText, { color: statusConfig.color }]}>{statusConfig.label}</Text>
                                            </View>
                                        </View>

                                        {/* Preço e Notas */}
                                        <View style={styles.cardFooter}>
                                            <Text style={styles.priceText}>{item.services?.preco?.toFixed(2)}€</Text>

                                            {item.notas && (
                                                <TouchableOpacity onPress={() => Alert.alert("Nota", item.notas)} style={{ flexDirection: 'row', alignItems: 'center' }}>
                                                    <Ionicons name="document-text-outline" size={14} color="#FF9800" />
                                                    <Text style={{ fontSize: 11, color: '#FF9800', marginLeft: 2 }}>Ver Nota</Text>
                                                </TouchableOpacity>
                                            )}
                                        </View>

                                        {/* Ações (Se Pendente ou Confirmado) */}
                                        {item.status === 'pendente' && (
                                            <View style={styles.actionsRow}>
                                                <TouchableOpacity onPress={() => updateStatus(item.id, 'cancelado')} style={[styles.actionBtn, { borderColor: '#FFEBEE', backgroundColor: '#FFF' }]}>
                                                    <Text style={{ color: '#D32F2F', fontSize: 12, fontWeight: '600' }}>Rejeitar</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity onPress={() => updateStatus(item.id, 'confirmado')} style={[styles.actionBtn, { backgroundColor: '#1A1A1A' }]}>
                                                    <Text style={{ color: 'white', fontSize: 12, fontWeight: '600' }}>Confirmar</Text>
                                                </TouchableOpacity>
                                            </View>
                                        )}

                                        {item.status === 'confirmado' && (
                                            <View style={styles.actionsRow}>
                                                <TouchableOpacity onPress={() => updateStatus(item.id, 'faltou')} style={{ marginRight: 15 }}>
                                                    <Text style={{ color: '#999', fontSize: 11, fontWeight: '500' }}>Marcou Falta?</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity onPress={() => updateStatus(item.id, 'concluido')}>
                                                    <Text style={{ color: '#2E7D32', fontSize: 12, fontWeight: '700' }}>Concluir</Text>
                                                </TouchableOpacity>
                                            </View>
                                        )}
                                    </View>
                                </View>
                            </View>
                        );
                    }}
                />
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 15, backgroundColor: 'white' },
    headerTitle: { fontSize: 18, fontWeight: '800', color: THEME_COLOR },
    iconBtn: { padding: 5 },

    // Date Strip
    dateStrip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 15, backgroundColor: 'white', paddingBottom: 10 },
    dateCenter: { alignItems: 'center' },
    dateWeek: { fontSize: 11, color: '#999', fontWeight: '700', letterSpacing: 1 },
    dateDay: { fontSize: 16, fontWeight: '600', color: THEME_COLOR, textTransform: 'capitalize' },
    arrowBtn: { padding: 10, backgroundColor: '#F5F5F5', borderRadius: 20 },

    // Filters
    filterContainer: { flexDirection: 'row', paddingHorizontal: 20, gap: 10, marginBottom: 15 },
    filterPill: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, backgroundColor: 'white', borderWidth: 1, borderColor: '#EEE' },
    filterPillActive: { backgroundColor: THEME_COLOR, borderColor: THEME_COLOR },
    filterText: { fontSize: 12, fontWeight: '600', color: '#666' },
    badgeDot: { position: 'absolute', top: 0, right: 0, width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF3B30', borderWidth: 1, borderColor: 'white' },

    // Empty State
    emptyContainer: { alignItems: 'center', marginTop: 60 },
    emptyIconBg: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#F0F0F0', justifyContent: 'center', alignItems: 'center', marginBottom: 15 },
    emptyText: { color: '#999', fontSize: 14 },

    // Timeline
    timelineRow: { flexDirection: 'row', marginBottom: 20 },
    leftColumn: { width: 50, alignItems: 'center', marginRight: 10 },
    timeText: { fontSize: 14, fontWeight: '700', color: THEME_COLOR, marginBottom: 5 },
    lineWrapper: { flex: 1, alignItems: 'center', width: '100%' },
    timelineDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, backgroundColor: 'white', zIndex: 2 },
    timelineLine: { width: 1, backgroundColor: LINE_COLOR, flex: 1, position: 'absolute', top: 10, bottom: -20 },

    rightColumn: { flex: 1 },
    card: {
        backgroundColor: 'white', borderRadius: 16, padding: 15,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2
    },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
    clientName: { fontSize: 15, fontWeight: '700', color: THEME_COLOR, marginBottom: 2 },
    serviceName: { fontSize: 13, color: '#666' },

    statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
    statusText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },

    cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 5 },
    priceText: { fontSize: 14, fontWeight: '700', color: THEME_COLOR },

    actionsRow: { flexDirection: 'row', gap: 10, marginTop: 15, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F5F5F5', justifyContent: 'flex-end', alignItems: 'center' },
    actionBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: 'transparent' },

    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center' },
    modalContent: { backgroundColor: 'white', margin: 20, borderRadius: 16, padding: 20 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
});