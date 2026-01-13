import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
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
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
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
    position?: number;
};

type SalonDetails = {
    nome_salao: string;
    morada: string;
    cidade: string;
    hora_abertura: string;
    hora_fecho: string;
    publico: string;
    intervalo_minutos: number;
    imagem: string | null; 
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
        nome_salao: '', 
        morada: '', 
        cidade: '', 
        hora_abertura: '', 
        hora_fecho: '', 
        publico: 'Unissexo',
        intervalo_minutos: 30,
        imagem: null 
    });

    // Inputs Serviço e Estado de Edição
    const [newServiceName, setNewServiceName] = useState('');
    const [newServicePrice, setNewServicePrice] = useState('');
    const [addingService, setAddingService] = useState(false);
    const [editingService, setEditingService] = useState<ServiceItem | null>(null);
    
    // ESTADO PARA CONTROLAR A REORDENAÇÃO
    const [isReordering, setIsReordering] = useState(false);

    // Filtros
    const [filter, setFilter] = useState<'agenda' | 'pendente' | 'cancelado'>('agenda');
    
    // Datas (Agenda)
    const [currentDate, setCurrentDate] = useState(new Date()); 
    const [tempDate, setTempDate] = useState(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);

    // Relógios (Definições)
    const [activeTimePicker, setActiveTimePicker] = useState<'opening' | 'closing' | null>(null);
    const [tempTime, setTempTime] = useState(new Date());

    const [activeTab, setActiveTab] = useState<'agenda' | 'galeria' | 'servicos' | 'definicoes'>('agenda');
    const [uploading, setUploading] = useState(false);
    const [coverUploading, setCoverUploading] = useState(false); 
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

    // --- Date Picker Agenda Logic ---
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

    // --- Time Picker Logic (Definições) ---
    const openTimePicker = (type: 'opening' | 'closing') => {
        const timeStr = type === 'opening' ? salonDetails.hora_abertura : salonDetails.hora_fecho;
        const [hours, minutes] = timeStr ? timeStr.split(':').map(Number) : [9, 0];
        const d = new Date();
        d.setHours(hours || 0, minutes || 0, 0, 0);
        
        setTempTime(d);
        setActiveTimePicker(type);
    };

    const onTimeChange = (event: any, selectedDate?: Date) => {
        if (Platform.OS === 'android') {
            if (event.type === 'set' && selectedDate) {
                 const timeStr = selectedDate.toLocaleTimeString('pt-PT', {hour: '2-digit', minute: '2-digit'});
                 if (activeTimePicker === 'opening') setSalonDetails(prev => ({...prev, hora_abertura: timeStr}));
                 else if (activeTimePicker === 'closing') setSalonDetails(prev => ({...prev, hora_fecho: timeStr}));
            }
            setActiveTimePicker(null); 
        } else {
            if (selectedDate) setTempTime(selectedDate);
        }
    };

    const confirmIOSTime = () => {
        const timeStr = tempTime.toLocaleTimeString('pt-PT', {hour: '2-digit', minute: '2-digit'});
        if (activeTimePicker === 'opening') setSalonDetails(prev => ({...prev, hora_abertura: timeStr}));
        else if (activeTimePicker === 'closing') setSalonDetails(prev => ({...prev, hora_fecho: timeStr}));
        setActiveTimePicker(null);
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

    // --- IMAGEM DE CAPA (LOGIC - CORRIGIDO PARA COLUNA 'IMAGEM') ---
    async function pickCoverImage() {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [16, 9], // Formato retangular para capa
            quality: 0.7,
            base64: true,
        });

        if (!result.canceled) {
            uploadCoverToSupabase(result.assets[0].uri);
        }
    }

    async function uploadCoverToSupabase(uri: string) {
        if (!salonId) return;
        setCoverUploading(true);
        try {
            const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
            // Usa bucket 'portfolio'
            const fileName = `cover_${salonId}_${Date.now()}.jpg`;
            
            const { error: uploadError } = await supabase.storage
                .from('portfolio')
                .upload(fileName, decode(base64), { contentType: 'image/jpeg', upsert: true });

            if (uploadError) {
                 console.error("Erro Supabase Upload:", uploadError);
                 throw new Error(uploadError.message);
            }

            const { data: { publicUrl } } = supabase.storage.from('portfolio').getPublicUrl(fileName);
            
            // ATUALIZA O ESTADO NA PROPRIEDADE 'IMAGEM'
            setSalonDetails(prev => ({ ...prev, imagem: publicUrl }));
            
        } catch (error: any) {
            Alert.alert("Erro no Upload", error.message);
        } finally {
            setCoverUploading(false);
        }
    }

    // --- PORTFÓLIO LOGIC ---
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
        
        // 1. Tenta buscar ordenado por POSIÇÃO
        const { data, error } = await supabase
            .from('services')
            .select('*')
            .eq('salon_id', salonId)
            .order('position', { ascending: true });

        if (error) {
            console.log("Erro no fetch principal (pode faltar coluna position), tentando fallback...", error.message);
            // 2. Fallback: Se der erro, busca por NOME
            const { data: dataFallback } = await supabase
                .from('services')
                .select('*')
                .eq('salon_id', salonId)
                .order('nome', { ascending: true });
                
            if (dataFallback) setServices(dataFallback);
        } else {
            if (data) setServices(data);
        }
        setLoading(false);
    }

    // --- LÓGICA DE SERVIÇOS (ADICIONAR + EDITAR) ---

    function handleEditService(item: ServiceItem) {
        setEditingService(item);
        setNewServiceName(item.nome);
        setNewServicePrice(item.preco.toString());
    }

    function cancelEditService() {
        setEditingService(null);
        setNewServiceName('');
        setNewServicePrice('');
    }

    async function saveService() {
        if (!newServiceName.trim() || !newServicePrice.trim()) {
            return Alert.alert("Atenção", "Preencha o nome e o preço do serviço.");
        }

        const nameNormalized = newServiceName.trim();
        const duplicate = services.find(s => 
            s.nome.trim().toLowerCase() === nameNormalized.toLowerCase() && 
            s.id !== (editingService?.id ?? -1) 
        );

        if (duplicate) {
            return Alert.alert("Duplicado", "Já existe um serviço com este nome.");
        }

        const priceClean = newServicePrice.replace(',', '.');
        const priceValue = parseFloat(priceClean);

        if (isNaN(priceValue)) {
            return Alert.alert("Erro", "O preço inserido não é válido.");
        }

        setAddingService(true);

        if (editingService) {
            const { error } = await supabase
                .from('services')
                .update({ nome: newServiceName, preco: priceValue })
                .eq('id', editingService.id);

            if (error) {
                Alert.alert("Erro", error.message);
            } else {
                Alert.alert("Sucesso", "Serviço atualizado!");
                setEditingService(null);
                setNewServiceName('');
                setNewServicePrice('');
                fetchServices();
            }
        } else {
            const nextPosition = services.length > 0 ? services.length + 1 : 0;
            
            const payload: any = { 
                salon_id: salonId, 
                nome: newServiceName, 
                preco: priceValue
            };
            
            if (services.length > 0 && services[0].position !== undefined) {
                payload.position = nextPosition;
            }

            const { error } = await supabase.from('services').insert(payload);

            if (error) { 
                if (error.message.includes('column "position" of relation "services" does not exist')) {
                     delete payload.position;
                     const { error: retryError } = await supabase.from('services').insert(payload);
                     if (retryError) Alert.alert("Erro", retryError.message);
                     else {
                        setNewServiceName(''); setNewServicePrice(''); fetchServices(); Alert.alert("Sucesso", "Serviço adicionado!");
                     }
                } else {
                    Alert.alert("Erro no Sistema", error.message); 
                }
            } else { 
                setNewServiceName(''); 
                setNewServicePrice(''); 
                fetchServices(); 
                Alert.alert("Sucesso", "Serviço adicionado!");
            }
        }
        setAddingService(false);
    }

    async function deleteService(id: number) {
        Alert.alert(
            "Eliminar Serviço",
            "Tens a certeza que queres remover este serviço?",
            [
                { text: "Cancelar", style: "cancel" },
                { 
                    text: "Eliminar", 
                    style: 'destructive',
                    onPress: async () => { 
                        const { error } = await supabase.from('services').delete().eq('id', id);
                        if (error) {
                            console.error("Erro ao apagar:", error);
                            Alert.alert("Erro", "Não foi possível apagar: " + error.message);
                        } else {
                            fetchServices(); 
                        }
                    } 
                }
            ]
        );
    }

    const handleDragEnd = async ({ data }: { data: ServiceItem[] }) => {
        setServices(data);
        const updates = data.map((item, index) => ({ id: item.id, position: index }));
        try {
            for (const item of updates) {
                await supabase.from('services').update({ position: item.position }).eq('id', item.id);
            }
        } catch (e) {
            console.log("Erro ao reordenar");
        }
    };

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
                publico: data.publico || 'Unissexo',
                intervalo_minutos: data.intervalo_minutos || 30,
                imagem: data.imagem || null // [CORRIGIDO]: Mapeia coluna 'imagem'
            });
        }
        setLoading(false);
    }

    async function saveSettings() {
        if (!salonId) return;
        setLoading(true);
        
        // Tenta atualizar a base de dados
        // Nota: salonDetails agora tem a chave 'imagem', que corresponde à coluna 'imagem'
        const { error } = await supabase.from('salons').update(salonDetails).eq('id', salonId);

        if (!error) { 
            Alert.alert("Sucesso", "Definições atualizadas!"); 
            setSalonName(salonDetails.nome_salao); 
        } else { 
            console.error("Erro Supabase:", error);
            Alert.alert("Erro ao Guardar", error.message); 
        }
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
        <GestureHandlerRootView style={{ flex: 1 }}>
            <SafeAreaView style={{flex: 1, backgroundColor: 'white'}}>
                <StatusBar style="dark" />
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
                    
                    {/* 1. ABA AGENDA (Original) */}
                    {activeTab === 'agenda' && (
                        <>
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
                                                <View style={styles.timelineCard}>
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

                    {/* 2. ABA GALERIA (Original) */}
                    {activeTab === 'galeria' && (
                        <View style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
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
                    
                    {/* 3. ABA SERVIÇOS (Original) */}
                    {activeTab === 'servicos' && (
                        <View style={{flex: 1, backgroundColor: '#F8F9FA', width: '100%'}}>
                            
                            <View style={{ height: 20 }} /> 

                            {/* Formulário de Adição / Edição */}
                            <View style={styles.addServiceForm}>
                                <Text style={styles.formTitle}>{editingService ? 'Editar Serviço' : 'Adicionar Novo'}</Text>
                                <View style={styles.inputRow}>
                                    <View style={styles.inputWrapper}>
                                        <Ionicons name="cut-outline" size={20} color="#999" style={styles.inputIcon} />
                                        <TextInput 
                                            style={styles.inputStyled} 
                                            placeholder="Nome" 
                                            value={newServiceName} 
                                            onChangeText={setNewServiceName} 
                                            placeholderTextColor="#999"
                                        />
                                    </View>
                                    <View style={[styles.inputWrapper, {flex: 0.6}]}>
                                        <Text style={styles.currencyPrefix}>€</Text>
                                        <TextInput 
                                            style={[styles.inputStyled, {paddingLeft: 25}]} 
                                            placeholder="Preço" 
                                            keyboardType="numeric" 
                                            value={newServicePrice} 
                                            onChangeText={setNewServicePrice} 
                                            placeholderTextColor="#999"
                                        />
                                    </View>
                                </View>
                                
                                <View style={{flexDirection: 'row', gap: 10}}>
                                    {editingService && (
                                        <TouchableOpacity 
                                            style={[styles.addServiceBtn, {backgroundColor: '#EEE', flex: 1}]} 
                                            onPress={cancelEditService}
                                        >
                                            <Text style={[styles.addServiceBtnText, {color: '#666'}]}>Cancelar</Text>
                                        </TouchableOpacity>
                                    )}
                                    
                                    <TouchableOpacity 
                                        style={[styles.addServiceBtn, {flex: 2}]} 
                                        onPress={saveService} 
                                        disabled={addingService}
                                    >
                                        {addingService ? (
                                            <ActivityIndicator color="white" size="small"/>
                                        ) : (
                                            <Text style={styles.addServiceBtnText}>
                                                {editingService ? 'Guardar Alterações' : 'Adicionar Serviço'}
                                            </Text>
                                        )}
                                    </TouchableOpacity>
                                </View>
                            </View>

                            {/* CABEÇALHO DA LISTA (CONTROLO ORGANIZAR) */}
                            {services.length > 0 && (
                                <View style={styles.listControlRow}>
                                    <Text style={styles.listCountText}>{services.length} Serviços</Text>
                                    
                                    {/* Botão de Organizar */}
                                    <TouchableOpacity 
                                        style={[styles.reorderBtn, isReordering && styles.reorderBtnActive]}
                                        onPress={() => setIsReordering(!isReordering)}
                                    >
                                        <Ionicons 
                                            name={isReordering ? "checkmark" : "swap-vertical"} 
                                            size={14} 
                                            color={isReordering ? "white" : "#666"} 
                                        />
                                        <Text style={[styles.reorderBtnText, isReordering && {color:'white'}]}>
                                            {isReordering ? 'Concluir' : 'Organizar'}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            )}

                            {/* Lista Reordenável */}
                            <DraggableFlatList
                                style={{ flex: 1 }}
                                containerStyle={{ flex: 1 }} // [NOVO] Garante altura correta
                                data={services}
                                onDragEnd={handleDragEnd}
                                keyExtractor={(item) => item.id.toString()}
                                contentContainerStyle={{ padding: 20, paddingTop: 5, paddingBottom: 150 }} 
                                refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchServices} />}
                                ListEmptyComponent={
                                    <View style={styles.emptyContainer}>
                                        <View style={[styles.emptyIconBg, {backgroundColor: '#FFF5F5'}]}>
                                            <Ionicons name="cut" size={32} color="#FF3B30" />
                                        </View>
                                        <Text style={styles.emptyText}>Ainda não tens serviços.</Text>
                                    </View>
                                }
                                renderItem={({ item, drag, isActive }: RenderItemParams<ServiceItem>) => (
                                    <ScaleDecorator>
                                        <View 
                                            style={[
                                                styles.serviceCard, 
                                                isActive && { backgroundColor: '#F0F0F0', elevation: 5, shadowOpacity: 0.2 }
                                            ]}
                                        >
                                            {/* PARTE ESQUERDA (Flex 1 + Ícone + Nome com 2 linhas) */}
                                            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', marginRight: 10 }}> 
                                                
                                                {/* CONDICIONAL: Ícone de Arrastar (Só aparece se isReordering = true) */}
                                                {isReordering && (
                                                    <TouchableOpacity 
                                                        onLongPress={drag} 
                                                        delayLongPress={250} 
                                                        hitSlop={20} 
                                                        style={{marginRight: 8}}
                                                    >
                                                        <Ionicons name="reorder-two-outline" size={24} color="#333" />
                                                    </TouchableOpacity>
                                                )}
                                                
                                                {/* Nome (Permite 2 linhas e corta no fim se necessário) */}
                                                <View style={{flex:1}}>
                                                    <Text style={styles.serviceCardName} numberOfLines={2} ellipsizeMode="tail">
                                                        {item.nome}
                                                    </Text>
                                                </View>
                                            </View>
                                            
                                            {/* PARTE DIREITA (Etiqueta Preço + Ações) */}
                                            <View style={styles.serviceRight}>
                                                
                                                {/* Nova Etiqueta de Preço */}
                                                <View style={styles.priceBadge}>
                                                    <Text style={styles.priceBadgeText}>{item.preco.toFixed(2)}€</Text>
                                                </View>
                                                
                                                {/* Botões de Ação */}
                                                <View style={styles.actionButtonsContainer}>
                                                    <TouchableOpacity style={styles.actionBtn} onPress={() => handleEditService(item)}>
                                                        <Ionicons name="pencil-outline" size={18} color="#007AFF" />
                                                    </TouchableOpacity>

                                                    <TouchableOpacity style={styles.actionBtn} onPress={() => deleteService(item.id)}>
                                                        <Ionicons name="trash-outline" size={18} color="#FF3B30" />
                                                    </TouchableOpacity>
                                                </View>
                                            </View>
                                        </View>
                                    </ScaleDecorator>
                                )}
                            />
                        </View>
                    )}
                    
                    {/* 4. ABA DEFINIÇÕES (COM DESIGN MELHORADO E RELÓGIO) */}
                    {activeTab === 'definicoes' && (
                        <ScrollView 
                            contentContainerStyle={{padding: 24, paddingBottom: 100}}
                            showsVerticalScrollIndicator={false}
                        >
                            {/* Cabeçalho REMOVIDO */}

                            {/* Grupo 0: Imagem de Capa (NOVO - USA COLUNA 'IMAGEM') */}
                            <View style={styles.settingsCard}>
                                <Text style={styles.settingsSectionTitle}>Imagem de Capa</Text>
                                <TouchableOpacity onPress={pickCoverImage} style={styles.coverUploadBtn} activeOpacity={0.9} disabled={coverUploading}>
                                    {coverUploading ? (
                                        <ActivityIndicator color="#666" />
                                    ) : salonDetails.imagem ? (
                                        <>
                                            <Image source={{ uri: salonDetails.imagem }} style={styles.coverImagePreview} />
                                            <View style={styles.editIconBadge}>
                                                <Ionicons name="camera" size={16} color="white" />
                                            </View>
                                        </>
                                    ) : (
                                        <View style={styles.coverPlaceholder}>
                                            <Ionicons name="image-outline" size={40} color="#CCC" />
                                            <Text style={styles.coverPlaceholderText}>Adicionar Capa (16:9)</Text>
                                        </View>
                                    )}
                                </TouchableOpacity>
                            </View>

                            {/* Grupo 1: Informação Geral */}
                            <View style={styles.settingsCard}>
                                <Text style={styles.settingsSectionTitle}>Informação do Salão</Text>
                                
                                <View style={styles.settingsInputGroup}>
                                    <Text style={styles.settingsInputLabel}>NOME DO SALÃO</Text>
                                    <View style={styles.settingsInputContainer}>
                                        <Ionicons name="business-outline" size={20} color="#666" style={styles.settingsInputIcon} />
                                        <TextInput 
                                            style={styles.settingsInputField} 
                                            value={salonDetails.nome_salao} 
                                            onChangeText={(t) => setSalonDetails({...salonDetails, nome_salao: t})}
                                            placeholder="Ex: Barbearia Central"
                                            placeholderTextColor="#999"
                                        />
                                    </View>
                                </View>

                                <View style={styles.settingsInputGroup}>
                                    <Text style={styles.settingsInputLabel}>MORADA COMPLETA</Text>
                                    <View style={styles.settingsInputContainer}>
                                        <Ionicons name="location-outline" size={20} color="#666" style={styles.settingsInputIcon} />
                                        <TextInput 
                                            style={styles.settingsInputField} 
                                            value={salonDetails.morada} 
                                            onChangeText={(t) => setSalonDetails({...salonDetails, morada: t})}
                                            placeholder="Rua Principal, nº 123"
                                            placeholderTextColor="#999"
                                        />
                                    </View>
                                </View>

                                <View style={styles.settingsInputGroup}>
                                    <Text style={styles.settingsInputLabel}>CIDADE</Text>
                                    <View style={styles.settingsInputContainer}>
                                        <Ionicons name="map-outline" size={20} color="#666" style={styles.settingsInputIcon} />
                                        <TextInput 
                                            style={styles.settingsInputField} 
                                            value={salonDetails.cidade} 
                                            onChangeText={(t) => setSalonDetails({...salonDetails, cidade: t})}
                                            placeholder="Lisboa"
                                            placeholderTextColor="#999"
                                        />
                                    </View>
                                </View>
                            </View>

                            {/* Grupo 2: Horário e Público */}
                            <View style={styles.settingsCard}>
                                <Text style={styles.settingsSectionTitle}>Operação & Público</Text>
                                
                                <View style={{flexDirection: 'row', gap: 12}}>
                                    <View style={[styles.settingsInputGroup, {flex: 1}]}>
                                        <Text style={styles.settingsInputLabel}>ABERTURA</Text>
                                        <TouchableOpacity onPress={() => openTimePicker('opening')} style={styles.settingsInputContainer}>
                                            <Ionicons name="sunny-outline" size={20} color="#666" style={styles.settingsInputIcon} />
                                            <Text style={[styles.settingsInputField, {paddingVertical: 14}]}>{salonDetails.hora_abertura || '09:00'}</Text>
                                        </TouchableOpacity>
                                    </View>
                                    <View style={[styles.settingsInputGroup, {flex: 1}]}>
                                        <Text style={styles.settingsInputLabel}>FECHO</Text>
                                        <TouchableOpacity onPress={() => openTimePicker('closing')} style={styles.settingsInputContainer}>
                                            <Ionicons name="moon-outline" size={20} color="#666" style={styles.settingsInputIcon} />
                                            <Text style={[styles.settingsInputField, {paddingVertical: 14}]}>{salonDetails.hora_fecho || '19:00'}</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                {/* MODAL DE TEMPO (IOS) / ANDROID HANDLER */}
                                {activeTimePicker && (
                                    Platform.OS === 'ios' ? (
                                        <Modal visible={true} transparent animationType="fade">
                                            <View style={styles.modalOverlay}>
                                                <View style={styles.modalContent}>
                                                    <View style={styles.modalHeader}>
                                                        <TouchableOpacity onPress={() => setActiveTimePicker(null)}>
                                                            <Text style={{color: '#666'}}>Cancelar</Text>
                                                        </TouchableOpacity>
                                                        <TouchableOpacity onPress={confirmIOSTime}>
                                                            <Text style={{color: '#007AFF', fontWeight: 'bold'}}>Confirmar</Text>
                                                        </TouchableOpacity>
                                                    </View>
                                                    <DateTimePicker 
                                                        value={tempTime} 
                                                        mode="time" 
                                                        display="spinner" 
                                                        onChange={onTimeChange}
                                                        locale="pt-PT"
                                                        is24Hour={true}
                                                        style={{height: 200}} 
                                                    />
                                                </View>
                                            </View>
                                        </Modal>
                                    ) : (
                                        <DateTimePicker 
                                            value={tempTime} 
                                            mode="time" 
                                            display="spinner" // Tenta forçar spinner no Android também
                                            onChange={onTimeChange} 
                                            is24Hour={true}
                                        />
                                    )
                                )}

                                {/* NOVO INPUT: Intervalo entre Serviços */}
                                <View style={[styles.settingsInputGroup, {marginTop: 16}]}>
                                    <Text style={styles.settingsInputLabel}>INTERVALO ENTRE SERVIÇOS (MIN)</Text>
                                    <View style={styles.settingsInputContainer}>
                                        <Ionicons name="timer-outline" size={20} color="#666" style={styles.settingsInputIcon} />
                                        <TextInput 
                                            style={styles.settingsInputField} 
                                            value={salonDetails.intervalo_minutos ? String(salonDetails.intervalo_minutos) : ''} 
                                            onChangeText={(t) => setSalonDetails({...salonDetails, intervalo_minutos: Number(t)})}
                                            placeholder="Ex: 30"
                                            placeholderTextColor="#999"
                                            keyboardType="numeric"
                                        />
                                    </View>
                                </View>

                                <View style={[styles.settingsInputGroup, {marginTop: 16}]}>
                                    <Text style={styles.settingsInputLabel}>PÚBLICO ALVO</Text>
                                    <View style={styles.settingsSegmentContainer}>
                                        {['Homem', 'Mulher', 'Unissexo'].map((opt) => (
                                            <TouchableOpacity 
                                                key={opt} 
                                                style={[styles.settingsSegmentBtn, salonDetails.publico === opt && styles.settingsSegmentBtnActive]} 
                                                onPress={() => setSalonDetails({...salonDetails, publico: opt})}
                                            >
                                                <Text style={[styles.settingsSegmentTxt, salonDetails.publico === opt && styles.settingsSegmentTxtActive]}>{opt}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </View>
                            </View>

                            <TouchableOpacity style={styles.settingsSaveButtonFull} onPress={saveSettings} activeOpacity={0.8}>
                                <Text style={styles.settingsSaveButtonText}>Guardar Alterações</Text>
                                <Ionicons name="checkmark-circle" size={22} color="white" />
                            </TouchableOpacity>

                        </ScrollView>
                    )}

                    <Modal visible={selectedImage !== null} transparent={true} animationType="fade" onRequestClose={() => setSelectedImage(null)}>
                        <View style={styles.fullScreenContainer}>
                            <TouchableOpacity style={styles.closeButton} onPress={() => setSelectedImage(null)}><Ionicons name="close-circle" size={40} color="white" /></TouchableOpacity>
                            {selectedImage && <Image source={{ uri: selectedImage }} style={styles.fullScreenImage} resizeMode="contain"/>}
                        </View>
                    </Modal>
                </KeyboardAvoidingView>
            </SafeAreaView>
        </GestureHandlerRootView>
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
    
    // Unified Status Badge
    statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 4 },
    statusBadgeText: { fontSize: 10, fontWeight: 'bold' },

    // Ações
    actionColumn: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    miniBtn: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },

    // Utilitários
    emptyContainer: { alignItems: 'center', marginTop: 50 },
    emptyText: { color: '#CCC', marginTop: 10 },
    
    // --- ESTILOS DA GALERIA ---
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

    // --- ESTILOS DE SERVIÇOS ---
    tabHeader: { padding: 20, paddingBottom: 10 },
    sectionSubtitle: { fontSize: 13, color: '#666', marginTop: 2 },
    
    addServiceForm: {
        marginHorizontal: 20, marginBottom: 15,
        backgroundColor: 'white', borderRadius: 16, padding: 16,
        shadowColor: '#000', shadowOffset: {width:0,height:2}, shadowOpacity:0.05, shadowRadius: 5, elevation: 2
    },
    formTitle: { fontSize: 14, fontWeight: 'bold', color: '#333', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
    inputRow: { flexDirection: 'row', gap: 10, marginBottom: 15 },
    inputWrapper: { flex: 1, position: 'relative', justifyContent: 'center' },
    inputStyled: { 
        backgroundColor: '#F5F7FA', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 12, paddingLeft: 40,
        fontSize: 14, color: '#333', borderWidth: 1, borderColor: '#EEE'
    },
    inputIcon: { position: 'absolute', left: 10, zIndex: 1 },
    currencyPrefix: { position: 'absolute', left: 12, zIndex: 1, fontSize: 16, fontWeight: 'bold', color: '#999' },
    
    addServiceBtn: { backgroundColor: '#1A1A1A', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
    addServiceBtnText: { color: 'white', fontWeight: 'bold', fontSize: 14 },

    // Controlos da Lista (Contador + Botão Organizar)
    listControlRow: { 
        flexDirection: 'row', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        paddingHorizontal: 25, 
        marginBottom: 10 
    },
    listCountText: { fontSize: 12, fontWeight: '600', color: '#999', textTransform: 'uppercase' },
    reorderBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20, backgroundColor: '#EEE' },
    reorderBtnActive: { backgroundColor: '#333' },
    reorderBtnText: { fontSize: 12, fontWeight: '600', color: '#666' },

    serviceCard: {
        backgroundColor: 'white', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 15, marginBottom: 10,
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        shadowColor: '#000', shadowOpacity: 0.03, elevation: 1
    },
    serviceCardName: { fontSize: 15, fontWeight: '600', color: '#333', lineHeight: 20 },
    
    serviceRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    priceBadge: {
        backgroundColor: '#F0F9F4', paddingHorizontal: 10, paddingVertical: 6,
        borderRadius: 8, borderWidth: 1, borderColor: '#E8F5E9', marginRight: 5
    },
    priceBadgeText: { fontSize: 13, fontWeight: '700', color: '#2E7D32' },
    
    actionButtonsContainer: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    actionBtn: { padding: 5 },

    // --- ESTILOS ORIGINAIS (MANTIDOS PARA COMPATIBILIDADE) ---
    sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#333' }, 
    label: { fontSize: 12, color: '#666', fontWeight: '600', marginBottom: 5 },
    input: { backgroundColor: '#F5F7FA', padding: 12, borderRadius: 8, marginBottom: 10, borderWidth:1, borderColor:'#EEE' },
    segment: { flex: 1, padding: 10, borderRadius: 8, backgroundColor: '#EEE', alignItems: 'center' },
    segmentActive: { backgroundColor: '#333' },
    segmentText: { fontSize: 12, fontWeight: '600', color: '#666' },
    saveBtn: { backgroundColor: '#4CD964', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 20 },
    saveBtnText: { color: 'white', fontWeight: 'bold', fontSize: 16 },

    // --- ESTILOS DA NOVA ABA DEFINIÇÕES (RENOMEADOS PARA EVITAR CONFLITOS) ---
    settingsHeaderTitle: { fontSize: 28, fontWeight: '800', color: '#1A1A1A', letterSpacing: -0.5 },
    settingsHeaderSubtitle: { fontSize: 14, color: '#666', marginTop: 4 },

    settingsCard: {
        backgroundColor: 'white',
        borderRadius: 16,
        padding: 20,
        marginBottom: 20,
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 3
    },
    settingsSectionTitle: { fontSize: 16, fontWeight: '700', color: '#333', marginBottom: 20 },

    settingsInputGroup: { marginBottom: 16 },
    settingsInputLabel: { fontSize: 11, fontWeight: '700', color: '#999', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
    
    settingsInputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F7FA', borderRadius: 12, borderWidth: 1, borderColor: '#EEE' },
    settingsInputIcon: { paddingLeft: 12 },
    settingsInputField: { flex: 1, paddingVertical: 14, paddingHorizontal: 10, fontSize: 15, color: '#333', fontWeight: '500' },

    settingsSegmentContainer: { flexDirection: 'row', backgroundColor: '#F5F7FA', padding: 4, borderRadius: 12, borderWidth: 1, borderColor: '#EEE' },
    settingsSegmentBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
    settingsSegmentBtnActive: { backgroundColor: '#1A1A1A', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
    settingsSegmentTxt: { fontSize: 13, fontWeight: '600', color: '#999' },
    settingsSegmentTxtActive: { color: 'white' },

    settingsSaveButtonFull: {
        backgroundColor: '#1A1A1A',
        flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10,
        paddingVertical: 18, borderRadius: 16,
        marginTop: 10,
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4
    },
    settingsSaveButtonText: { color: 'white', fontSize: 16, fontWeight: 'bold' },

    // Estilos Imagem de Capa
    coverUploadBtn: { 
        height: 180, 
        backgroundColor: '#F5F7FA', 
        borderRadius: 12, 
        borderWidth: 1, 
        borderColor: '#EEE', 
        borderStyle: 'dashed',
        justifyContent: 'center', 
        alignItems: 'center',
        overflow: 'hidden'
    },
    coverPlaceholder: { alignItems: 'center', gap: 8 },
    coverPlaceholderText: { fontSize: 14, color: '#999', fontWeight: '600' },
    coverImagePreview: { width: '100%', height: '100%', resizeMode: 'cover' },
    editIconBadge: { 
        position: 'absolute', bottom: 10, right: 10, 
        backgroundColor: 'rgba(0,0,0,0.6)', 
        padding: 8, borderRadius: 20 
    },

    // Modais e Utilitários Gerais
    fullScreenContainer: { flex: 1, backgroundColor: 'black', justifyContent: 'center' },
    fullScreenImage: { width: '100%', height: '100%' },
    closeButton: { position: 'absolute', top: 50, right: 20, zIndex: 99 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center' },
    modalContent: { backgroundColor: 'white', width: '90%', borderRadius: 15, padding: 20, alignSelf:'center' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 }
});