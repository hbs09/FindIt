import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
// 1. Adicionar este import
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
    Alert,
    FlatList,
    Modal,
    Platform,
    RefreshControl,
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

// ... (Tipos e Interface Appointment mantêm-se iguais) ...
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
    // 2. Obter os insets (margens seguras)
    const insets = useSafeAreaInsets();

    // ... (Estados mantêm-se iguais) ...
    const [loading, setLoading] = useState(true);
    const [salonId, setSalonId] = useState<number | null>(null);
    const [userRole, setUserRole] = useState<'owner' | 'staff' | null>(null);
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [pendingCount, setPendingCount] = useState(0);
    const [filter, setFilter] = useState<'agenda' | 'pendente' | 'cancelado'>('agenda');
    const [currentDate, setCurrentDate] = useState(new Date());
    const [tempDate, setTempDate] = useState(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);
    const filterRef = useRef(filter);

    const [hasPrevPending, setHasPrevPending] = useState(false);
    const [hasNextPending, setHasNextPending] = useState(false);

    // ... (useEffect e Funções auxiliares mantêm-se iguais) ...
    useEffect(() => { checkUserAndSalon(); }, []);
    useEffect(() => { filterRef.current = filter; }, [filter]);
    useEffect(() => {
        if (salonId) {
            fetchAppointments();
            fetchPendingCount();
            checkPendingDirections(); // <--- ADICIONA ISTO
            setupRealtime();
        }
    }, [salonId, filter, currentDate]);

    async function checkUserAndSalon() {
        // ... (Lógica igual ao original) ...
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return router.replace('/login');
            const { data: salonOwner } = await supabase.from('salons').select('id').eq('dono_id', user.id).single();
            if (salonOwner) { setSalonId(salonOwner.id); setUserRole('owner'); return; }
            const { data: staffRecord } = await supabase.from('salon_staff').select('salon_id, role').eq('user_id', user.id).eq('status', 'ativo').single();
            if (staffRecord) { setSalonId(staffRecord.salon_id); setUserRole(staffRecord.role === 'gerente' ? 'owner' : 'staff'); }
            else { Alert.alert("Erro", "Não foi possível identificar o salão."); router.back(); }
        } catch (error) { console.error(error); }
    }

    // --- NOVA FUNÇÃO: VERIFICAR PENDENTES NOUTROS DIAS ---
    async function checkPendingDirections() {
        if (!salonId) return;

        const start = new Date(currentDate); start.setHours(0, 0, 0, 0);
        const end = new Date(currentDate); end.setHours(23, 59, 59, 999);

        // 1. Verificar Passado
        const { count: prevCount } = await supabase
            .from('appointments')
            .select('id', { count: 'exact', head: true })
            .eq('salon_id', salonId)
            .eq('status', 'pendente')
            .lt('data_hora', start.toISOString());

        // 2. Verificar Futuro
        const { count: nextCount } = await supabase
            .from('appointments')
            .select('id', { count: 'exact', head: true })
            .eq('salon_id', salonId)
            .eq('status', 'pendente')
            .gt('data_hora', end.toISOString());

        setHasPrevPending((prevCount || 0) > 0);
        setHasNextPending((nextCount || 0) > 0);
    }

    function setupRealtime() {
        if (!salonId) return;
        const channel = supabase
            .channel('agenda-updates')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'appointments', filter: `salon_id=eq.${salonId}` },
                () => {
                    fetchAppointments(true);
                    fetchPendingCount();
                    checkPendingDirections(); // <--- ADICIONA AQUI TAMBÉM
                }
            )
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }

    async function fetchPendingCount() {
        if (!salonId) return;
        const { count } = await supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('salon_id', salonId).eq('status', 'pendente');
        if (count !== null) setPendingCount(count);
    }

    async function fetchAppointments(isBackground = false) {
        if (!salonId) return;
        if (!isBackground) { setLoading(true); setAppointments([]); }
        let query = supabase.from('appointments').select(`id, cliente_nome, data_hora, status, notas, services (nome, preco)`).eq('salon_id', salonId).order('data_hora', { ascending: true });
        const start = new Date(currentDate); start.setHours(0, 0, 0, 0);
        const end = new Date(currentDate); end.setHours(23, 59, 59, 999);
        query = query.gte('data_hora', start.toISOString()).lte('data_hora', end.toISOString());
        const currentFilter = filterRef.current;
        if (currentFilter === 'agenda') { query = query.not('status', 'in', '("cancelado","cancelado_cliente","cancelado_salao")'); }
        else if (currentFilter === 'cancelado') { query = query.in('status', ['cancelado', 'cancelado_cliente', 'cancelado_salao']); }
        else { query = query.eq('status', currentFilter); }
        const { data } = await query;
        if (data) {
            const normalizedData = data.map((item: any) => ({ ...item, services: Array.isArray(item.services) ? item.services[0] : item.services }));
            setAppointments(normalizedData);
        }
        if (!isBackground) setLoading(false);
    }

    async function updateStatus(id: number, newStatus: string) {
        if (newStatus === 'faltou') {
            Alert.alert("Marcar Falta", "O cliente não compareceu?", [{ text: "Cancelar", style: "cancel" }, { text: "Sim, Faltou", style: 'destructive', onPress: async () => { await executeUpdate(id, newStatus); } }]);
        } else { await executeUpdate(id, newStatus); }
    }

    async function executeUpdate(id: number, newStatus: string) {
        setAppointments(prevList => {
            if (filter !== 'agenda' && filter !== newStatus) { return prevList.filter(item => item.id !== id); }
            return prevList.map(item => item.id === id ? { ...item, status: newStatus } : item);
        });
        const { error } = await supabase.from('appointments').update({ status: newStatus }).eq('id', id);
        if (!error) { notifyClient(id, newStatus); fetchAppointments(true); }
        else { Alert.alert("Erro", "Não foi possível atualizar."); fetchAppointments(true); }
    }

    async function notifyClient(id: number, newStatus: string) {
        const { data: appointment } = await supabase.from('appointments').select('cliente_id, services(nome)').eq('id', id).single();
        if (appointment?.cliente_id) {
            let msg = `O estado do seu agendamento mudou para: ${newStatus}.`;
            if (newStatus === 'confirmado') msg = `O seu agendamento foi confirmado!`;
            if (newStatus === 'cancelado') msg = `O seu agendamento foi cancelado pelo estabelecimento.`;
            await sendNotification(appointment.cliente_id, "Atualização de Agendamento", msg, { screen: '/history' });
        }
    }

    function changeDate(days: number) {
        const newDate = new Date(currentDate); newDate.setDate(newDate.getDate() + days); setCurrentDate(newDate);
    }

    const onChangeDate = (event: any, selectedDate?: Date) => {
        if (Platform.OS === 'android') { setShowDatePicker(false); if (selectedDate && event.type !== 'dismissed') setCurrentDate(selectedDate); }
        else { if (selectedDate) setTempDate(selectedDate); }
    };

    function getStatusConfig(status: string) {
        switch (status) {
            case 'confirmado': return { color: '#2E7D32', bg: '#E8F5E9', label: 'Confirmado' };
            case 'cancelado_salao': return { color: '#C62828', bg: '#FFEBEE', label: 'Cancelado por Ti' };
            case 'cancelado': return { color: '#546E7A', bg: '#ECEFF1', label: 'Cancelado (Cliente)' };
            case 'cancelado_cliente': return { color: '#546E7A', bg: '#ECEFF1', label: 'Cancelado (Cliente)' };
            case 'pendente': return { color: '#EF6C00', bg: '#FFF3E0', label: 'Pendente' };
            case 'concluido': return { color: '#1A1A1A', bg: '#F5F5F5', label: 'Concluído' };
            case 'faltou': return { color: '#C62828', bg: '#FFEBEE', label: 'Faltou' };
            default: return { color: '#757575', bg: '#F5F5F5', label: status };
        }
    }

    // --- RENDER ---
    return (
        <View style={{ flex: 1, backgroundColor: BG_COLOR }}>

            {/* MODAIS (DatePickers) - Mantêm-se iguais */}
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
            {showDatePicker && Platform.OS === 'android' && (
                <DateTimePicker value={currentDate} mode="date" display="default" onChange={onChangeDate} />
            )}

            {/* --- HEADER MODERNO COMPACTO (Fixo) --- */}
            <View style={[styles.headerContainer, { paddingTop: insets.top }]}>

                {/* 1. LINHA SUPERIOR: Título e Ações (Mais compacta) */}
                <View style={styles.topBar}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
                        <Ionicons name="arrow-back" size={22} color={THEME_COLOR} />
                    </TouchableOpacity>

                    <Text style={styles.pageTitle}>Agenda</Text>

                    <TouchableOpacity onPress={() => { setTempDate(currentDate); setShowDatePicker(true); }} style={[styles.iconButton, { backgroundColor: '#F5F5F5' }]}>
                        <Ionicons name="calendar" size={18} color={THEME_COLOR} />
                    </TouchableOpacity>
                </View>

                {/* 2. SELETOR DE DATA */}
                <View style={styles.dateSelector}>
                    <TouchableOpacity onPress={() => changeDate(-1)} style={styles.navArrow}>
                        <Ionicons name="chevron-back" size={18} color="#666" />
                        {/* Bolinha se houver pendentes no PASSADO */}
                        {hasPrevPending && <View style={styles.arrowDot} />}
                    </TouchableOpacity>

                    <View style={styles.dateDisplay}>
                        <Text style={styles.dateWeek}>
                            {currentDate.toLocaleDateString('pt-PT', { weekday: 'long' })}
                        </Text>
                        <Text style={styles.dateDay}>
                            {currentDate.toLocaleDateString('pt-PT', { day: 'numeric', month: 'long' })}
                        </Text>
                    </View>

                    <TouchableOpacity onPress={() => changeDate(1)} style={styles.navArrow}>
                        <Ionicons name="chevron-forward" size={18} color="#666" />
                        {/* Bolinha se houver pendentes no FUTURO */}
                        {hasNextPending && <View style={styles.arrowDot} />}
                    </TouchableOpacity>
                </View>

                {/* 3. FILTROS (Chips mais baixos) */}
                <View style={styles.filterRow}>
                    {[
                        { id: 'agenda', label: 'Agenda' },
                        { id: 'pendente', label: 'Pendentes' },
                        { id: 'cancelado', label: 'Cancelados' }
                    ].map(f => (
                        <TouchableOpacity
                            key={f.id}
                            onPress={() => setFilter(f.id as any)}
                            style={[styles.chip, filter === f.id && styles.chipActive]}
                        >
                            <Text style={[styles.chipText, filter === f.id && styles.chipTextActive]}>
                                {f.label}
                            </Text>
                            {f.id === 'pendente' && pendingCount > 0 && (
                                <View style={styles.notificationDot} />
                            )}
                        </TouchableOpacity>
                    ))}
                </View>
            </View>

            {/* --- LISTA (Conteúdo) --- */}
            <FlatList
                data={appointments}
                keyExtractor={(item) => item.id.toString()}
                style={{ flex: 1 }}
                contentContainerStyle={{
                    flexGrow: 1,
                    paddingBottom: 100 + insets.bottom,
                    paddingHorizontal: 20,
                    paddingTop: 20 // Espaço extra para o conteúdo não colar ao header
                }}

                refreshControl={
                    <RefreshControl
                        refreshing={loading}
                        onRefresh={() => fetchAppointments(false)}
                        colors={[THEME_COLOR]}
                        tintColor={THEME_COLOR}
                    />
                }

                ListEmptyComponent={
                    loading ? null : (
                        <View style={styles.emptyContainer}>
                            <View style={styles.emptyIconBg}>
                                <Ionicons name="calendar-clear-outline" size={32} color="#CCC" />
                            </View>
                            <Text style={styles.emptyText}>Nada marcado para hoje.</Text>
                        </View>
                    )
                }

                renderItem={({ item, index }) => {
                    // (O teu renderItem original mantém-se exatamente igual aqui)
                    const statusConfig = getStatusConfig(item.status);
                    const isLast = index === appointments.length - 1;
                    const dateObj = new Date(item.data_hora);
                    const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                    return (
                        <View style={styles.timelineRow}>
                            <View style={styles.leftColumn}>
                                <Text style={styles.timeText}>{timeStr}</Text>
                                <View style={styles.lineWrapper}>
                                    <View style={[styles.timelineDot, { borderColor: statusConfig.color }]} />
                                    {!isLast && <View style={styles.timelineLine} />}
                                </View>
                            </View>

                            <View style={styles.rightColumn}>
                                <View style={styles.card}>
                                    <View style={styles.cardHeader}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.clientName} numberOfLines={1}>{item.cliente_nome}</Text>
                                            <Text style={styles.serviceName}>{item.services?.nome}</Text>
                                        </View>
                                        <View style={[styles.statusBadge, { backgroundColor: statusConfig.bg }]}>
                                            <Text style={[styles.statusText, { color: statusConfig.color }]}>{statusConfig.label}</Text>
                                        </View>
                                    </View>

                                    <View style={styles.cardFooter}>
                                        <Text style={styles.priceText}>{item.services?.preco?.toFixed(2)}€</Text>
                                        {item.notas && (
                                            <TouchableOpacity onPress={() => Alert.alert("Nota", item.notas)} style={{ flexDirection: 'row', alignItems: 'center' }}>
                                                <Ionicons name="document-text-outline" size={14} color="#FF9800" />
                                                <Text style={{ fontSize: 11, color: '#FF9800', marginLeft: 2 }}>Ver Nota</Text>
                                            </TouchableOpacity>
                                        )}
                                    </View>

                                    {item.status === 'pendente' && (
                                        <View style={styles.actionsRow}>
                                            <TouchableOpacity onPress={() => updateStatus(item.id, 'cancelado_salao')} style={[styles.actionBtn, { borderColor: '#FFEBEE', backgroundColor: '#FFF' }]}>
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
    );
}

const styles = StyleSheet.create({
    // Os estilos mantêm-se os mesmos
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 15,
        backgroundColor: 'white',
        zIndex: 10,
    },
    headerTitle: { fontSize: 18, fontWeight: '800', color: THEME_COLOR },
    iconBtn: { padding: 5 },
    dateStrip: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        marginBottom: 0,
        backgroundColor: 'white',
        paddingBottom: 15,
        zIndex: 10,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 5, elevation: 3
    },
    dateCenter: { alignItems: 'center' },
    arrowBtn: { padding: 10, backgroundColor: '#F5F5F5', borderRadius: 20 },
    filterContainer: { flexDirection: 'row', paddingHorizontal: 20, gap: 10, marginBottom: 15 },
    filterPill: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, backgroundColor: 'white', borderWidth: 1, borderColor: '#EEE' },
    filterPillActive: { backgroundColor: THEME_COLOR, borderColor: THEME_COLOR },
    filterText: { fontSize: 12, fontWeight: '600', color: '#666' },
    badgeDot: { position: 'absolute', top: 0, right: 0, width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF3B30', borderWidth: 1, borderColor: 'white' },
    emptyContainer: { alignItems: 'center', marginTop: 60 },
    emptyIconBg: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#F0F0F0', justifyContent: 'center', alignItems: 'center', marginBottom: 15 },
    emptyText: { color: '#999', fontSize: 14 },
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
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center' },
    modalContent: { backgroundColor: 'white', margin: 20, borderRadius: 16, padding: 20 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
    headerContainer: {
        backgroundColor: 'white',
        borderBottomLeftRadius: 20, // Raio um pouco menor
        borderBottomRightRadius: 20,
        paddingBottom: 12, // Reduzido de 20 para 12
        // Sombra
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.05,
        shadowRadius: 5,
        elevation: 4,
        zIndex: 100,
    },
    topBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 15, // Menos padding lateral
        paddingTop: 5,         // Menos espaço no topo
        marginBottom: 5,       // Reduzido de 15 para 5 (Aproxima o título da data)
    },
    pageTitle: {
        fontSize: 18, // Reduzido ligeiramente de 22
        fontWeight: '800',
        color: THEME_COLOR,
    },
    iconButton: {
        width: 36, // Ícones menores (era 40)
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
    },

    // Date Selector Compacto
    dateSelector: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 10, // Reduzido de 20 para 10 (Aproxima a data dos filtros)
        gap: 10,
    },
    navArrow: {
        padding: 6, // Botão da seta mais pequeno
        borderRadius: 15,
        backgroundColor: '#F5F5F5',
    },
    dateDisplay: {
        alignItems: 'center',
        minWidth: 120, // Reduzido largura mínima
    },
    dateWeek: {
        fontSize: 11,
        color: '#888',
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 0, // Remove margem extra
        lineHeight: 12,  // Altura de linha compacta
    },
    dateDay: {
        fontSize: 16, // Reduzido de 18
        fontWeight: '700',
        color: THEME_COLOR,
        textTransform: 'capitalize',
        lineHeight: 20,
    },

    // Filter Chips Compactos
    filterRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 8, // Espaço entre botões menor
        paddingHorizontal: 15,
    },
    chip: {
        paddingVertical: 6, // Reduzido altura do botão (era 8)
        paddingHorizontal: 14,
        borderRadius: 20,
        backgroundColor: '#F5F5F5',
        minWidth: 70,
        alignItems: 'center',
    },
    chipActive: {
        backgroundColor: THEME_COLOR,
    },
    chipText: {
        fontSize: 12, // Texto menor (era 13)
        fontWeight: '600',
        color: '#666',
    },
    chipTextActive: {
        color: 'white',
    },
    notificationDot: {
        position: 'absolute',
        top: -2,
        right: -2,
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#FF3B30',
        borderWidth: 1.5,
        borderColor: 'white',
    },
    arrowDot: {
        position: 'absolute',
        top: -2,
        right: -2,
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#FF3B30',
        borderWidth: 1.5,
        borderColor: 'white',
    },
});