import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
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
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { supabase } from '../supabase';

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
    
    // Estatísticas do Dia (NOVO)
    const [todayStats, setTodayStats] = useState({ count: 0, revenue: 0 });

    // Edição
    const [salonDetails, setSalonDetails] = useState<SalonDetails>({
        nome_salao: '', morada: '', cidade: '', hora_abertura: '', hora_fecho: '', publico: 'Unissexo'
    });

    // Inputs Serviço
    const [newServiceName, setNewServiceName] = useState('');
    const [newServicePrice, setNewServicePrice] = useState('');
    const [addingService, setAddingService] = useState(false);

    // Filtros
    const [filter, setFilter] = useState<'pendente' | 'confirmado' | 'hoje' | 'historico'>('hoje');
    
    // --- DATAS ---
    const [historyDate, setHistoryDate] = useState(new Date()); 
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
                fetchDailyStats(); // <--- Atualiza estatísticas sempre que a agenda carrega
            }
            if (activeTab === 'galeria') fetchPortfolio();
            if (activeTab === 'servicos') fetchServices();
            if (activeTab === 'definicoes') fetchSalonSettings();
        }
    }, [salonId, filter, activeTab, historyDate]);

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
    // AGENDA E ESTATÍSTICAS
    // ==========================================
    
    // NOVA FUNÇÃO: Calcula faturação e clientes de HOJE
    async function fetchDailyStats() {
        if (!salonId) return;

        const start = new Date(); start.setHours(0,0,0,0);
        const end = new Date(); end.setHours(23,59,59,999);

        // Busca tudo de hoje que não esteja cancelado
        const { data } = await supabase
            .from('appointments')
            .select(`status, services (preco)`)
            .eq('salon_id', salonId)
            .gte('data_hora', start.toISOString())
            .lte('data_hora', end.toISOString())
            .neq('status', 'cancelado'); // Ignora os cancelados

        if (data) {
            const count = data.length;
            // Soma os preços (assumindo que services.preco existe)
            const revenue = data.reduce((total, item: any) => {
                return total + (item.services?.preco || 0);
            }, 0);

            setTodayStats({ count, revenue });
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

        if (filter === 'hoje') {
            const start = new Date(); start.setHours(0,0,0,0);
            const end = new Date(); end.setHours(23,59,59,999);
            query = query.gte('data_hora', start.toISOString()).lte('data_hora', end.toISOString());
        
        } else if (filter === 'historico') {
            const start = new Date(historyDate); start.setHours(0,0,0,0);
            const end = new Date(historyDate); end.setHours(23,59,59,999);
            query = query
                .gte('data_hora', start.toISOString())
                .lte('data_hora', end.toISOString())
                .neq('status', 'cancelado')
                .neq('status', 'pendente');
        
        } else if (filter === 'pendente') {
            const start = new Date(historyDate); start.setHours(0,0,0,0);
            const end = new Date(historyDate); end.setHours(23,59,59,999);
            query = query
                .gte('data_hora', start.toISOString())
                .lte('data_hora', end.toISOString())
                .eq('status', 'pendente');

        } else {
            query = query.eq('status', filter);
        }

        const { data } = await query;
        if (data) setAppointments(data as any);
        setLoading(false);
    }

    function changeHistoryDate(days: number) {
        const newDate = new Date(historyDate);
        newDate.setDate(newDate.getDate() + days);
        setHistoryDate(newDate);
    }

    const openDatePicker = () => {
        setTempDate(historyDate);
        setShowDatePicker(true);
    };

    const onChangeDate = (event: any, selectedDate?: Date) => {
        if (Platform.OS === 'android') {
            setShowDatePicker(false);
            if (selectedDate && event.type !== 'dismissed') {
                setHistoryDate(selectedDate);
            }
        } else {
            if (selectedDate) {
                setTempDate(selectedDate);
            }
        }
    };

    const confirmIOSDate = () => {
        setHistoryDate(tempDate);
        setShowDatePicker(false);
    };

    async function updateStatus(id: number, newStatus: string) {
        if (newStatus === 'faltou') {
            Alert.alert(
                "Marcar Falta",
                "Tem a certeza que o cliente faltou?",
                [
                    { text: "Cancelar", style: "cancel" },
                    { 
                        text: "Sim, Faltou", 
                        style: 'destructive', 
                        onPress: async () => { 
                            await executeUpdate(id, newStatus); 
                        } 
                    }
                ]
            );
        } else {
            await executeUpdate(id, newStatus);
        }
    }

    async function executeUpdate(id: number, newStatus: string) {
        const { error } = await supabase.from('appointments').update({ status: newStatus }).eq('id', id);
        if (!error) { 
            fetchAppointments(); 
            fetchDailyStats(); // Atualiza estatísticas (ex: se cancelar, baixa a faturação)
        }
    }

    // ==========================================
    // OUTRAS FUNÇÕES
    // ==========================================
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

    if (loading && !salonName) return <View style={styles.center}><ActivityIndicator size="large" color="#333" /></View>;

    return (
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{flex:1}}>
        <View style={styles.container}>
            <View style={styles.header}>
                <View>
                    <Text style={styles.welcome}>Painel de Gestão</Text>
                    <Text style={styles.salonName}>{salonName}</Text>
                </View>
                <TouchableOpacity onPress={() => router.replace('/(tabs)/profile')} style={styles.closeBtn}>
                    <Ionicons name="close" size={24} color="#333" />
                </TouchableOpacity>
            </View>

            <View style={styles.tabContainer}>
                <TouchableOpacity style={[styles.tabButton, activeTab === 'agenda' && styles.tabButtonActive]} onPress={() => setActiveTab('agenda')}><Ionicons name="calendar" size={20} color={activeTab === 'agenda' ? 'white' : '#666'} /></TouchableOpacity>
                <TouchableOpacity style={[styles.tabButton, activeTab === 'galeria' && styles.tabButtonActive]} onPress={() => setActiveTab('galeria')}><Ionicons name="images" size={20} color={activeTab === 'galeria' ? 'white' : '#666'} /></TouchableOpacity>
                <TouchableOpacity style={[styles.tabButton, activeTab === 'servicos' && styles.tabButtonActive]} onPress={() => setActiveTab('servicos')}><Ionicons name="cut" size={20} color={activeTab === 'servicos' ? 'white' : '#666'} /></TouchableOpacity>
                <TouchableOpacity style={[styles.tabButton, activeTab === 'definicoes' && styles.tabButtonActive]} onPress={() => setActiveTab('definicoes')}><Ionicons name="settings-sharp" size={20} color={activeTab === 'definicoes' ? 'white' : '#666'} /></TouchableOpacity>
            </View>

            {activeTab === 'agenda' && (
                <>
                    {/* --- CARTÕES DE ESTATÍSTICA (HOJE) --- */}
                    <View style={styles.statsContainer}>
                        <View style={styles.statCard}>
                            <Text style={styles.statLabel}>Clientes Hoje</Text>
                            <Text style={styles.statValue}>{todayStats.count}</Text>
                        </View>
                        <View style={styles.statCard}>
                            <Text style={styles.statLabel}>Faturação Prevista</Text>
                            <Text style={[styles.statValue, {color: '#4CD964'}]}>{todayStats.revenue.toFixed(2)}€</Text>
                        </View>
                    </View>

                    <View style={styles.filterRow}>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                            <TouchableOpacity onPress={() => setFilter('hoje')} style={[styles.filterChip, filter==='hoje' && styles.filterActive]}><Text style={[styles.filterText, filter==='hoje' && {color:'white'}]}>Hoje</Text></TouchableOpacity>
                            <TouchableOpacity onPress={() => setFilter('pendente')} style={[styles.filterChip, filter==='pendente' && styles.filterActive]}><Text style={[styles.filterText, filter==='pendente' && {color:'white'}]}>Pendentes</Text></TouchableOpacity>
                            <TouchableOpacity onPress={() => setFilter('confirmado')} style={[styles.filterChip, filter==='confirmado' && styles.filterActive]}><Text style={[styles.filterText, filter==='confirmado' && {color:'white'}]}>Confirmados</Text></TouchableOpacity>
                            <TouchableOpacity onPress={() => setFilter('historico')} style={[styles.filterChip, filter==='historico' && styles.filterActive]}><Text style={[styles.filterText, filter==='historico' && {color:'white'}]}>Histórico</Text></TouchableOpacity>
                        </ScrollView>
                    </View>

                    {(filter === 'historico' || filter === 'pendente') && (
                        <View style={styles.dateSelector}>
                            <TouchableOpacity onPress={() => changeHistoryDate(-1)} style={styles.arrowBtn}><Ionicons name="chevron-back" size={24} color="#333" /></TouchableOpacity>
                            <TouchableOpacity onPress={openDatePicker} style={{alignItems:'center'}}>
                                <Text style={styles.dateLabel}>A ver marcações de:</Text>
                                <View style={{flexDirection:'row', alignItems:'center', gap:5}}>
                                    <Ionicons name="calendar-outline" size={16} color="#333" />
                                    <Text style={styles.dateText}>{historyDate.toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
                                </View>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => changeHistoryDate(1)} style={styles.arrowBtn}><Ionicons name="chevron-forward" size={24} color="#333" /></TouchableOpacity>
                        </View>
                    )}

                    {showDatePicker && (
                        Platform.OS === 'ios' ? (
                            <Modal visible={showDatePicker} transparent animationType="slide">
                                <View style={styles.iosDatePickerOverlay}>
                                    <View style={styles.iosDatePickerContainer}>
                                        <View style={styles.iosHeader}>
                                            <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                                                <Text style={{color: '#666', fontSize: 16}}>Cancelar</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity onPress={confirmIOSDate}>
                                                <Text style={{color: '#007AFF', fontSize: 16, fontWeight: 'bold'}}>Confirmar</Text>
                                            </TouchableOpacity>
                                        </View>
                                        <DateTimePicker value={tempDate} mode="date" display="spinner" onChange={onChangeDate} maximumDate={new Date(2030, 11, 31)} style={{height: 200}} />
                                    </View>
                                </View>
                            </Modal>
                        ) : (
                            <DateTimePicker value={historyDate} mode="date" display="default" onChange={onChangeDate} maximumDate={new Date(2030, 11, 31)} />
                        )
                    )}

                    <FlatList
                        data={appointments}
                        keyExtractor={(item) => item.id.toString()}
                        contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
                        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => { fetchAppointments(); fetchDailyStats(); }} />}
                        ListEmptyComponent={<Text style={styles.empty}>Sem marcações para esta visualização.</Text>}
                        renderItem={({ item }) => (
                            <View style={styles.card}>
                                <View style={styles.cardInfo}>
                                    <Text style={styles.clientName}>{item.cliente_nome}</Text>
                                    <Text style={styles.serviceText}>{item.services?.nome} • {item.services?.preco}€</Text>
                                    <Text style={styles.timeText}>{new Date(item.data_hora).toLocaleDateString()} às {new Date(item.data_hora).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</Text>
                                    {(filter === 'historico' || item.status === 'faltou') && (
                                        <Text style={[styles.statusBadge, item.status === 'concluido' ? {color:'green'} : item.status === 'faltou' ? {color:'orange'} : item.status === 'cancelado' ? {color:'red'} : {color:'#666'}]}>{item.status.toUpperCase()}</Text>
                                    )}
                                </View>
                                <View style={styles.actions}>
                                    {item.status === 'pendente' && (
                                        <>
                                            <TouchableOpacity onPress={() => updateStatus(item.id, 'cancelado')} style={[styles.actionBtn, {backgroundColor:'#ffebee'}]}><Ionicons name="close" size={20} color="#d32f2f" /></TouchableOpacity>
                                            <TouchableOpacity onPress={() => updateStatus(item.id, 'confirmado')} style={[styles.actionBtn, {backgroundColor:'#e8f5e9'}]}><Ionicons name="checkmark" size={20} color="#2e7d32" /></TouchableOpacity>
                                        </>
                                    )}
                                    {item.status === 'confirmado' && (
                                        <>
                                            <TouchableOpacity onPress={() => updateStatus(item.id, 'faltou')} style={[styles.actionBtn, {backgroundColor:'#fff3e0', marginRight: 5}]}><Ionicons name="alert-circle" size={20} color="#ff9800" /></TouchableOpacity>
                                            <TouchableOpacity onPress={() => updateStatus(item.id, 'concluido')} style={[styles.actionBtn, {backgroundColor:'#333', width: 40}]}><Ionicons name="checkbox" size={20} color="white" /></TouchableOpacity>
                                        </>
                                    )}
                                </View>
                            </View>
                        )}
                    />
                </>
            )}

            {activeTab === 'galeria' && (
                <View style={{flex: 1, padding: 20}}>
                    <TouchableOpacity style={styles.uploadBtn} onPress={pickAndUploadImage} disabled={uploading}><Ionicons name="cloud-upload-outline" size={24} color="white" /><Text style={styles.uploadBtnText}>Adicionar Foto</Text></TouchableOpacity>
                    <FlatList data={portfolio} keyExtractor={(item) => item.id.toString()} numColumns={3} refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchPortfolio} />} columnWrapperStyle={{ gap: 10 }} contentContainerStyle={{ paddingBottom: 100, paddingTop: 20 }} ListEmptyComponent={<Text style={styles.empty}>Galeria vazia.</Text>} renderItem={({ item }) => (<View style={styles.galleryItem}><TouchableOpacity onPress={() => setSelectedImage(item.image_url)} style={{flex:1}}><Image source={{ uri: item.image_url }} style={styles.galleryImage} /></TouchableOpacity><TouchableOpacity style={styles.deleteBtn} onPress={() => deleteImage(item.id)}><Ionicons name="trash" size={16} color="white" /></TouchableOpacity></View>)} />
                </View>
            )}
            {activeTab === 'servicos' && (
                <View style={{flex:1}}>
                    <View style={styles.addServiceForm}>
                        <Text style={styles.sectionTitle}>Adicionar Novo Serviço</Text>
                        <View style={{flexDirection:'row', gap: 10}}><TextInput style={[styles.input, {flex:2}]} placeholder="Nome" value={newServiceName} onChangeText={setNewServiceName} /><TextInput style={[styles.input, {flex:1}]} placeholder="Preço" keyboardType="numeric" value={newServicePrice} onChangeText={setNewServicePrice} /></View>
                        <TouchableOpacity style={styles.addBtn} onPress={addService} disabled={addingService}>{addingService ? <ActivityIndicator color="white"/> : <Text style={styles.addBtnText}>Adicionar</Text>}</TouchableOpacity>
                    </View>
                    <FlatList data={services} keyExtractor={(item) => item.id.toString()} contentContainerStyle={{ padding: 20 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchServices} />} ListEmptyComponent={<Text style={styles.empty}>Sem serviços.</Text>} renderItem={({ item }) => (<View style={styles.serviceRow}><View><Text style={styles.serviceName}>{item.nome}</Text><Text style={styles.servicePrice}>{item.preco.toFixed(2)}€</Text></View><TouchableOpacity onPress={() => deleteService(item.id)}><Ionicons name="trash-outline" size={22} color="#FF3B30" /></TouchableOpacity></View>)} />
                </View>
            )}
            {activeTab === 'definicoes' && (
                <ScrollView contentContainerStyle={{padding: 20}}>
                    <Text style={styles.sectionTitle}>Dados do Salão</Text>
                    <Text style={styles.label}>Nome</Text><TextInput style={styles.input} value={salonDetails.nome_salao} onChangeText={(t) => setSalonDetails({...salonDetails, nome_salao: t})} />
                    <Text style={styles.label}>Cidade</Text><TextInput style={styles.input} value={salonDetails.cidade} onChangeText={(t) => setSalonDetails({...salonDetails, cidade: t})} />
                    <Text style={styles.label}>Morada</Text><TextInput style={styles.input} value={salonDetails.morada} onChangeText={(t) => setSalonDetails({...salonDetails, morada: t})} />
                    <View style={styles.row}><View style={{flex:1}}><Text style={styles.label}>Abertura</Text><TextInput style={styles.input} value={salonDetails.hora_abertura} onChangeText={(t) => setSalonDetails({...salonDetails, hora_abertura: t})} /></View><View style={{flex:1}}><Text style={styles.label}>Fecho</Text><TextInput style={styles.input} value={salonDetails.hora_fecho} onChangeText={(t) => setSalonDetails({...salonDetails, hora_fecho: t})} /></View></View>
                    
                    <Text style={[styles.label, {marginTop: 10}]}>Público Alvo</Text>
                    <View style={styles.genderRow}>
                        {['Homem', 'Mulher', 'Unissexo'].map((opt) => (
                            <TouchableOpacity 
                                key={opt} 
                                style={[styles.genderChip, salonDetails.publico === opt && styles.genderChipActive]}
                                onPress={() => setSalonDetails({...salonDetails, publico: opt})}
                            >
                                <Text style={[styles.genderText, salonDetails.publico === opt && styles.genderTextActive]}>{opt}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <TouchableOpacity style={styles.saveBtn} onPress={saveSettings}><Text style={styles.saveBtnText}>Guardar Alterações</Text></TouchableOpacity>
                </ScrollView>
            )}

            <Modal visible={selectedImage !== null} transparent={true} animationType="fade" onRequestClose={() => setSelectedImage(null)}>
                <View style={styles.fullScreenContainer}>
                    <TouchableOpacity style={styles.closeButton} onPress={() => setSelectedImage(null)}><Ionicons name="close-circle" size={40} color="white" /></TouchableOpacity>
                    {selectedImage && <Image source={{ uri: selectedImage }} style={styles.fullScreenImage} resizeMode="contain"/>}
                </View>
            </Modal>
        </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8f9fa' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: { padding: 20, paddingTop: 50, backgroundColor: 'white', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#eee' },
    welcome: { color: '#666', fontSize: 14 },
    salonName: { fontSize: 20, fontWeight: 'bold' },
    closeBtn: { padding: 5, backgroundColor: '#f0f0f0', borderRadius: 20 },
    tabContainer: { flexDirection: 'row', backgroundColor: 'white', paddingVertical: 10, paddingHorizontal: 5, gap: 5 },
    tabButton: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 8, backgroundColor: '#f0f0f0' },
    tabButtonActive: { backgroundColor: '#333' },
    filterRow: { flexDirection: 'row', padding: 15 },
    filterChip: { paddingVertical: 6, paddingHorizontal: 15, borderRadius: 20, backgroundColor: 'white', borderWidth: 1, borderColor: '#ddd', marginRight: 10 },
    filterActive: { backgroundColor: '#333', borderColor: '#333' },
    filterText: { color: '#333', fontSize: 12, fontWeight: '600' },
    dateSelector: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#e9ecef', marginHorizontal: 20, padding: 10, borderRadius: 12, marginBottom: 10 },
    dateLabel: { fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: 1 },
    dateText: { fontSize: 16, fontWeight: 'bold', textTransform: 'capitalize', color: '#333' },
    arrowBtn: { padding: 5 },
    empty: { textAlign: 'center', marginTop: 50, color: '#999', fontStyle: 'italic' },
    card: { backgroundColor: 'white', marginHorizontal: 20, marginBottom: 10, padding: 15, borderRadius: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05, elevation: 2 },
    cardInfo: { flex: 1 },
    clientName: { fontSize: 16, fontWeight: 'bold' },
    serviceText: { color: '#666', marginTop: 2 },
    timeText: { color: '#007AFF', fontWeight: '600', fontSize: 12, marginTop: 4 },
    statusBadge: { fontSize: 10, fontWeight: 'bold', marginTop: 5 },
    actions: { flexDirection: 'row', gap: 10 },
    actionBtn: { width: 35, height: 35, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
    uploadBtn: { backgroundColor: '#007AFF', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 15, borderRadius: 12, gap: 10, marginBottom: 10 },
    uploadBtnText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
    galleryItem: { flex: 1, aspectRatio: 1, position: 'relative', marginBottom: 10 },
    galleryImage: { width: '100%', height: '100%', borderRadius: 8, backgroundColor: '#ddd' },
    deleteBtn: { position: 'absolute', top: 5, right: 5, backgroundColor: 'rgba(0,0,0,0.6)', width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
    addServiceForm: { padding: 20, backgroundColor: 'white', marginBottom: 10 },
    sectionTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 10, color: '#333' },
    addBtn: { backgroundColor: '#333', padding: 12, borderRadius: 8, alignItems: 'center', marginTop: 10 },
    addBtnText: { color: 'white', fontWeight: 'bold' },
    serviceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, backgroundColor: 'white', borderRadius: 10, marginBottom: 10, borderWidth: 1, borderColor: '#eee' },
    serviceName: { fontSize: 16, fontWeight: '600' },
    servicePrice: { color: '#007AFF', fontWeight: 'bold' },
    label: { color: '#666', marginBottom: 5, fontSize: 12, fontWeight: '600' },
    input: { backgroundColor: 'white', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#eee', marginBottom: 15 },
    row: { flexDirection: 'row', gap: 15 },
    saveBtn: { backgroundColor: '#4CD964', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 10 },
    saveBtnText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
    fullScreenContainer: { flex: 1, backgroundColor: 'black', justifyContent: 'center', alignItems: 'center' },
    fullScreenImage: { width: '100%', height: '100%' },
    closeButton: { position: 'absolute', top: 50, right: 20, zIndex: 999, padding: 10 },
    iosDatePickerOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
    iosDatePickerContainer: { backgroundColor: 'white', padding: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
    iosHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, borderBottomWidth: 1, borderBottomColor: '#eee', paddingBottom: 10 },

    // --- ESTILOS DO GÉNERO ---
    genderRow: { flexDirection: 'row', gap: 10, marginBottom: 15 },
    genderChip: { flex: 1, alignItems: 'center', padding: 12, borderRadius: 8, backgroundColor: '#f0f0f0', borderWidth: 1, borderColor: '#ddd' },
    genderChipActive: { backgroundColor: '#333', borderColor: '#333' },
    genderText: { color: '#666', fontWeight: '600' },
    genderTextActive: { color: 'white' },

    // --- ESTATÍSTICAS ---
    statsContainer: { flexDirection: 'row', gap: 10, padding: 15, paddingBottom: 0 },
    statCard: { flex: 1, backgroundColor: 'white', padding: 15, borderRadius: 12, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05, elevation: 1 },
    statLabel: { fontSize: 12, color: '#666', textTransform: 'uppercase', marginBottom: 5, fontWeight: '600' },
    statValue: { fontSize: 22, fontWeight: 'bold', color: '#333' }
});