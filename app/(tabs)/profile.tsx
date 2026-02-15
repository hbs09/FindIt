import { Ionicons } from '@expo/vector-icons';
import * as Calendar from 'expo-calendar';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    FlatList,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../supabase';
import { sendNotification } from '../../utils/notifications';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width * 0.85; // Largura do cartão (85% do ecrã)
const CARD_SPACING = 15; // Espaço entre cartões

// --- TIPOS DE DADOS ---
type Appointment = {
    id: number;
    data_hora: string;
    status: string;
    services: { nome: string; preco: number };
    salons: { nome_salao: string; morada: string; cidade: string; intervalo_minutos: number; dono_id?: string };
    salon_id: number;
};

type Favorite = {
    fav_id: number;
    id: number;
    nome_salao: string;
    cidade: string;
    imagem: string;
    categoria: string;
    publico: string;
    morada: string;
    averageRating: number | string;
};

export default function ProfileScreen() {
    const router = useRouter();

    // --- ESTADOS ---
    const [loadingProfile, setLoadingProfile] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [profile, setProfile] = useState<any>(null);
    const [isManager, setIsManager] = useState(false);
    const [isStaff, setIsStaff] = useState(false);
    const [pendingInvites, setPendingInvites] = useState(0);
    const [isSuperAdmin, setIsSuperAdmin] = useState(false);

    const [editModalVisible, setEditModalVisible] = useState(false);
    const [newName, setNewName] = useState('');
    const [savingName, setSavingName] = useState(false);

    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [favorites, setFavorites] = useState<Favorite[]>([]);
    const [loadingData, setLoadingData] = useState(false);

    const [activeTab, setActiveTab] = useState<'upcoming' | 'history' | 'favorites'>('upcoming');

    const [settingsModalVisible, setSettingsModalVisible] = useState(false);
    const [notificationsEnabled, setNotificationsEnabled] = useState(true);
    const [darkModeEnabled, setDarkModeEnabled] = useState(false);

    const getCarouselHeight = () => {
        if (activeTab === 'upcoming') return 315; // Mais alto (tem botões)
        return 260; // Mais baixo (Histórico e Favoritos não têm botões em baixo)
    };

    useFocusEffect(
        useCallback(() => {
            refreshAllData();
        }, [])
    );

    async function refreshAllData() {
        setLoadingData(true);
        await Promise.all([getProfile(), checkInvites(), fetchHistory(), fetchFavorites()]);
        setLoadingData(false);
        setLoadingProfile(false);
    }

    // --- FUNÇÕES DE DADOS ---
    async function checkInvites() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || !user.email) return;
        const { count } = await supabase.from('salon_staff').select('*', { count: 'exact', head: true }).eq('email', user.email).eq('status', 'pendente');
        if (count !== null) setPendingInvites(count);
    }

    async function getProfile() {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const { data: profileData } = await supabase.from('profiles').select('is_super_admin, nome').eq('id', user.id).single();
            setProfile({
                email: user.email,
                name: profileData?.nome || user.user_metadata?.full_name || 'Utilizador',
                avatar_url: user.user_metadata?.avatar_url,
                id: user.id
            });
            setIsSuperAdmin(profileData?.is_super_admin === true);
            let isUserAManager = false;
            const { count: ownerCount } = await supabase.from('salons').select('*', { count: 'exact', head: true }).eq('dono_id', user.id);
            if (ownerCount && ownerCount > 0) isUserAManager = true;
            const { data: staffRecord } = await supabase.from('salon_staff').select('role, status').eq('email', user.email).eq('status', 'ativo').maybeSingle();
            if (staffRecord) {
                setIsStaff(true);
                if (staffRecord.role === 'gerente') isUserAManager = true;
            } else {
                setIsStaff(false);
            }
            setIsManager(isUserAManager);
        } catch (error) { console.log("Erro no perfil:", error); }
    }

    async function pickImage() {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.5 });
            if (!result.canceled && result.assets && result.assets.length > 0) uploadAvatar(result.assets[0].uri);
        } catch (error) { Alert.alert("Erro", "Não foi possível abrir a galeria."); }
    }

    async function uploadAvatar(uri: string) {
        setUploading(true);
        try {
            const response = await fetch(uri);
            const arrayBuffer = await response.arrayBuffer();
            const fileExt = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
            const fileName = `${Date.now()}.${fileExt}`;
            const filePath = `${fileName}`;
            const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, arrayBuffer, { contentType: `image/${fileExt}`, upsert: true });
            if (uploadError) throw uploadError;
            const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filePath);
            const { data: { user } } = await supabase.auth.getUser();
            if (user) await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id);
            await supabase.auth.updateUser({ data: { avatar_url: publicUrl } });
            setProfile((prev: any) => ({ ...prev, avatar_url: publicUrl }));
            Alert.alert("Sucesso", "Foto de perfil atualizada!");
        } catch (error) { console.log(error); Alert.alert("Erro", "Falha ao carregar a imagem."); } finally { setUploading(false); }
    }

    async function saveName() {
        if (!newName.trim()) return Alert.alert("Atenção", "O nome não pode estar vazio.");
        setSavingName(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Utilizador não encontrado");
            const { error: profileError } = await supabase.from('profiles').update({ nome: newName.trim() }).eq('id', user.id);
            if (profileError) throw profileError;
            await supabase.auth.updateUser({ data: { full_name: newName.trim() } });
            setProfile((prev: any) => ({ ...prev, name: newName.trim() }));
            setEditModalVisible(false);
            Alert.alert("Sucesso", "Nome atualizado!");
        } catch (error: any) { console.log(error); Alert.alert("Erro", "Não foi possível guardar o nome."); } finally { setSavingName(false); }
    }

    async function handleLogout() {
        Alert.alert("Sair", "Tens a certeza que queres sair?", [
            { text: "Cancelar", style: "cancel" },
            { text: "Sair", style: "destructive", onPress: async () => { await supabase.auth.signOut(); router.replace('/login'); } }
        ]);
    }

    async function fetchHistory() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // ADICIONEI 'imagem' NA SELEÇÃO DOS SALONS
        const { data, error } = await supabase
            .from('appointments')
            .select(`
                id, 
                data_hora, 
                status, 
                salon_id, 
                services (nome, preco), 
                salons (dono_id, nome_salao, morada, cidade, intervalo_minutos, imagem)
            `)
            .eq('cliente_id', user.id)
            .order('data_hora', { ascending: false });

        if (!error && data) {
            const formattedData = data.map((item: any) => ({
                ...item,
                services: Array.isArray(item.services) ? item.services[0] : item.services,
                salons: Array.isArray(item.salons) ? item.salons[0] : item.salons,
            }));
            setAppointments(formattedData);
        }
    }

    async function cancelAppointment(id: number) {
        Alert.alert("Cancelar Pedido", "Tens a certeza?", [
            { text: "Manter", style: "cancel" },
            {
                text: "Sim, Cancelar", style: 'destructive', onPress: async () => {
                    try {
                        setLoadingData(true);
                        const appt = appointments.find(a => a.id === id);
                        if (!appt) throw new Error("Erro local");
                        const { error: updateError } = await supabase.from('appointments').update({ status: 'cancelado' }).eq('id', id);
                        if (updateError) throw updateError;
                        const { data: { user } } = await supabase.auth.getUser();
                        const userName = user?.user_metadata?.full_name || 'Cliente';
                        if (appt.salons.dono_id) { sendNotification(appt.salons.dono_id, "Cancelamento", `${userName} cancelou a marcação.`, {}); }
                        Alert.alert("Sucesso", "Pedido cancelado.");
                        fetchHistory();
                    } catch (error) { Alert.alert("Erro", "Não foi possível cancelar."); } finally { setLoadingData(false); }
                }
            }
        ]);
    }

    async function addToCalendar(item: Appointment) {
        try {
            const { status } = await Calendar.requestCalendarPermissionsAsync();
            if (status !== 'granted') return Alert.alert('Permissão necessária', 'Acesso ao calendário negado.');
            const startDate = new Date(item.data_hora);
            const endDate = new Date(item.data_hora);
            endDate.setMinutes(endDate.getMinutes() + (item.salons?.intervalo_minutos || 30));
            const defaultCalendar = Platform.OS === 'ios' ? await Calendar.getDefaultCalendarAsync() : (await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT)).find(c => c.isPrimary) || (await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT))[0];
            if (!defaultCalendar) return Alert.alert("Erro", "Calendário não encontrado.");
            await Calendar.createEventAsync(defaultCalendar.id, { title: `Corte em ${item.salons.nome_salao}`, startDate, endDate, location: `${item.salons.morada}, ${item.salons.cidade}`, notes: `Serviço: ${item.services.nome}` });
            Alert.alert("Sucesso", "Adicionado ao calendário!");
        } catch (error) { Alert.alert("Erro", "Falha ao adicionar ao calendário."); }
    }

    async function fetchFavorites() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data, error } = await supabase.from('favorites').select(`id, salon_id, salons (id, nome_salao, cidade, imagem, categoria, publico, morada, reviews (rating))`).eq('user_id', user.id);
        if (!error && data) {
            const processed = data.map((fav: any) => {
                const salon = fav.salons;
                const reviews = salon.reviews || [];
                let avg: number | string = "Novo";
                if (reviews.length > 0) {
                    const total = reviews.reduce((acc: number, r: any) => acc + r.rating, 0);
                    avg = (total / reviews.length).toFixed(1);
                }
                return { ...salon, averageRating: avg, fav_id: fav.id };
            });
            setFavorites(processed);
        }
    }

    async function removeFavorite(favId: number) {
        setFavorites(prev => prev.filter(item => item.fav_id !== favId));
        await supabase.from('favorites').delete().eq('id', favId);
    }

    const getStatusColor = (status: string) => {
        switch (status) { case 'confirmado': return '#4CD964'; case 'pendente': return '#FF9500'; case 'cancelado': return '#FF3B30'; default: return '#8E8E93'; }
    };
    const getStatusLabel = (status: string) => {
        switch (status) { case 'confirmado': return 'Confirmado'; case 'pendente': return 'Pendente'; case 'cancelado': return 'Cancelado'; default: return 'Concluído'; }
    };

    const now = new Date();
    const upcomingAppointments = appointments.filter(item => {
        const appDate = new Date(item.data_hora);
        return appDate >= now && !['cancelado', 'concluido', 'faltou'].includes(item.status);
    }).sort((a, b) => new Date(a.data_hora).getTime() - new Date(b.data_hora).getTime());

    const historyAppointments = appointments.filter(item => {
        const appDate = new Date(item.data_hora);
        return appDate < now || ['cancelado', 'concluido', 'faltou'].includes(item.status);
    });

    const getDataToShow = () => {
        if (activeTab === 'upcoming') return upcomingAppointments;
        if (activeTab === 'history') return historyAppointments;
        if (activeTab === 'favorites') return favorites;
        return [];
    };

    const renderEmpty = () => {
        let iconName: any = "calendar";
        let title = "";
        let sub = "";
        if (activeTab === 'upcoming') { title = "Sem agendamentos"; sub = "Próximas marcações aparecem aqui."; }
        else if (activeTab === 'history') { iconName = "time"; title = "Histórico vazio"; sub = "Sem marcações antigas."; }
        else { iconName = "heart-dislike-outline"; title = "Sem Favoritos"; sub = "Ainda não tens favoritos."; }

        // Container ajustado para o carrossel (centrado com margens)
        return (
            <View style={[styles.emptyContainer, { width: width - 40 }]}>
                <View style={styles.emptyIconBg}><Ionicons name={iconName} size={32} color="#CCC" /></View>
                <Text style={styles.emptyTextTitle}>{title}</Text>
                <Text style={styles.emptyTextSubtitle}>{sub}</Text>
            </View>
        );
    };

    const renderItem = ({ item }: { item: any }) => {
        // --- FAVORITO CARD ---
        if (activeTab === 'favorites') {
            return (
                <TouchableOpacity style={styles.favCard} onPress={() => router.push(`/salon/${item.id}`)} activeOpacity={0.95}>
                    <Image source={{ uri: item.imagem || 'https://via.placeholder.com/400x300' }} style={styles.favCardImage} />
                    <TouchableOpacity style={styles.favRemoveBtn} onPress={(e) => { e.stopPropagation(); removeFavorite(item.fav_id); }}>
                        <Ionicons name="heart" size={20} color="#FF3B30" />
                    </TouchableOpacity>
                    <View style={styles.favRatingBadge}>
                        <Ionicons name="star" size={12} color="#FFD700" />
                        <Text style={styles.favRatingText}>{item.averageRating}</Text>
                    </View>
                    <View style={styles.favCardContent}>
                        <Text style={styles.favCardTitle} numberOfLines={1}>{item.nome_salao}</Text>
                        <View style={styles.favLocationRow}>
                            <Ionicons name="location-sharp" size={14} color="#666" />
                            <Text style={styles.favCardLocation}>{item.cidade}</Text>
                        </View>
                    </View>
                </TouchableOpacity>
            );
        }

        // --- AGENDAMENTO CARD (DESIGN MELHORADO) ---
        const dateObj = new Date(item.data_hora);
        const day = dateObj.getDate();
        const month = dateObj.toLocaleDateString('pt-PT', { month: 'short' }).toUpperCase().replace('.', '');
        const time = dateObj.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });



        return (
            <View style={styles.card}>
                {/* --- TOPO: IMAGEM + OVERLAYS --- */}
                <View style={styles.cardImageContainer}>
                    <Image
                        source={{ uri: item.salons?.imagem || 'https://via.placeholder.com/500x300' }}
                        style={styles.cardImage}
                    />
                    <View style={styles.cardOverlay} />

                    {/* Badge de Data (Flutuante) */}
                    <View style={styles.dateBadge}>
                        <Text style={styles.dateBadgeDay}>{day}</Text>
                        <Text style={styles.dateBadgeMonth}>{month}</Text>
                    </View>

                    {/* Badge de Status (Flutuante) */}
                    <View style={[styles.statusPill, { backgroundColor: getStatusColor(item.status) }]}>
                        <Text style={styles.statusPillText}>{getStatusLabel(item.status)}</Text>
                    </View>
                </View>

                {/* --- CONTEÚDO --- */}
                <View style={styles.cardContent}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.cardTitle} numberOfLines={1}>{item.salons?.nome_salao}</Text>
                        <Text style={styles.cardService} numberOfLines={1}>{item.services?.nome}</Text>

                        <View style={styles.cardLocationRow}>
                            <Ionicons name="time-outline" size={14} color="#666" />
                            <Text style={styles.cardMetaText}>{time}h</Text>
                            <Text style={styles.cardDot}>•</Text>
                            <Ionicons name="location-outline" size={14} color="#666" />
                            <Text style={styles.cardMetaText} numberOfLines={1}>{item.salons?.cidade}</Text>
                        </View>
                    </View>

                    {/* Preço Grande */}
                    <View style={styles.priceTag}>
                        <Text style={styles.priceTagText}>{item.services?.preco}€</Text>
                    </View>
                </View>

                {/* --- AÇÕES (BOTÕES EM BAIXO) --- */}
                {activeTab === 'upcoming' && (
                    <View style={styles.cardActions}>
                        {item.status === 'pendente' ? (
                            <TouchableOpacity style={styles.actionBtnOutline} onPress={() => cancelAppointment(item.id)}>
                                <Text style={[styles.actionBtnText, { color: '#FF3B30' }]}>Cancelar</Text>
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity style={styles.actionBtnOutline} onPress={() => addToCalendar(item)}>
                                <Ionicons name="calendar" size={14} color="#007AFF" />
                                <Text style={[styles.actionBtnText, { color: '#007AFF' }]}>Adicionar</Text>
                            </TouchableOpacity>
                        )}

                        {/* Botão Ver Detalhes (Sempre visível) */}
                        <TouchableOpacity style={styles.actionBtnFilled} onPress={() => router.push(`/salon/${item.salon_id}`)}>
                            <Text style={styles.actionBtnTextFilled}>Ver Salão</Text>
                            <Ionicons name="arrow-forward" size={14} color="white" />
                        </TouchableOpacity>
                    </View>
                )}
            </View>
        );
    };

    if (loadingProfile) return <View style={styles.center}><ActivityIndicator color="#333" /></View>;

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <View style={styles.contentContainer}>
                {/* --- HEADER (Horizontal e Alinhado) --- */}
                <View style={styles.header}>
                    <TouchableOpacity style={styles.avatarContainer} onPress={pickImage} disabled={uploading}>
                        {uploading ? <ActivityIndicator color="#333" /> : profile?.avatar_url ? (
                            <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} />
                        ) : (
                            <Text style={styles.avatarText}>{profile?.name?.charAt(0).toUpperCase() || 'U'}</Text>
                        )}
                        <View style={styles.cameraIconBadge}><Ionicons name="camera" size={10} color="white" /></View>
                    </TouchableOpacity>

                    <View style={styles.headerInfo}>
                        <View style={styles.nameRow}>
                            <Text style={styles.name} numberOfLines={1}>{profile?.name}</Text>
                            <TouchableOpacity onPress={() => { setNewName(profile?.name || ''); setEditModalVisible(true); }} style={styles.editIconBtn}>
                                <Ionicons name="pencil" size={14} color="#007AFF" />
                            </TouchableOpacity>
                        </View>
                        <Text style={styles.email} numberOfLines={1}>{profile?.email}</Text>
                    </View>
                </View>

                {/* --- AÇÕES ESPECIAIS --- */}
                <View>
                    {isSuperAdmin && (
                        <TouchableOpacity style={styles.adminButton} onPress={() => router.push('/super-admin')}>
                            <Ionicons name="shield-checkmark" size={18} color="white" />
                            <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 13 }}>Super Admin</Text>
                        </TouchableOpacity>
                    )}

                    {pendingInvites > 0 && (
                        <TouchableOpacity style={styles.inviteCard} onPress={() => router.push('/invites')}>
                            <View style={styles.inviteIconBox}>
                                <Ionicons name="mail" size={18} color="#FF9500" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.inviteTitle}>Convite Pendente</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={18} color="#CCC" />
                        </TouchableOpacity>
                    )}
                </View>

                {/* --- ABAS TIPO PÍLULA --- */}
                <View style={styles.pillContainer}>
                    <TouchableOpacity style={[styles.pillBtn, activeTab === 'upcoming' && styles.pillBtnActive]} onPress={() => setActiveTab('upcoming')}>
                        <Text style={[styles.pillText, activeTab === 'upcoming' && styles.pillTextActive]}>Próximas</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.pillBtn, activeTab === 'history' && styles.pillBtnActive]} onPress={() => setActiveTab('history')}>
                        <Text style={[styles.pillText, activeTab === 'history' && styles.pillTextActive]}>Histórico</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.pillBtn, activeTab === 'favorites' && styles.pillBtnActive]} onPress={() => setActiveTab('favorites')}>
                        <Text style={[styles.pillText, activeTab === 'favorites' && styles.pillTextActive]}>Favoritos</Text>
                    </TouchableOpacity>
                </View>

                {/* --- CARROSSEL DE CARDS --- */}
                {/* --- CARROSSEL DE CARDS --- */}
                <View style={{ height: getCarouselHeight() }}>
                    <FlatList
                        data={getDataToShow()}
                        horizontal={true}
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20, paddingTop: 10 }}
                        keyExtractor={(item) => (activeTab === 'favorites' ? 'fav-' + item.fav_id : 'app-' + item.id)}
                        renderItem={renderItem}
                        ListEmptyComponent={renderEmpty}
                        snapToInterval={CARD_WIDTH + CARD_SPACING}
                        decelerationRate="fast"
                        snapToAlignment="start"
                    />
                </View>
            </View>

            {/* MODAL EDITAR NOME (Mantém-se igual) */}
            <Modal animationType="fade" transparent={true} visible={editModalVisible} onRequestClose={() => setEditModalVisible(false)}>
                <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Editar Nome</Text>
                        <TextInput style={styles.input} value={newName} onChangeText={setNewName} placeholder="O teu nome" autoFocus={true} />
                        <View style={styles.modalButtons}>
                            <TouchableOpacity style={[styles.modalBtn, styles.modalBtnCancel]} onPress={() => setEditModalVisible(false)}><Text style={styles.modalBtnTextCancel}>Cancelar</Text></TouchableOpacity>
                            <TouchableOpacity style={[styles.modalBtn, styles.modalBtnSave]} onPress={saveName} disabled={savingName}>{savingName ? <ActivityIndicator color="white" size="small" /> : <Text style={styles.modalBtnTextSave}>Guardar</Text>}</TouchableOpacity>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* --- MENU CONTA --- */}
            <View style={styles.bottomMenuContainer}>
                <Text style={styles.menuLabel}>CONTA</Text>
                <View style={styles.menuSection}>
                    {/* Botão Definições (Abre o Modal) */}
                    <TouchableOpacity style={styles.menuItem} onPress={() => setSettingsModalVisible(true)}>
                        <View style={[styles.menuIconBg, { backgroundColor: '#E3F2FD' }]}>
                            <Ionicons name="settings-outline" size={20} color="#007AFF" />
                        </View>
                        <Text style={styles.menuText}>Definições</Text>
                        <Ionicons name="chevron-forward" size={16} color="#CCC" />
                    </TouchableOpacity>

                    {/* Botão Terminar Sessão (Com borda no topo agora, pois é o segundo item) */}
                    <TouchableOpacity style={[styles.menuItem, { borderBottomWidth: 0, borderTopWidth: 1, borderTopColor: '#FAFAFA' }]} onPress={handleLogout}>
                        <View style={[styles.menuIconBg, { backgroundColor: '#FFEBEE' }]}>
                            <Ionicons name="log-out-outline" size={20} color="#D32F2F" />
                        </View>
                        <Text style={[styles.menuText, { color: '#D32F2F' }]}>Terminar Sessão</Text>
                    </TouchableOpacity>
                </View>
                <View style={styles.footerInfo}><Text style={styles.versionText}>FindIt v1.0.0</Text></View>
            </View>

            {/* --- MODAL DE DEFINIÇÕES --- */}
            <Modal
                animationType="slide"
                transparent={true}
                visible={settingsModalVisible}
                onRequestClose={() => setSettingsModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        {/* Cabeçalho do Modal */}
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Definições</Text>
                            <TouchableOpacity onPress={() => setSettingsModalVisible(false)}>
                                <Ionicons name="close" size={24} color="#999" />
                            </TouchableOpacity>
                        </View>

                        {/* Opção: Notificações */}
                        <View style={styles.settingRow}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.settingLabel}>Notificações</Text>
                                <Text style={styles.settingSubLabel}>Receber alertas de marcações</Text>
                            </View>
                            <Switch
                                trackColor={{ false: "#E0E0E0", true: "#1A1A1A" }}
                                thumbColor={"#FFFFFF"}
                                onValueChange={setNotificationsEnabled}
                                value={notificationsEnabled}
                            />
                        </View>

                        <View style={styles.divider} />

                        {/* Opção: Modo Escuro (Exemplo) */}
                        <View style={styles.settingRow}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.settingLabel}>Modo Escuro</Text>
                                <Text style={styles.settingSubLabel}>Ajustar aparência da app</Text>
                            </View>
                            <Switch
                                trackColor={{ false: "#E0E0E0", true: "#1A1A1A" }}
                                thumbColor={"#FFFFFF"}
                                onValueChange={setDarkModeEnabled}
                                value={darkModeEnabled}
                            />
                        </View>

                        <View style={styles.divider} />

                        {/* Opção: Links Úteis */}
                        <TouchableOpacity style={styles.settingLinkRow} onPress={() => Alert.alert("Info", "Página de Termos")}>
                            <Text style={styles.settingLabel}>Termos e Condições</Text>
                            <Ionicons name="chevron-forward" size={16} color="#CCC" />
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.settingLinkRow} onPress={() => Alert.alert("Atenção", "Esta ação apagaria a conta.")}>
                            <Text style={[styles.settingLabel, { color: '#FF3B30' }]}>Apagar Conta</Text>
                        </TouchableOpacity>

                        {/* Botão Fechar Grande */}
                        <TouchableOpacity
                            style={[styles.modalBtn, styles.modalBtnSave, { marginTop: 20, width: '100%' }]}
                            onPress={() => setSettingsModalVisible(false)}
                        >
                            <Text style={styles.modalBtnTextSave}>Concluído</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#FAFAFA' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    contentContainer: { flex: 1, paddingBottom: 10 }, // Substitui o ScrollView contentContainer

    // HEADER
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingTop: 20,
        paddingBottom: 20,
        backgroundColor: '#FAFAFA'
    },
    avatarContainer: {
        width: 80, height: 80, borderRadius: 40, // Tamanho reduzido
        backgroundColor: '#F0F0F0',
        justifyContent: 'center', alignItems: 'center',
        marginRight: 20, // Margem à direita em vez de em baixo
        marginBottom: 0,
        borderWidth: 3, borderColor: 'white',
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 4
    },
    avatarImage: { width: '100%', height: '100%', borderRadius: 40, resizeMode: 'cover' },
    avatarText: { fontSize: 30, fontWeight: 'bold', color: '#BBB' },
    cameraIconBadge: {
        position: 'absolute', bottom: 0, right: 0, backgroundColor: '#1A1A1A', width: 26, height: 26, borderRadius: 13,
        justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'white'
    },
    adminButton: { backgroundColor: '#FF3B30', paddingVertical: 10, paddingHorizontal: 15, borderRadius: 10, marginHorizontal: 20, marginBottom: 15, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 },

    // INVITE CARD NOVO
    inviteCard: {
        backgroundColor: 'white', padding: 12, borderRadius: 14, marginHorizontal: 20, marginBottom: 15,
        flexDirection: 'row', alignItems: 'center', gap: 10,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 8, elevation: 2,
        borderWidth: 1, borderColor: '#F0F0F0'
    },
    inviteIconBox: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#FFF3E0', justifyContent: 'center', alignItems: 'center' },
    inviteTitle: { fontSize: 14, fontWeight: 'bold', color: '#1A1A1A' },
    inviteSubtitle: { fontSize: 12, color: '#666' },

    // SEÇÃO
    sectionHeader: { paddingHorizontal: 24, marginBottom: 12 },
    sectionTitleBig: { fontSize: 22, fontWeight: '800', color: '#1A1A1A', letterSpacing: -0.5 },

    // ABAS TIPO PÍLULA
    pillContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
        marginBottom: 15,
        paddingHorizontal: 20
    },
    pillBtn: {
        paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, backgroundColor: '#F0F0F0',
        borderWidth: 1, borderColor: 'transparent'
    },
    pillBtnActive: { backgroundColor: '#1A1A1A' },
    pillText: { fontSize: 13, fontWeight: '600', color: '#888' },
    pillTextActive: { color: 'white' },

    // --- NOVO ESTILO DOS CARDS ---
    card: {
        width: CARD_WIDTH,
        marginRight: CARD_SPACING,
        backgroundColor: 'white',
        borderRadius: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.08,
        shadowRadius: 15,
        elevation: 6,
        overflow: 'hidden', // Importante para a imagem não sair dos cantos
        height: '96%', // Ocupa quase a altura toda da View container
        borderWidth: 1,
        borderColor: '#F5F5F5'
    },

    favCard: {
        width: CARD_WIDTH, marginRight: CARD_SPACING, backgroundColor: 'white', borderRadius: 20, overflow: 'hidden',
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 4,
        height: '96%'
    },

    // Conteúdo Card
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    salonName: { fontSize: 17, fontWeight: 'bold', color: '#1A1A1A', marginBottom: 2, flex: 1 },
    serviceName: { fontSize: 14, color: '#666', fontWeight: '500' },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginLeft: 8 },
    statusText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
    divider: { height: 1, backgroundColor: '#F0F0F0', width: '100%', marginVertical: 5 },
    cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    dateTimeContainer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    dateText: { fontSize: 14, color: '#444', fontWeight: '500' },
    priceText: { fontSize: 18, fontWeight: '800', color: '#1A1A1A' },

    cancelBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, backgroundColor: '#FFF5F5', borderRadius: 12, marginTop: 15, borderWidth: 1, borderColor: '#FFEBEE' },
    cancelBtnText: { color: '#FF3B30', fontWeight: '700', fontSize: 13 },
    calendarBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, backgroundColor: '#F0F8FF', borderRadius: 12, marginTop: 15, borderWidth: 1, borderColor: '#E3F2FD' },
    calendarBtnText: { color: '#007AFF', fontWeight: '700', fontSize: 13 },

    // Favoritos Styles
    favCardImage: { width: '100%', height: 150, resizeMode: 'cover' },
    favCardContent: { padding: 15 },
    favCardTitle: { fontSize: 17, fontWeight: 'bold', color: '#1a1a1a', marginBottom: 4 },
    favLocationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    favCardLocation: { fontSize: 13, fontWeight: '600', color: '#666' },
    favRatingBadge: { position: 'absolute', top: 12, left: 12, backgroundColor: 'white', flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, elevation: 3 },
    favRatingText: { fontWeight: '800', fontSize: 11, color: '#1a1a1a' },
    favRemoveBtn: { position: 'absolute', top: 12, right: 12, backgroundColor: 'white', width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center', elevation: 3 },

    // Empty State
    emptyTextTitle: { fontSize: 16, fontWeight: 'bold', color: '#333' },
    emptyTextSubtitle: { fontSize: 13, color: '#999', textAlign: 'center' },

    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 20 },
    modalContent: { backgroundColor: 'white', width: '85%', borderRadius: 24, padding: 24, alignItems: 'center', elevation: 10 },
    modalTitle: { fontSize: 20, fontWeight: '800', marginBottom: 8, color: '#1A1A1A' },
    input: { width: '100%', backgroundColor: '#F7F7F7', borderRadius: 14, padding: 16, fontSize: 16, marginBottom: 20 },
    modalButtons: { flexDirection: 'row', gap: 12, width: '100%' },
    modalBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
    modalBtnCancel: { backgroundColor: '#F5F5F5' },
    modalBtnSave: { backgroundColor: '#1A1A1A' },
    modalBtnTextCancel: { color: '#666', fontWeight: '700' },
    modalBtnTextSave: { color: 'white', fontWeight: '800' },

    headerInfo: { flex: 1, justifyContent: 'center' },
    nameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-start', // Alinhado à esquerda
        marginBottom: 4
    },
    editIconBtn: { padding: 4, marginLeft: 4 },
    name: {
        fontSize: 20,
        fontWeight: '800',
        color: '#1A1A1A',
        textAlign: 'left', // Alinhado à esquerda
        letterSpacing: -0.5,
        flexShrink: 1
    },
    email: {
        fontSize: 14,
        color: '#888',
        fontWeight: '500',
        textAlign: 'left' // Alinhado à esquerda
    },

    // MENU INFERIOR
    bottomMenuContainer: { paddingBottom: 100, marginTop: 0 },
    menuLabel: { marginLeft: 25, marginBottom: 8, fontSize: 10, fontWeight: '800', color: '#CCC', letterSpacing: 1 },
    menuSection: { backgroundColor: 'white', marginHorizontal: 20, borderRadius: 16, paddingVertical: 0, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 8, elevation: 2 },
    menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16 },
    menuIconBg: { width: 34, height: 34, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
    menuText: { flex: 1, fontSize: 14, fontWeight: '600', color: '#1A1A1A' },
    footerInfo: { alignItems: 'center', marginTop: 10 },
    versionText: { color: '#DDD', fontSize: 10, fontWeight: '600' },

    emptyContainer: { alignItems: 'center', justifyContent: 'center', width: width - 40, height: '100%' },
    emptyIconBg: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#F5F5F5', justifyContent: 'center', alignItems: 'center', marginBottom: 10 },

    // Estilos Específicos do Modal de Settings
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        width: '100%',
        marginBottom: 20,
    },
    settingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        paddingVertical: 12,
    },
    settingLinkRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        paddingVertical: 15,
    },
    settingLabel: {
        fontSize: 16,
        fontWeight: '600',
        color: '#1A1A1A',
    },
    settingSubLabel: {
        fontSize: 12,
        color: '#888',
        marginTop: 2,
    },

    cardImageContainer: { height: 110, width: '100%', position: 'relative' },
    cardImage: { width: '100%', height: '100%', resizeMode: 'cover' },
    cardOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.1)' }, // Escurece ligeiramente

    dateBadge: {
        position: 'absolute', top: 12, left: 12,
        backgroundColor: 'white', borderRadius: 10,
        paddingVertical: 6, paddingHorizontal: 10,
        alignItems: 'center', justifyContent: 'center',
        shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, elevation: 3
    },
    dateBadgeDay: { fontSize: 18, fontWeight: '800', color: '#1A1A1A', lineHeight: 20 },
    dateBadgeMonth: { fontSize: 10, fontWeight: '700', color: '#888', textTransform: 'uppercase' },

    statusPill: {
        position: 'absolute', top: 12, right: 12,
        paddingVertical: 4, paddingHorizontal: 10, borderRadius: 20,
        shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, elevation: 2
    },
    statusPillText: { color: 'white', fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase' },

    cardContent: {
        paddingHorizontal: 16,
        paddingTop: 12, // Menos espaço em cima
        paddingBottom: 8, // Menos espaço em baixo antes dos botões
        flexDirection: 'row',
        alignItems: 'center'
    },
    cardTitle: { fontSize: 18, fontWeight: 'bold', color: '#1A1A1A', marginBottom: 2 },
    cardService: { fontSize: 14, color: '#666', fontWeight: '500', marginBottom: 6 },
    cardLocationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    cardMetaText: { fontSize: 13, color: '#888', fontWeight: '500' },
    cardDot: { fontSize: 10, color: '#DDD', marginHorizontal: 2 },

    priceTag: { backgroundColor: '#F5F5F5', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 10 },
    priceTagText: { fontSize: 16, fontWeight: '800', color: '#1A1A1A' },

    // Botões de Ação
    cardActions: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingBottom: 16, // Espaço seguro no fundo
        gap: 10,
        marginTop: 18// Pequena margem para separar do texto
    },
    actionBtnOutline: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: '#E5E5EA', backgroundColor: 'transparent'
    },
    actionBtnFilled: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        paddingVertical: 10, borderRadius: 12, backgroundColor: '#1A1A1A'
    },
    actionBtnText: { fontSize: 13, fontWeight: '700' },
    actionBtnTextFilled: { fontSize: 13, fontWeight: '700', color: 'white' },
});