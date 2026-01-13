import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar'; // <--- IMPORTANTE: Importar StatusBar
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../supabase';
import { sendNotification } from '../utils/notifications';

// @ts-ignore
import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system/legacy';

// --- TIPOS ---
type Appointment = {
    id: number;
    cliente_nome: string;
    data_hora: string;
    status: string;
    services: { nome: string; preco: number };
};

type PortfolioItem = {
    id: number;
    image_url: string;
};

type ServiceItem = {
    id: number;
    nome: string;
    preco: number;
};

type SalonDetails = {
    nome_salao: string;
    morada: string;
    cidade: string;
    hora_abertura: string;
    hora_fecho: string;
    publico: string;
};

export default function ManagerScreen() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [salonId, setSalonId] = useState<number | null>(null);
    const [salonName, setSalonName] = useState('');
    
    // Listas
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
    const [services, setServices] = useState<ServiceItem[]>([]);
    
    // Estatísticas
    const [dailyStats, setDailyStats] = useState({ count: 0, revenue: 0 });

    // Edição
    const [salonDetails, setSalonDetails] = useState<SalonDetails>({
        nome_salao: '', morada: '', cidade: '', hora_abertura: '', hora_fecho: '', publico: 'Unissexo'
    });

    // Inputs Serviço
    const [newServiceName, setNewServiceName] = useState('');
    const [newServicePrice, setNewServicePrice] = useState('');
    const [addingService, setAddingService] = useState(false);

    // Filtros
    const [filter, setFilter] = useState<'agenda' | 'pendente' | 'cancelado'>('agenda');
    
    // Datas
    const [currentDate, setCurrentDate] = useState(new Date()); 
    const [tempDate, setTempDate] = useState(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);

    const [activeTab, setActiveTab] = useState<'agenda' | 'galeria' | 'servicos' | 'definicoes'>('agenda');
    const [uploading, setUploading] = useState(false);
    const [selectedImage, setSelectedImage] = useState<string | null>(null);

    useEffect(() => {
        checkManager();
    }, []);

    useEffect(() => {
        if (salonId) {
            if (activeTab === 'agenda') {
                fetchAppointments();
                fetchDailyStats();
            }
            if (activeTab === 'galeria') fetchPortfolio();
            if (activeTab === 'servicos') fetchServices();
            if (activeTab === 'definicoes') fetchSalonSettings();
        }
    }, [salonId, filter, activeTab, currentDate]);

    async function checkManager() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return router.replace('/login');

        const { data: salon } = await supabase
            .from('salons')
            .select('*')
            .eq('dono_id', user.id)
            .single();

        if (!salon) {
            Alert.alert("Acesso Negado", "Não tens um salão associado.");
            router.replace('/');
        } else {
            setSalonId(salon.id);
            setSalonName(salon.nome_salao);
            setLoading(false);
        }
    }

    // ==========================================
    // LÓGICA DE NEGÓCIO
    // ==========================================
    
    async function fetchDailyStats() {
        if (!salonId) return;
        
        const start = new Date(currentDate); start.setHours(0,0,0,0);
        const end = new Date(currentDate); end.setHours(23,59,59,999);

        const { data } = await supabase
            .from('appointments')
            .select(`status, services (preco)`)
            .eq('salon_id', salonId)
            .gte('data_hora', start.toISOString())
            .lte('data_hora', end.toISOString())
            .neq('status', 'cancelado')
            .neq('status', 'pendente');

        if (data) {
            const count = data.length;
            const revenue = data.reduce((total, item: any) => {
                if (item.status === 'faltou') return total; 

                const preco = Array.isArray(item.services) 
                    ? item.services[0]?.preco 
                    : item.services?.preco;
                return total + (preco || 0);
            }, 0);
            setDailyStats({ count, revenue });
        }
    }

    async function fetchAppointments() {
        if (!salonId) return;
        setLoading(true);

        let query = supabase
            .from('appointments')
            .select(`id, cliente_nome, data_hora, status, services (nome, preco)`)
            .eq('salon_id', salonId)
            .order('data_hora', { ascending: true });

        const start = new Date(currentDate); start.setHours(0,0,0,0);
        const end = new Date(currentDate); end.setHours(23,59,59,999);

        query = query
            .gte('data_hora', start.toISOString())
            .lte('data_hora', end.toISOString());

        if (filter === 'agenda') {
            query = query.neq('status', 'cancelado');
        } else {
            query = query.eq('status', filter);
        }

        const { data } = await query;
        
        if (data) {
            const normalizedData = data.map((item: any) => ({
                ...item,
                services: Array.isArray(item.services) ? item.services[0] : item.services
            }));
            setAppointments(normalizedData);
        }
        setLoading(false);
    }

    function changeDate(days: number) {
        const newDate = new Date(currentDate);
        newDate.setDate(newDate.getDate() + days);
        setCurrentDate(newDate);
    }

    const openDatePicker = () => {
        setTempDate(currentDate);
        setShowDatePicker(true);
    };

    const onChangeDate = (event: any, selectedDate?: Date) => {
        if (Platform.OS === 'android') {
            setShowDatePicker(false);
            if (selectedDate && event.type !== 'dismissed') {
                setCurrentDate(selectedDate);
            }
        } else {
            if (selectedDate) setTempDate(selectedDate);
        }
    };

    const confirmIOSDate = () => {
        setCurrentDate(tempDate);
        setShowDatePicker(false);
    };

    async function updateStatus(id: number, newStatus: string) {
        if (newStatus === 'faltou') {
            Alert.alert(
                "Marcar Falta",
                "O cliente não compareceu? Isto irá remover o valor da faturação prevista.",
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
        const { error } = await supabase.from('appointments').update({ status: newStatus }).eq('id', id);
        
        if (!error) {
            const { data: appointment } = await supabase
                .from('appointments')
                .select('cliente_id, services(nome), data_hora, salons(nome_salao)')
                .eq('id', id)
                .single();

            if (appointment && appointment.cliente_id) {
                const serviceData = appointment.services as any;
                const serviceName = Array.isArray(serviceData) ? serviceData[0]?.nome : serviceData?.nome;
                
                const salonData = appointment.salons as any;
                const salonName = Array.isArray(salonData) ? salonData[0]?.nome_salao : salonData?.nome_salao || 'o salão';

                let titulo = "Atualização de Agendamento";
                let msg = `O estado do seu agendamento mudou para: ${newStatus}.`;
                
                const dataObj = new Date(appointment.data_hora);
                const dataFormatada = dataObj.toLocaleDateString('pt-PT');
                const horaFormatada = dataObj.toLocaleTimeString('pt-PT', {hour: '2-digit', minute: '2-digit'});

                if (newStatus === 'confirmado') {
                    titulo = "Agendamento Confirmado";
                    msg = `O seu agendamento de ${serviceName} no ${salonName} foi confirmado para o dia ${dataFormatada} às ${horaFormatada}.`;
                } else if (newStatus === 'cancelado') {
                    titulo = "Agendamento Cancelado";
                    msg = `O seu agendamento de ${serviceName} no ${salonName} agendado para ${dataFormatada} às ${horaFormatada} foi cancelado.`;
                } else if (newStatus === 'concluido') {
                    titulo = "Serviço Concluído";
                    msg = `O serviço de ${serviceName} no ${salonName} foi marcado como concluído. Agradecemos a sua preferência.`;
                }

                await sendNotification(appointment.cliente_id, titulo, msg);
            }
            fetchAppointments(); 
            fetchDailyStats(); 
        }
    }

    async function fetchPortfolio() {
        if (!salonId) return;
        setLoading(true);
        const { data } = await supabase.from('portfolio_images').select('*').eq('salon_id', salonId).order('created_at', { ascending: false });
        if (data) setPortfolio(data);
        setLoading(false);
    }

    async function pickAndUploadImage() {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true, aspect: [4, 4], quality: 0.5, base64: true,
        });
        if (!result.canceled) { uploadToSupabase(result.assets[0].uri); }
    }

    async function uploadToSupabase(uri: string) {
        if (!salonId) return;
        setUploading(true);
        try {
            const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
            const fileName = `${salonId}_${Date.now()}.jpg`;
            const { error: uploadError } = await supabase.storage.from('portfolio').upload(fileName, decode(base64), { contentType: 'image/jpeg', upsert: true });
            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage.from('portfolio').getPublicUrl(fileName);
            await supabase.from('portfolio_images').insert({ salon_id: salonId, image_url: publicUrl });
            Alert.alert("Sucesso", "Foto adicionada!");
            fetchPortfolio();
        } catch (error) {
            Alert.alert("Erro", "Falha ao enviar a imagem.");
        } finally {
            setUploading(false);
        }
    }

    async function deleteImage(imageId: number) {
        Alert.alert("Apagar", "Remover esta foto?", [{ text: "Sim", onPress: async () => { await supabase.from('portfolio_images').delete().eq('id', imageId); fetchPortfolio(); } }, { text: "Não" }]);
    }

    async function fetchServices() {
        if (!salonId) return;
        setLoading(true);
        const { data } = await supabase.from('services').select('*').eq('salon_id', salonId).order('nome', { ascending: true });
        if (data) setServices(data);
        setLoading(false);
    }

    async function addService() {
        if (!newServiceName.trim() || !newServicePrice.trim()) return Alert.alert("Erro", "Preencha o nome e o preço.");
        setAddingService(true);
        const { error } = await supabase.from('services').insert({ salon_id: salonId, nome: newServiceName, preco: parseFloat(newServicePrice), duracao: 30 });
        if (error) { Alert.alert("Erro", "Falha ao criar serviço."); } 
        else { setNewServiceName(''); setNewServicePrice(''); fetchServices(); }
        setAddingService(false);
    }

    async function deleteService(id: number) {
        Alert.alert("Apagar", "Remover este serviço?", [{ text: "Sim", onPress: async () => { await supabase.from('services').delete().eq('id', id); fetchServices(); } }, { text: "Não" }]);
    }

    async function fetchSalonSettings() {
        if (!salonId) return;
        setLoading(true);
        const { data } = await supabase.from('salons').select('*').eq('id', salonId).single();
        if (data) {
            setSalonDetails({
                nome_salao: data.nome_salao, 
                morada: data.morada, 
                cidade: data.cidade,
                hora_abertura: data.hora_abertura || '09:00', 
                hora_fecho: data.hora_fecho || '19:00',
                publico: data.publico || 'Unissexo'
            });
        }
        setLoading(false);
    }

    async function saveSettings() {
        if (!salonId) return;
        setLoading(true);
        const { error } = await supabase.from('salons').update(salonDetails).eq('id', salonId);
        if (!error) { Alert.alert("Sucesso", "Definições atualizadas!"); setSalonName(salonDetails.nome_salao); } 
        else { Alert.alert("Erro", "Falha ao guardar."); }
        setLoading(false);
    }

    // --- UTILS: Configuração dos Badges ---
    function getBadgeConfig(status: string) {
        switch (status) {
            case 'confirmado': 
                return { bg: '#E8F5E9', color: '#2E7D32', icon: 'checkmark-circle', label: 'CONFIRMADO' };
            case 'pendente': 
                return { bg: '#FFF3E0', color: '#EF6C00', icon: 'time', label: 'PENDENTE' };
            case 'cancelado': 
                return { bg: '#FFEBEE', color: '#D32F2F', icon: 'close-circle', label: 'CANCELADO' };
            case 'concluido': 
                return { bg: '#F5F5F5', color: '#333', icon: 'checkbox', label: 'CONCLUÍDO' };
            case 'faltou': 
                return { bg: '#FFEBEE', color: '#D32F2F', icon: 'warning', label: 'FALTOU' };
            default: 
                return { bg: '#F5F5F5', color: '#999', icon: 'help-circle', label: status.toUpperCase() };
        }
    }

    function getStatusColor(status: string) {
        switch (status) {
            case 'confirmado': return '#4CD964';
            case 'cancelado': return '#FF3B30';
            case 'pendente': return '#FF9500';
            case 'concluido': return '#1A1A1A';
            case 'faltou': return '#8E8E93';
            default: return '#C7C7CC';
        }
    }

    if (loading && !salonName) return <View style={styles.center}><ActivityIndicator size="large" color="#007AFF" /></View>;

    return (
        // [ALTERAÇÃO]: backgroundColor agora é 'white' para o topo ficar branco
        <SafeAreaView style={{flex: 1, backgroundColor: 'white'}}>
            
            {/* [ALTERAÇÃO]: Forçar ícones/texto da barra de topo a ficarem escuros */}
            <StatusBar style="dark" />

            {/* [ALTERAÇÃO]: O backgroundColor='#F8F9FA' passa para aqui para manter o corpo cinza */}
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{flex:1, backgroundColor: '#F8F9FA'}}>
                
                {/* --- HEADER --- */}
                <View style={styles.header}>
                    <View>
                        <Text style={styles.headerSubtitle}>Painel de Controlo</Text>
                        <Text style={styles.headerTitle}>{salonName}</Text>
                    </View>
                    <TouchableOpacity onPress={() => router.replace('/(tabs)/profile')} style={styles.avatarContainer}>
                        <Ionicons name="person" size={24} color="#555" />
                    </TouchableOpacity>
                </View>

                {/* --- CONTAINER DE NAVEGAÇÃO PRINCIPAL (ABAS) --- */}
                <View style={styles.menuContainer}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.menuScroll}>
                        {[
                           { id: 'agenda', icon: 'calendar', label: 'Agenda' },
                           { id: 'galeria', icon: 'images', label: 'Galeria' },
                           { id: 'servicos', icon: 'cut', label: 'Serviços' },
                           { id: 'definicoes', icon: 'settings', label: 'Definições' }
                        ].map((tab) => (
                            <TouchableOpacity 
                                key={tab.id}
                                onPress={() => setActiveTab(tab.id as any)} 
                                style={[styles.menuItem, activeTab === tab.id && styles.menuItemActive]}
                            >
                                <Ionicons name={tab.icon as any} size={18} color={activeTab === tab.id ? '#FFF' : '#666'} />
                                <Text style={[styles.menuText, activeTab === tab.id && styles.menuTextActive]}>{tab.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>

                {/* --- CONTEÚDO DA ABA SELECIONADA --- */}
                
                {/* 1. ABA AGENDA */}
                {activeTab === 'agenda' && (
                    <>
                        {/* STATS */}
                        <View style={styles.statsSummary}>
                            <View style={styles.statItem}>
                                <Text style={styles.statLabel}>Clientes (Dia)</Text>
                                <Text style={styles.statNumber}>{dailyStats.count}</Text>
                            </View>
                            <View style={styles.verticalDivider} />
                            <View style={styles.statItem}>
                                <Text style={styles.statLabel}>Faturação (Dia)</Text>
                                <Text style={[styles.statNumber, {color: '#4CD964'}]}>{dailyStats.revenue.toFixed(2)}€</Text>
                            </View>
                        </View>

                        {/* FILTROS */}
                        <View style={styles.filterContainer}>
                            {[
                                {id: 'agenda', label: 'Agenda'},
                                {id: 'pendente', label: 'Pendentes'},
                                {id: 'cancelado', label: 'Cancelados'}
                            ].map(f => (
                                <TouchableOpacity 
                                    key={f.id} 
                                    onPress={() => setFilter(f.id as any)} 
                                    style={[styles.filterTab, filter===f.id && styles.filterTabActive]}
                                >
                                    <Text style={[styles.filterTabText, filter===f.id && {color: 'white'}]}>{f.label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* SELETOR DE DATA */}
                        <View style={styles.dateControl}>
                            <TouchableOpacity onPress={() => changeDate(-1)} style={styles.arrowBtn}>
                                <Ionicons name="chevron-back" size={20} color="#333" />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={openDatePicker} style={styles.dateDisplay}>
                                <Ionicons name="calendar-outline" size={16} color="#666" />
                                <View>
                                    <Text style={styles.dateLabelSmall}>A visualizar</Text>
                                    <Text style={styles.dateText}>
                                        {currentDate.toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' })}
                                    </Text>
                                </View>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => changeDate(1)} style={styles.arrowBtn}>
                                <Ionicons name="chevron-forward" size={20} color="#333" />
                            </TouchableOpacity>
                        </View>

                        {/* DATE PICKER MODAL */}
                        {showDatePicker && (
                            Platform.OS === 'ios' ? (
                                <Modal visible={showDatePicker} transparent animationType="fade">
                                    <View style={styles.modalOverlay}>
                                        <View style={styles.modalContent}>
                                            <View style={styles.modalHeader}>
                                                <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                                                    <Text style={{color: '#666'}}>Cancelar</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity onPress={confirmIOSDate}>
                                                    <Text style={{color: '#007AFF', fontWeight: 'bold'}}>Confirmar</Text>
                                                </TouchableOpacity>
                                            </View>
                                            <DateTimePicker value={tempDate} mode="date" display="spinner" onChange={onChangeDate} style={{height: 200}} />
                                        </View>
                                    </View>
                                </Modal>
                            ) : (
                                <DateTimePicker value={currentDate} mode="date" display="default" onChange={onChangeDate} />
                            )
                        )}

                        {/* TIMELINE LIST */}
                        <FlatList
                            data={appointments}
                            keyExtractor={(item) => item.id.toString()}
                            contentContainerStyle={{ paddingBottom: 100, paddingTop: 10 }}
                            refreshControl={<RefreshControl refreshing={loading} onRefresh={() => { fetchAppointments(); fetchDailyStats(); }} />}
                            ListEmptyComponent={
                                <View style={styles.emptyContainer}>
                                    <Ionicons name="calendar-clear-outline" size={64} color="#E0E0E0" />
                                    <Text style={styles.emptyText}>
                                        {filter === 'cancelado' 
                                            ? 'Nenhum cancelamento nesta data.' 
                                            : 'Sem agendamentos nesta data.'}
                                    </Text>
                                </View>
                            }
                            renderItem={({ item, index }) => {
                                const statusColor = getStatusColor(item.status);
                                const isLast = index === appointments.length - 1;
                                const badge = getBadgeConfig(item.status); 
                                
                                return (
                                    <View style={styles.timelineRow}>
                                        <View style={styles.timeColumn}>
                                            <Text style={styles.timeText}>
                                                {new Date(item.data_hora).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                                            </Text>
                                        </View>

                                        <View style={styles.lineColumn}>
                                            <View style={[styles.timelineDot, { backgroundColor: statusColor }]} />
                                            {!isLast && <View style={styles.timelineLine} />}
                                        </View>

                                        <View style={styles.contentColumn}>
                                            
                                            {/* CARTÃO AGORA COM FLEX COLUMN (Vertical) */}
                                            <View style={styles.timelineCard}>
                                                
                                                {/* ROW 1: HEADER (Nome + Etiqueta) */}
                                                <View style={styles.cardHeader}>
                                                    <Text style={[
                                                        styles.clientName, 
                                                        item.status === 'cancelado' && {textDecorationLine:'line-through', color:'#999'},
                                                        item.status === 'faltou' && {color: '#8E8E93'},
                                                        {flex: 1, marginRight: 8}
                                                    ]} numberOfLines={1}>{item.cliente_nome}</Text>

                                                    <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                                                        <Ionicons name={badge.icon as any} size={12} color={badge.color} />
                                                        <Text style={[styles.statusBadgeText, { color: badge.color }]}>{badge.label}</Text>
                                                    </View>
                                                </View>

                                                {/* ROW 2: CORPO (Info + Botões) */}
                                                <View style={styles.cardBody}>
                                                    <View style={styles.infoColumn}>
                                                        <Text style={styles.serviceDetail}>{item.services?.nome}</Text>
                                                        <Text style={[styles.priceTag, item.status === 'faltou' && {textDecorationLine:'line-through', color:'#BBB'}]}>
                                                            {item.services?.preco.toFixed(2)}€
                                                        </Text>
                                                    </View>

                                                    <View style={styles.actionColumn}>
                                                        {item.status === 'pendente' && (
                                                            <>
                                                                <TouchableOpacity onPress={() => updateStatus(item.id, 'confirmado')} style={[styles.miniBtn, {backgroundColor: '#E8F5E9'}]}>
                                                                    <Ionicons name="checkmark" size={18} color="#2E7D32" />
                                                                </TouchableOpacity>
                                                                <TouchableOpacity onPress={() => updateStatus(item.id, 'cancelado')} style={[styles.miniBtn, {backgroundColor: '#FFEBEE'}]}>
                                                                    <Ionicons name="close" size={18} color="#D32F2F" />
                                                                </TouchableOpacity>
                                                            </>
                                                        )}
                                                        {item.status === 'confirmado' && (
                                                            <>
                                                                <TouchableOpacity onPress={() => updateStatus(item.id, 'faltou')} style={[styles.miniBtn, {backgroundColor: '#FFF3E0'}]}>
                                                                    <Ionicons name="alert-circle-outline" size={18} color="#EF6C00" />
                                                                </TouchableOpacity>
                                                                <TouchableOpacity onPress={() => updateStatus(item.id, 'concluido')} style={[styles.miniBtn, {backgroundColor: '#212121'}]}>
                                                                    <Ionicons name="checkbox-outline" size={18} color="#FFF" />
                                                                </TouchableOpacity>
                                                            </>
                                                        )}
                                                    </View>
                                                </View>

                                            </View>
                                        </View>
                                    </View>
                                );
                            }}
                        />
                    </>
                )}

                {/* 2. ABA GALERIA (ATUALIZADO) */}
                {activeTab === 'galeria' && (
                    <View style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
                        
                        {/* Cabeçalho da Galeria com Contador */}
                        <View style={styles.galleryHeader}>
                            <View>
                                <Text style={styles.sectionTitle}>O meu Portfólio</Text>
                                <Text style={styles.gallerySubtitle}>{portfolio.length} fotografias publicadas</Text>
                            </View>
                            <TouchableOpacity 
                                style={[styles.uploadBtnCompact, uploading && styles.uploadBtnDisabled]} 
                                onPress={pickAndUploadImage} 
                                disabled={uploading}
                            >
                                {uploading ? (
                                    <ActivityIndicator color="white" size="small" />
                                ) : (
                                    <>
                                        <Ionicons name="add" size={20} color="white" />
                                        <Text style={styles.uploadBtnText}>Adicionar</Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        </View>

                        <FlatList 
                            data={portfolio} 
                            keyExtractor={(item) => item.id.toString()} 
                            numColumns={3} 
                            refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchPortfolio} />} 
                            contentContainerStyle={{ padding: 15, paddingBottom: 100 }} 
                            columnWrapperStyle={{ gap: 12 }} 
                            
                            // Estado Vazio Melhorado
                            ListEmptyComponent={
                                <View style={styles.emptyGalleryContainer}>
                                    <View style={styles.emptyIconBg}>
                                        <Ionicons name="images-outline" size={40} color="#999" />
                                    </View>
                                    <Text style={styles.emptyTitle}>Galeria Vazia</Text>
                                    <Text style={styles.galleryEmptyText}>Adiciona fotos dos teus melhores trabalhos para atrair mais clientes.</Text>
                                    <TouchableOpacity style={styles.emptyActionBtn} onPress={pickAndUploadImage}>
                                        <Text style={styles.emptyActionText}>Carregar Primeira Foto</Text>
                                    </TouchableOpacity>
                                </View>
                            } 
                            
                            renderItem={({ item }) => (
                                <View style={styles.galleryCard}>
                                    <TouchableOpacity 
                                        onPress={() => setSelectedImage(item.image_url)} 
                                        activeOpacity={0.9}
                                        style={{flex:1}}
                                    >
                                        <Image source={{ uri: item.image_url }} style={styles.galleryImage} />
                                    </TouchableOpacity>
                                    
                                    {/* Botão de Apagar Melhorado */}
                                    <TouchableOpacity 
                                        style={styles.deleteButtonCircle} 
                                        onPress={() => deleteImage(item.id)}
                                        hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
                                    >
                                        <Ionicons name="trash-outline" size={16} color="#FF3B30" />
                                    </TouchableOpacity>
                                </View>
                            )} 
                        />
                    </View>
                )}
                
                {/* 3. ABA SERVIÇOS */}
                {activeTab === 'servicos' && (
                    <View style={{flex:1}}>
                        <View style={styles.simpleForm}>
                            <Text style={styles.sectionTitle}>Novo Serviço</Text>
                            <View style={{flexDirection:'row', gap: 10}}>
                                <TextInput style={[styles.input, {flex:2}]} placeholder="Nome" value={newServiceName} onChangeText={setNewServiceName} />
                                <TextInput style={[styles.input, {flex:1}]} placeholder="Preço" keyboardType="numeric" value={newServicePrice} onChangeText={setNewServicePrice} />
                            </View>
                            <TouchableOpacity style={styles.addBtn} onPress={addService} disabled={addingService}>
                                {addingService ? <ActivityIndicator color="white"/> : <Text style={styles.addBtnText}>Adicionar</Text>}
                            </TouchableOpacity>
                        </View>
                        <FlatList 
                            data={services} 
                            keyExtractor={(item) => item.id.toString()} 
                            contentContainerStyle={{ padding: 20 }} 
                            refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchServices} />} 
                            ListEmptyComponent={<Text style={styles.emptyText}>Sem serviços.</Text>} 
                            renderItem={({ item }) => (
                                <View style={styles.serviceRow}>
                                    <View>
                                        <Text style={styles.serviceName}>{item.nome}</Text>
                                        <Text style={styles.servicePrice}>{item.preco.toFixed(2)}€</Text>
                                    </View>
                                    <TouchableOpacity onPress={() => deleteService(item.id)}><Ionicons name="trash-outline" size={20} color="#FF3B30" /></TouchableOpacity>
                                </View>
                            )} 
                        />
                    </View>
                )}
                
                {/* 4. ABA DEFINIÇÕES */}
                {activeTab === 'definicoes' && (
                    <ScrollView contentContainerStyle={{padding: 20}}>
                        <Text style={styles.sectionTitle}>Dados do Salão</Text>
                        <Text style={styles.label}>Nome</Text><TextInput style={styles.input} value={salonDetails.nome_salao} onChangeText={(t) => setSalonDetails({...salonDetails, nome_salao: t})} />
                        <Text style={styles.label}>Cidade</Text><TextInput style={styles.input} value={salonDetails.cidade} onChangeText={(t) => setSalonDetails({...salonDetails, cidade: t})} />
                        <Text style={styles.label}>Morada</Text><TextInput style={styles.input} value={salonDetails.morada} onChangeText={(t) => setSalonDetails({...salonDetails, morada: t})} />
                        <View style={{flexDirection:'row', gap:10, marginTop:10}}>
                            <View style={{flex:1}}><Text style={styles.label}>Abertura</Text><TextInput style={styles.input} value={salonDetails.hora_abertura} onChangeText={(t) => setSalonDetails({...salonDetails, hora_abertura: t})} /></View>
                            <View style={{flex:1}}><Text style={styles.label}>Fecho</Text><TextInput style={styles.input} value={salonDetails.hora_fecho} onChangeText={(t) => setSalonDetails({...salonDetails, hora_fecho: t})} /></View>
                        </View>
                        <Text style={[styles.label, {marginTop: 15}]}>Público</Text>
                        <View style={{flexDirection:'row', gap:10}}>
                            {['Homem', 'Mulher', 'Unissexo'].map((opt) => (
                                <TouchableOpacity key={opt} style={[styles.segment, salonDetails.publico === opt && styles.segmentActive]} onPress={() => setSalonDetails({...salonDetails, publico: opt})}>
                                    <Text style={[styles.segmentText, salonDetails.publico === opt && {color:'white'}]}>{opt}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        <TouchableOpacity style={styles.saveBtn} onPress={saveSettings}><Text style={styles.saveBtnText}>Guardar</Text></TouchableOpacity>
                    </ScrollView>
                )}

                {/* MODAL FULLSCREEN */}
                <Modal visible={selectedImage !== null} transparent={true} animationType="fade" onRequestClose={() => setSelectedImage(null)}>
                    <View style={styles.fullScreenContainer}>
                        <TouchableOpacity style={styles.closeButton} onPress={() => setSelectedImage(null)}><Ionicons name="close-circle" size={40} color="white" /></TouchableOpacity>
                        {selectedImage && <Image source={{ uri: selectedImage }} style={styles.fullScreenImage} resizeMode="contain"/>}
                    </View>
                </Modal>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    
    // Header
    header: { 
        paddingHorizontal: 24,
        paddingTop: Platform.OS === 'android' ? 20 : 15,
        paddingBottom: 10, 
        backgroundColor: '#FFF', 
        flexDirection: 'row', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        zIndex: 10
    },
    headerSubtitle: { fontSize: 12, color: '#999', textTransform: 'uppercase', letterSpacing: 1, fontWeight: '600', marginBottom: 2 },
    headerTitle: { fontSize: 22, fontWeight: '800', color: '#1A1A1A' },
    avatarContainer: { 
        width: 44, height: 44, 
        borderRadius: 22, 
        backgroundColor: '#F5F7FA', 
        justifyContent: 'center', alignItems: 'center',
        borderWidth: 1, borderColor: '#EEE'
    },
    
    // Menu Tabs
    menuContainer: { 
        backgroundColor: '#FFF', 
        paddingBottom: 10, 
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 4,
        zIndex: 9
    },
    menuScroll: { paddingHorizontal: 20, gap: 10 },
    menuItem: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, backgroundColor: '#F5F7FA' },
    menuItemActive: { backgroundColor: '#1A1A1A' },
    menuText: { fontSize: 14, fontWeight: '600', color: '#666' },
    menuTextActive: { color: '#FFF' },

    // Stats
    statsSummary: { flexDirection: 'row', backgroundColor: 'white', margin: 20, padding: 15, borderRadius: 12, justifyContent: 'space-around', alignItems: 'center', shadowColor:'#000', shadowOpacity:0.03, elevation: 1 },
    statItem: { alignItems: 'center' },
    statLabel: { fontSize: 11, color: '#999', textTransform: 'uppercase', marginBottom: 2 },
    statNumber: { fontSize: 18, fontWeight: 'bold', color: '#333' },
    verticalDivider: { width: 1, height: 30, backgroundColor: '#EEE' },

    // Filtros
    filterContainer: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, gap: 10, marginBottom: 15 },
    filterTab: { flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E0E0E0' },
    filterTabActive: { backgroundColor: '#333', borderColor: '#333' },
    filterTabText: { fontSize: 13, fontWeight: '600', color: '#666' },

    // Date Control
    dateControl: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: 20, marginBottom: 10, padding: 5, backgroundColor: 'white', borderRadius: 8 },
    dateDisplay: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    dateLabelSmall: { fontSize: 10, color: '#999', textTransform: 'uppercase' },
    dateText: { fontWeight: '600', textTransform: 'capitalize' },
    arrowBtn: { padding: 8 },

    // Timeline Rows
    timelineRow: { flexDirection: 'row', paddingHorizontal: 20 },
    timeColumn: { width: 50, alignItems: 'flex-end', paddingTop: 16, paddingRight: 10 },
    timeText: { fontSize: 13, fontWeight: '600', color: '#999' },
    lineColumn: { width: 20, alignItems: 'center' },
    timelineDot: { width: 10, height: 10, borderRadius: 5, marginTop: 20, zIndex: 2, borderWidth: 2, borderColor: '#F8F9FA' },
    timelineLine: { width: 2, backgroundColor: '#E0E0E0', flex: 1, position: 'absolute', top: 20, bottom: -20 },
    contentColumn: { flex: 1, paddingBottom: 15 },
    
    // Cards
    timelineCard: { 
        backgroundColor: 'white', 
        padding: 15, 
        borderRadius: 12, 
        flexDirection: 'column', 
        marginTop: 5, 
        shadowColor: '#000', shadowOpacity: 0.03, elevation: 1
    },
    
    // Header Row (Nome + Badge)
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    
    // Body Row (Info + Actions)
    cardBody: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
    infoColumn: { flex: 1 },

    clientName: { fontSize: 16, fontWeight: 'bold', color: '#333' },
    serviceDetail: { fontSize: 14, color: '#666', marginTop: 2 },
    priceTag: { fontSize: 14, fontWeight: 'bold', color: '#007AFF', marginTop: 4 },
    
    // Unified Status Badge (Normal flex, não absolute)
    statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 4 },
    statusBadgeText: { fontSize: 10, fontWeight: 'bold' },

    // Ações
    actionColumn: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    miniBtn: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },

    // Utilitários
    emptyContainer: { alignItems: 'center', marginTop: 50 },
    emptyText: { color: '#CCC', marginTop: 10 },
    
    // --- ESTILOS DA GALERIA (NOVOS/ATUALIZADOS) ---
    galleryHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 10,
    },
    gallerySubtitle: {
        fontSize: 13,
        color: '#666',
        marginTop: 2
    },
    uploadBtnCompact: {
        backgroundColor: '#1A1A1A',
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 30,
        gap: 6,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2
    },
    uploadBtnDisabled: {
        opacity: 0.7
    },
    uploadBtnText: {
        color: 'white',
        fontWeight: '600',
        fontSize: 13
    },
    
    // Cards da Galeria
    galleryCard: {
        flex: 1, 
        aspectRatio: 1, 
        borderRadius: 16, 
        backgroundColor: 'white',
        position: 'relative',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
        overflow: 'hidden',
        marginBottom: 12,
    },
    galleryImage: {
        width: '100%',
        height: '100%',
        resizeMode: 'cover',
    },
    deleteButtonCircle: {
        position: 'absolute',
        top: 8,
        right: 8,
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 3, elevation: 3
    },

    // Estado Vazio (Empty State)
    emptyGalleryContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 60,
        paddingHorizontal: 40,
    },
    emptyIconBg: {
        width: 80, height: 80, borderRadius: 40, backgroundColor: '#F0F0F0',
        justifyContent: 'center', alignItems: 'center', marginBottom: 20
    },
    emptyTitle: {
        fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 8
    },
    galleryEmptyText: { 
        textAlign: 'center', color: '#999', lineHeight: 20, marginBottom: 25
    },
    emptyActionBtn: {
        paddingVertical: 12, paddingHorizontal: 24,
        borderRadius: 12, borderWidth: 1, borderColor: '#DDD',
        backgroundColor: 'white'
    },
    emptyActionText: {
        fontWeight: '600', color: '#333'
    },

    // Form e Serviços
    simpleForm: { backgroundColor: 'white', padding: 20, marginBottom: 10 },
    input: { backgroundColor: '#F5F7FA', padding: 12, borderRadius: 8, marginBottom: 10, borderWidth:1, borderColor:'#EEE' },
    addBtn: { backgroundColor: '#333', alignItems: 'center', padding: 12, borderRadius: 8 },
    addBtnText: { color: 'white', fontWeight: 'bold' },
    
    serviceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white', padding: 15, borderRadius: 10, marginBottom: 8 },
    serviceName: { fontSize: 16, fontWeight: '600' },
    servicePrice: { color: '#007AFF', fontWeight: 'bold' },

    sectionTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 15, color: '#333' },
    label: { fontSize: 12, color: '#666', fontWeight: '600', marginBottom: 5 },
    segment: { flex: 1, padding: 10, borderRadius: 8, backgroundColor: '#EEE', alignItems: 'center' },
    segmentActive: { backgroundColor: '#333' },
    segmentText: { fontSize: 12, fontWeight: '600', color: '#666' },
    saveBtn: { backgroundColor: '#4CD964', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 20 },
    saveBtnText: { color: 'white', fontWeight: 'bold', fontSize: 16 },

    fullScreenContainer: { flex: 1, backgroundColor: 'black', justifyContent: 'center' },
    fullScreenImage: { width: '100%', height: '100%' },
    closeButton: { position: 'absolute', top: 50, right: 20, zIndex: 99 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center' },
    modalContent: { backgroundColor: 'white', width: '90%', borderRadius: 15, padding: 20, alignSelf:'center' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 }
});