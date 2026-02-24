import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
    Alert,
    FlatList,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
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

// 1. TIPO ATUALIZADO (Suporta múltiplos serviços num array e Guarda IDs)
type Appointment = {
    id: string; // Agora é uma string (ID do Grupo)
    apptIds: number[]; // Guarda todos os IDs originais para atualizar/cancelar de uma vez!
    cliente_nome: string;
    data_hora: string;
    status: string;
    services: { nome: string; preco: number }[]; // Agora é um Array!
    totalPrice: number; // Preço somado
    salon_staff?: {
        profiles?: { nome: string, full_name: string }
    };
    notas?: string;
};

export default function ManagerAgenda() {
    const router = useRouter();
    const insets = useSafeAreaInsets();

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

    const [myEmployeeId, setMyEmployeeId] = useState<number | null>(null);
    const [salonEmployees, setSalonEmployees] = useState<any[]>([]);
    const [selectedEmployeeFilter, setSelectedEmployeeFilter] = useState<number | 'all'>('all');

    useEffect(() => { checkUserAndSalon(); }, []);
    useEffect(() => { filterRef.current = filter; }, [filter]);
    useEffect(() => {
        if (salonId) {
            fetchAppointments();
            fetchPendingCount();
            checkPendingDirections();
            setupRealtime();
        }
    }, [salonId, filter, currentDate, selectedEmployeeFilter, myEmployeeId]);

    async function checkUserAndSalon() {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return router.replace('/login');

            let currentSalonId = null;
            let role = 'staff';

            const { data: salonOwner } = await supabase.from('salons').select('id').eq('dono_id', user.id).single();
            if (salonOwner) {
                currentSalonId = salonOwner.id;
                role = 'owner';
            } else {
                const { data: staffRecord } = await supabase
                    .from('salon_staff')
                    .select('id, salon_id, role')
                    .eq('user_id', user.id)
                    .eq('status', 'ativo')
                    .single();

                if (staffRecord) {
                    currentSalonId = staffRecord.salon_id;
                    role = staffRecord.role === 'gerente' ? 'owner' : 'staff';
                    setMyEmployeeId(staffRecord.id);
                }
                else { Alert.alert("Erro", "Não foi possível identificar o salão."); router.back(); return; }
            }

            setSalonId(currentSalonId);
            setUserRole(role as 'owner' | 'staff');

            if (role === 'owner' && currentSalonId) {
                const { data: team } = await supabase
                    .from('salon_staff')
                    .select(`id, profiles (nome, full_name)`)
                    .eq('salon_id', currentSalonId)
                    .eq('status', 'ativo');

                if (team) {
                    const formattedTeam = team.map((emp: any) => ({
                        id: emp.id,
                        nome: emp.profiles?.nome || emp.profiles?.full_name || 'Equipa'
                    }));
                    setSalonEmployees(formattedTeam);
                }
            }
        } catch (error) { console.error(error); }
    }

    async function checkPendingDirections() {
        if (!salonId) return;
        const start = new Date(currentDate); start.setHours(0, 0, 0, 0);
        const end = new Date(currentDate); end.setHours(23, 59, 59, 999);

        const { count: prevCount } = await supabase.from('appointments').select('id', { count: 'exact', head: true })
            .eq('salon_id', salonId).eq('status', 'pendente').lt('data_hora', start.toISOString());

        const { count: nextCount } = await supabase.from('appointments').select('id', { count: 'exact', head: true })
            .eq('salon_id', salonId).eq('status', 'pendente').gt('data_hora', end.toISOString());

        setHasPrevPending((prevCount || 0) > 0);
        setHasNextPending((nextCount || 0) > 0);
    }

    function setupRealtime() {
        if (!salonId) return;
        const channel = supabase
            .channel('agenda-updates')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter: `salon_id=eq.${salonId}` },
                () => {
                    fetchAppointments(true);
                    fetchPendingCount();
                    checkPendingDirections();
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

    // 2. FUNÇÃO DE AGRUPAMENTO DE HORÁRIOS MÚLTIPLOS (MAGIA!)
    async function fetchAppointments(isBackground = false) {
        if (!salonId) return;
        if (!isBackground) { setLoading(true); setAppointments([]); }

        // Adicionámos "created_at" na query!
        let query = supabase.from('appointments').select(`
            id, cliente_nome, data_hora, created_at, status, notas, 
            services (nome, preco), 
            salon_staff (
                profiles (nome, full_name)
            )
        `).eq('salon_id', salonId).order('data_hora', { ascending: true });

        const start = new Date(currentDate); start.setHours(0, 0, 0, 0);
        const end = new Date(currentDate); end.setHours(23, 59, 59, 999);
        query = query.gte('data_hora', start.toISOString()).lte('data_hora', end.toISOString());

        const currentFilter = filterRef.current;
        if (currentFilter === 'agenda') { query = query.not('status', 'in', '("cancelado","cancelado_cliente","cancelado_salao")'); }
        else if (currentFilter === 'cancelado') { query = query.in('status', ['cancelado', 'cancelado_cliente', 'cancelado_salao']); }
        else { query = query.eq('status', currentFilter); }

        if (userRole === 'staff' && myEmployeeId) {
            query = query.eq('employee_id', myEmployeeId);
        } else if (userRole === 'owner' && selectedEmployeeFilter !== 'all') {
            query = query.eq('employee_id', selectedEmployeeFilter);
        }

        const { data } = await query;
        if (data) {
            const groupedMap = new Map<string, any>();

            data.forEach((appt: any) => {
                // Usa o created_at (cortando os ms) para agrupar as compras conjuntas
                const groupKey = appt.created_at ? appt.created_at.substring(0, 19) : `${appt.cliente_nome}_${appt.data_hora}`;

                if (!groupedMap.has(groupKey)) {
                    groupedMap.set(groupKey, {
                        id: groupKey,
                        apptIds: [],
                        cliente_nome: appt.cliente_nome,
                        data_hora: appt.data_hora, // Vai ficar a hora de início
                        status: appt.status,
                        services: [],
                        totalPrice: 0,
                        salon_staff: appt.salon_staff,
                        notas: appt.notas
                    });
                }

                const group = groupedMap.get(groupKey);
                
                // Acumula ID original
                group.apptIds.push(appt.id);
                
                // Acumula serviço e preço
                const srv = Array.isArray(appt.services) ? appt.services[0] : appt.services;
                if (srv) {
                    group.services.push({ nome: srv.nome, preco: srv.preco });
                    group.totalPrice += (srv.preco || 0);
                }

                // Ajusta a hora para a mais antiga do bloco (início do serviço)
                if (new Date(appt.data_hora) < new Date(group.data_hora)) {
                    group.data_hora = appt.data_hora;
                }

                // Junta as notas se houver
                if (appt.notas && !group.notas) group.notas = appt.notas;
                else if (appt.notas && group.notas && !group.notas.includes(appt.notas)) group.notas += `\n${appt.notas}`;

                // Status
                if (appt.status === 'pendente') group.status = 'pendente';
                else if (group.status !== 'pendente' && appt.status === 'confirmado') group.status = 'confirmado';
            });

            // Converte de volta para Array e ordena cronologicamente
            const groupedArray = Array.from(groupedMap.values());
            groupedArray.sort((a, b) => new Date(a.data_hora).getTime() - new Date(b.data_hora).getTime());

            setAppointments(groupedArray as Appointment[]);
        }
        if (!isBackground) setLoading(false);
    }

    // 3. ATUALIZAÇÕES EM BLOCO
    async function updateStatus(apptIds: number[], newStatus: string) {
        if (newStatus === 'faltou') {
            Alert.alert("Marcar Falta", "O cliente não compareceu?", [
                { text: "Cancelar", style: "cancel" }, 
                { text: "Sim, Faltou", style: 'destructive', onPress: async () => { await executeUpdate(apptIds, newStatus); } }
            ]);
        } else { await executeUpdate(apptIds, newStatus); }
    }

    async function executeUpdate(apptIds: number[], newStatus: string) {
        setAppointments(prevList => {
            if (filter !== 'agenda' && filter !== newStatus) { 
                return prevList.filter(item => !item.apptIds.includes(apptIds[0])); 
            }
            return prevList.map(item => item.apptIds.includes(apptIds[0]) ? { ...item, status: newStatus } : item);
        });
        
        // O Supabase atualiza todos os IDs que estão neste Array com um único comando .in() !
        const { error } = await supabase.from('appointments').update({ status: newStatus }).in('id', apptIds);
        
        if (!error) { 
            notifyClient(apptIds[0], newStatus); // Manda só 1 notificação usando o primeiro ID
            fetchAppointments(true); 
        } else { 
            Alert.alert("Erro", "Não foi possível atualizar."); 
            fetchAppointments(true); 
        }
    }

    async function notifyClient(id: number, newStatus: string) {
        const { data: appointment } = await supabase.from('appointments').select('cliente_id').eq('id', id).single();
        if (appointment?.cliente_id) {
            let msg = `O estado do seu agendamento mudou para: ${newStatus}.`;
            if (newStatus === 'confirmado') msg = `O seu agendamento foi confirmado!`;
            if (newStatus === 'cancelado_salao') msg = `O seu agendamento foi infelizmente cancelado pelo salão.`;
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

    return (
        <View style={{ flex: 1, backgroundColor: BG_COLOR }}>
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

            <View style={[styles.headerContainer, { paddingTop: insets.top }]}>
                <View style={styles.topBar}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
                        <Ionicons name="arrow-back" size={24} color={THEME_COLOR} />
                    </TouchableOpacity>
                    <Text style={styles.pageTitle}>Agenda</Text>
                    <TouchableOpacity onPress={() => { setTempDate(currentDate); setShowDatePicker(true); }} style={styles.iconButton}>
                        <Ionicons name="calendar" size={20} color={THEME_COLOR} />
                    </TouchableOpacity>
                </View>

                <View style={styles.dateSelector}>
                    <TouchableOpacity onPress={() => changeDate(-1)} style={styles.navArrow}>
                        <Ionicons name="chevron-back" size={18} color="#666" />
                        {hasPrevPending && <View style={styles.arrowDot} />}
                    </TouchableOpacity>
                    <View style={styles.dateDisplay}>
                        <Text style={styles.dateWeek}>{currentDate.toLocaleDateString('pt-PT', { weekday: 'long' })}</Text>
                        <Text style={styles.dateDay}>{currentDate.toLocaleDateString('pt-PT', { day: 'numeric', month: 'long' })}</Text>
                    </View>
                    <TouchableOpacity onPress={() => changeDate(1)} style={styles.navArrow}>
                        <Ionicons name="chevron-forward" size={18} color="#666" />
                        {hasNextPending && <View style={styles.arrowDot} />}
                    </TouchableOpacity>
                </View>

                <View style={styles.filterRow}>
                    {[
                        { id: 'agenda', label: 'Agenda' },
                        { id: 'pendente', label: 'Pendentes' },
                        { id: 'cancelado', label: 'Cancelados' }
                    ].map(f => (
                        <TouchableOpacity
                            key={f.id} onPress={() => setFilter(f.id as any)}
                            style={[styles.chip, filter === f.id && styles.chipActive]}
                        >
                            <Text style={[styles.chipText, filter === f.id && styles.chipTextActive]}>{f.label}</Text>
                            {f.id === 'pendente' && pendingCount > 0 && <View style={styles.notificationDot} />}
                        </TouchableOpacity>
                    ))}
                </View>

                {userRole === 'owner' && salonEmployees.length > 0 && (
                    <View style={{ paddingHorizontal: 20, marginTop: 15 }}>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                            <TouchableOpacity onPress={() => setSelectedEmployeeFilter('all')} style={[styles.chip, selectedEmployeeFilter === 'all' && styles.chipActive]}>
                                <Text style={[styles.chipText, selectedEmployeeFilter === 'all' && styles.chipTextActive]}>Toda a Equipa</Text>
                            </TouchableOpacity>
                            {salonEmployees.map(emp => (
                                <TouchableOpacity key={emp.id} onPress={() => setSelectedEmployeeFilter(emp.id)} style={[styles.chip, selectedEmployeeFilter === emp.id && styles.chipActive]}>
                                    <Text style={[styles.chipText, selectedEmployeeFilter === emp.id && styles.chipTextActive]}>{emp.nome.split(' ')[0]}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                )}
            </View>

            <FlatList
                data={appointments}
                keyExtractor={(item) => item.id}
                style={{ flex: 1 }}
                contentContainerStyle={{ flexGrow: 1, paddingBottom: 100 + insets.bottom, paddingHorizontal: 20, paddingTop: 20 }}
                refreshControl={<RefreshControl refreshing={loading} onRefresh={() => fetchAppointments(false)} colors={[THEME_COLOR]} tintColor={THEME_COLOR} />}
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
                    const statusConfig = getStatusConfig(item.status);
                    const isLast = index === appointments.length - 1;
                    const dateObj = new Date(item.data_hora);
                    const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    
                    // Constrói o texto do serviço ex: "Corte + Aparar Barba"
                    const joinedServices = item.services.map(s => s.nome).join(' + ');
                    const staffName = item.salon_staff?.profiles?.nome || item.salon_staff?.profiles?.full_name;

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
                                        <View style={{ flex: 1, paddingRight: 10 }}>
                                            <Text style={styles.clientName} numberOfLines={1}>{item.cliente_nome}</Text>
                                            {/* Serviços e Equipas */}
                                            <Text style={styles.serviceName} numberOfLines={2}>
                                                {joinedServices} {staffName ? ` • c/ ${staffName.split(' ')[0]}` : ''}
                                            </Text>
                                        </View>
                                        <View style={[styles.statusBadge, { backgroundColor: statusConfig.bg }]}>
                                            <Text style={[styles.statusText, { color: statusConfig.color }]}>{statusConfig.label}</Text>
                                        </View>
                                    </View>

                                    <View style={styles.cardFooter}>
                                        <Text style={styles.priceText}>{item.totalPrice?.toFixed(2)}€</Text>
                                        {item.notas && (
                                            <TouchableOpacity onPress={() => Alert.alert("Nota", item.notas)} style={{ flexDirection: 'row', alignItems: 'center' }}>
                                                <Ionicons name="document-text-outline" size={14} color="#FF9800" />
                                                <Text style={{ fontSize: 11, color: '#FF9800', marginLeft: 2, fontWeight: '700' }}>Ver Nota</Text>
                                            </TouchableOpacity>
                                        )}
                                    </View>

                                    {item.status === 'pendente' && (
                                        <View style={styles.actionsRow}>
                                            <TouchableOpacity onPress={() => updateStatus(item.apptIds, 'cancelado_salao')} style={[styles.actionBtn, { borderColor: '#FFEBEE', backgroundColor: '#FFF' }]}>
                                                <Text style={{ color: '#D32F2F', fontSize: 12, fontWeight: '600' }}>Rejeitar</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity onPress={() => updateStatus(item.apptIds, 'confirmado')} style={[styles.actionBtn, { backgroundColor: '#1A1A1A' }]}>
                                                <Text style={{ color: 'white', fontSize: 12, fontWeight: '600' }}>Confirmar</Text>
                                            </TouchableOpacity>
                                        </View>
                                    )}

                                    {item.status === 'confirmado' && (
                                        <View style={styles.actionsRow}>
                                            <TouchableOpacity onPress={() => updateStatus(item.apptIds, 'faltou')} style={{ marginRight: 15 }}>
                                                <Text style={{ color: '#999', fontSize: 11, fontWeight: '500' }}>Marcou Falta?</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity onPress={() => updateStatus(item.apptIds, 'concluido')}>
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
    headerContainer: { backgroundColor: 'white', borderBottomLeftRadius: 24, borderBottomRightRadius: 24, paddingBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 5, zIndex: 100 },
    topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 10, marginBottom: 10 },
    pageTitle: { fontSize: 18, fontWeight: '800', color: THEME_COLOR },
    iconButton: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 5, elevation: 2 },
    dateSelector: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 15, gap: 15 },
    navArrow: { padding: 6, borderRadius: 15, backgroundColor: '#F5F5F5' },
    dateDisplay: { alignItems: 'center', minWidth: 120 },
    dateWeek: { fontSize: 11, color: '#888', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 0, lineHeight: 12 },
    dateDay: { fontSize: 16, fontWeight: '700', color: THEME_COLOR, textTransform: 'capitalize', lineHeight: 20 },
    filterRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingHorizontal: 15 },
    chip: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 20, backgroundColor: '#F5F5F5', minWidth: 70, alignItems: 'center' },
    chipActive: { backgroundColor: THEME_COLOR },
    chipText: { fontSize: 12, fontWeight: '600', color: '#666' },
    chipTextActive: { color: 'white' },
    notificationDot: { position: 'absolute', top: -2, right: -2, width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF3B30', borderWidth: 1.5, borderColor: 'white' },
    arrowDot: { position: 'absolute', top: -2, right: -2, width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF3B30', borderWidth: 1.5, borderColor: 'white' },
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
    card: { backgroundColor: 'white', borderRadius: 16, padding: 15, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
    clientName: { fontSize: 15, fontWeight: '700', color: THEME_COLOR, marginBottom: 2 },
    serviceName: { fontSize: 13, color: '#666', lineHeight: 18 },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, alignSelf: 'flex-start' },
    statusText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
    cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 5 },
    priceText: { fontSize: 14, fontWeight: '700', color: THEME_COLOR },
    actionsRow: { flexDirection: 'row', gap: 10, marginTop: 15, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F5F5F5', justifyContent: 'flex-end', alignItems: 'center' },
    actionBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: 'transparent' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center' },
    modalContent: { backgroundColor: 'white', margin: 20, borderRadius: 16, padding: 20 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
});