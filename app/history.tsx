import { Ionicons } from '@expo/vector-icons';
import * as Calendar from 'expo-calendar';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Platform,
    RefreshControl,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../supabase';

type Appointment = {
    id: number;
    data_hora: string;
    status: string;
    services: { 
        nome: string; 
        preco: number; 
    };
    salons: { 
        nome_salao: string; 
        morada: string; 
        cidade: string;
        intervalo_minutos: number;
    };
};

export default function HistoryScreen() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    
    // --- NOVO ESTADO PARA AS ABAS ---
    const [activeTab, setActiveTab] = useState<'upcoming' | 'history'>('upcoming');

    useEffect(() => {
        fetchHistory();
    }, []);

    async function fetchHistory() {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
            setLoading(false);
            return;
        }

        const { data, error } = await supabase
            .from('appointments')
            .select(`
                id, 
                data_hora, 
                status, 
                services (nome, preco), 
                salons (nome_salao, morada, cidade, intervalo_minutos)
            `)
            .eq('cliente_id', user.id)
            .order('data_hora', { ascending: false });

        if (error) {
            console.error(error);
        } else if (data) {
            const formattedData = data.map((item: any) => ({
                ...item,
                services: Array.isArray(item.services) ? item.services[0] : item.services,
                salons: Array.isArray(item.salons) ? item.salons[0] : item.salons,
            }));
            setAppointments(formattedData);
        }
        setLoading(false);
    }

    async function addToCalendar(item: Appointment) {
        try {
            const { status } = await Calendar.requestCalendarPermissionsAsync();
            if (status !== 'granted') {
                return Alert.alert('Permissão necessária', 'Precisamos de acesso ao calendário para guardar a marcação.');
            }

            const startDate = new Date(item.data_hora);
            const endDate = new Date(item.data_hora);
            const duration = item.salons?.intervalo_minutos || 30; 
            endDate.setMinutes(endDate.getMinutes() + duration);

            let calendarId;
            if (Platform.OS === 'ios') {
                const defaultCalendar = await Calendar.getDefaultCalendarAsync();
                calendarId = defaultCalendar.id;
            } else {
                const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
                const primaryCalendar = calendars.find(c => c.accessLevel === Calendar.CalendarAccessLevel.OWNER || c.isPrimary);
                calendarId = primaryCalendar ? primaryCalendar.id : calendars[0]?.id;
            }

            if (!calendarId) {
                return Alert.alert("Erro", "Não foi encontrado nenhum calendário no dispositivo.");
            }

            await Calendar.createEventAsync(calendarId, {
                title: `Corte em ${item.salons.nome_salao}`,
                startDate: startDate,
                endDate: endDate,
                timeZone: 'Europe/Lisbon',
                location: `${item.salons.morada}, ${item.salons.cidade}`,
                notes: `Serviço: ${item.services.nome}\nPreço: ${item.services.preco}€`,
            });

            Alert.alert("Sucesso", "Marcação adicionada ao teu calendário!");

        } catch (error: any) {
            console.log(error);
            Alert.alert("Erro", "Não foi possível adicionar ao calendário.");
        }
    }

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'confirmado': return '#4CD964';
            case 'pendente': return '#FF9500';
            case 'cancelado': return '#FF3B30';
            case 'concluido': return '#8E8E93';
            default: return '#333';
        }
    };

    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'confirmado': return 'Confirmado';
            case 'pendente': return 'Pendente';
            case 'cancelado': return 'Cancelado';
            case 'concluido': return 'Concluído';
            case 'faltou': return 'Não Compareceu';
            default: return status;
        }
    };

    // --- FILTRAGEM DE DADOS ---
    const now = new Date();
    
    const upcomingAppointments = appointments.filter(item => {
        const appDate = new Date(item.data_hora);
        // É futuro E não está cancelado/concluído
        return appDate >= now && !['cancelado', 'concluido', 'faltou'].includes(item.status);
    }).sort((a, b) => new Date(a.data_hora).getTime() - new Date(b.data_hora).getTime()); // Ordem ascendente (mais perto primeiro)

    const historyAppointments = appointments.filter(item => {
        const appDate = new Date(item.data_hora);
        // É passado OU está cancelado/concluído
        return appDate < now || ['cancelado', 'concluido', 'faltou'].includes(item.status);
    }); // Já vem ordenado descendente do fetch

    const dataToShow = activeTab === 'upcoming' ? upcomingAppointments : historyAppointments;

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color="#333" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>As Minhas Marcações</Text>
            </View>

            {/* --- SELETOR DE ABAS --- */}
            <View style={styles.tabContainer}>
                <TouchableOpacity 
                    style={[styles.tabBtn, activeTab === 'upcoming' && styles.tabBtnActive]} 
                    onPress={() => setActiveTab('upcoming')}
                >
                    <Text style={[styles.tabText, activeTab === 'upcoming' && styles.tabTextActive]}>Próximas</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                    style={[styles.tabBtn, activeTab === 'history' && styles.tabBtnActive]} 
                    onPress={() => setActiveTab('history')}
                >
                    <Text style={[styles.tabText, activeTab === 'history' && styles.tabTextActive]}>Histórico</Text>
                </TouchableOpacity>
            </View>

            {loading ? (
                <View style={styles.center}><ActivityIndicator color="#333" /></View>
            ) : (
                <FlatList
                    data={dataToShow}
                    keyExtractor={(item) => item.id.toString()}
                    contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
                    refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchHistory} />}
                    ListEmptyComponent={
                        <View style={styles.center}>
                            <View style={styles.emptyIconBg}>
                                <Ionicons name={activeTab === 'upcoming' ? "calendar" : "time"} size={40} color="#CCC" />
                            </View>
                            <Text style={styles.emptyTextTitle}>
                                {activeTab === 'upcoming' ? 'Sem agendamentos' : 'Histórico vazio'}
                            </Text>
                            <Text style={styles.emptyTextSubtitle}>
                                {activeTab === 'upcoming' 
                                    ? 'As tuas próximas marcações aparecerão aqui.' 
                                    : 'Ainda não tens marcações antigas.'}
                            </Text>
                        </View>
                    }
                    renderItem={({ item }) => (
                        <View style={styles.card}>
                            <View style={styles.cardHeader}>
                                <View style={{flex: 1}}>
                                    <Text style={styles.salonName}>{item.salons?.nome_salao}</Text>
                                    <Text style={styles.serviceName}>{item.services?.nome}</Text>
                                </View>
                                
                                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '15' }]}>
                                    <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
                                        {getStatusLabel(item.status)}
                                    </Text>
                                </View>
                            </View>

                            <View style={styles.divider} />
                            
                            <View style={styles.cardFooter}>
                                <View style={styles.dateTimeContainer}>
                                    <Ionicons name="calendar-outline" size={16} color="#666" />
                                    <Text style={styles.dateText}>
                                        {new Date(item.data_hora).toLocaleDateString('pt-PT', { weekday: 'short', day: 'numeric', month: 'long' })} 
                                        {' • '} 
                                        {new Date(item.data_hora).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
                                    </Text>
                                </View>
                                <Text style={styles.priceText}>{item.services?.preco}€</Text>
                            </View>

                            {/* Botão de Calendário (Apenas se confirmado e na aba de próximas) */}
                            {item.status === 'confirmado' && activeTab === 'upcoming' && (
                                <TouchableOpacity 
                                    style={styles.calendarBtn} 
                                    onPress={() => addToCalendar(item)}
                                >
                                    <Ionicons name="notifications-outline" size={16} color="#007AFF" />
                                    <Text style={styles.calendarBtnText}>Adicionar ao Calendário</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    )}
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8F9FA' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 80 },
    
    header: { flexDirection: 'row', alignItems: 'center', padding: 20, backgroundColor: 'white', paddingBottom: 15 },
    backBtn: { marginRight: 15 },
    headerTitle: { fontSize: 22, fontWeight: '800', color: '#1A1A1A' },
    
    // --- ESTILOS DAS ABAS ---
    tabContainer: {
        flexDirection: 'row',
        backgroundColor: 'white',
        paddingHorizontal: 20,
        paddingBottom: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#F0F0F0'
    },
    tabBtn: {
        marginRight: 20,
        paddingVertical: 8,
        borderBottomWidth: 2,
        borderBottomColor: 'transparent'
    },
    tabBtnActive: {
        borderBottomColor: '#1A1A1A'
    },
    tabText: {
        fontSize: 16,
        color: '#999',
        fontWeight: '600'
    },
    tabTextActive: {
        color: '#1A1A1A',
        fontWeight: 'bold'
    },

    // --- CARD ATUALIZADO ---
    card: { 
        backgroundColor: 'white', 
        borderRadius: 16, 
        padding: 18, 
        marginBottom: 16,
        shadowColor: '#000', shadowOffset: {width:0, height:2}, shadowOpacity:0.03, shadowRadius:8, elevation:2,
        borderWidth: 1, borderColor: 'transparent'
    },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    salonName: { fontSize: 16, fontWeight: 'bold', color: '#1A1A1A', marginBottom: 2 },
    serviceName: { fontSize: 14, color: '#666', fontWeight: '500' },
    
    statusBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, marginLeft: 10 },
    statusText: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
    
    divider: { height: 1, backgroundColor: '#F5F5F5', marginVertical: 12 },

    cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    dateTimeContainer: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    dateText: { fontSize: 14, color: '#444', fontWeight: '500' },
    priceText: { fontSize: 16, fontWeight: 'bold', color: '#1A1A1A' },

    calendarBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 12,
        backgroundColor: '#F0F8FF',
        borderRadius: 12,
        marginTop: 15,
        borderWidth: 1,
        borderColor: '#E3F2FD'
    },
    calendarBtnText: {
        color: '#007AFF',
        fontWeight: '600',
        fontSize: 13
    },

    // --- ESTADOS VAZIOS ---
    emptyIconBg: {
        width: 80, height: 80, borderRadius: 40, backgroundColor: '#F0F0F0',
        justifyContent: 'center', alignItems: 'center', marginBottom: 15
    },
    emptyTextTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 5 },
    emptyTextSubtitle: { fontSize: 14, color: '#999', textAlign: 'center' }
});