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
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../supabase';
import { sendNotification } from '../../utils/notifications';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width * 0.85; // O cartão ocupa 85% da largura do ecrã
const CARD_SPACING = 15;

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

    // --- FUNÇÕES DE DADOS (Mantidas iguais) ---
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
        const { data, error } = await supabase.from('appointments').select(`id, data_hora, status, salon_id, services (nome, preco), salons (dono_id, nome_salao, morada, cidade, intervalo_minutos)`).eq('cliente_id', user.id).order('data_hora', { ascending: false });
        if (!error && data) {
            const formattedData = data.map((item: any) => ({
                ...item, services: Array.isArray(item.services) ? item.services[0] : item.services, salons: Array.isArray(item.salons) ? item.salons[0] : item.salons,
            }));
            setAppointments(formattedData);
        }
    }

    async function cancelAppointment(id: number) {
        Alert.alert("Cancelar Pedido", "Tens a certeza?", [
            { text: "Manter", style: "cancel" },
            { text: "Sim, Cancelar", style: 'destructive', onPress: async () => {
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

        // Container ajustado para o carrossel (centrado)
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

        // --- AGENDAMENTO CARD ---
        return (
            <View style={styles.card}>
                <View style={styles.cardHeader}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.salonName} numberOfLines={1}>{item.salons?.nome_salao}</Text>
                        <Text style={styles.serviceName} numberOfLines={1}>{item.services?.nome}</Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '15' }]}>
                        <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>{getStatusLabel(item.status)}</Text>
                    </View>
                </View>
                <View style={styles.divider} />
                <View style={styles.cardFooter}>
                    <View style={styles.dateTimeContainer}>
                        <Ionicons name="calendar-outline" size={16} color="#666" />
                        <Text style={styles.dateText}>
                            {new Date(item.data_hora).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' })}
                            {' • '}
                            {new Date(item.data_hora).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                    </View>
                    <Text style={styles.priceText}>{item.services?.preco}€</Text>
                </View>
                {item.status === 'pendente' && activeTab === 'upcoming' && (
                    <TouchableOpacity style={styles.cancelBtn} onPress={() => cancelAppointment(item.id)}>
                        <Ionicons name="close-circle-outline" size={18} color="#FF3B30" />
                        <Text style={styles.cancelBtnText}>Cancelar</Text>
                    </TouchableOpacity>
                )}
                {item.status === 'confirmado' && activeTab === 'upcoming' && (
                    <TouchableOpacity style={styles.calendarBtn} onPress={() => addToCalendar(item)}>
                        <Ionicons name="notifications-outline" size={16} color="#007AFF" />
                        <Text style={styles.calendarBtnText}>Calendário</Text>
                    </TouchableOpacity>
                )}
            </View>
        );
    };

    if (loadingProfile) return <View style={styles.center}><ActivityIndicator color="#333" /></View>;

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <ScrollView 
                contentContainerStyle={{ paddingBottom: 100 }}
                refreshControl={<RefreshControl refreshing={loadingData} onRefresh={refreshAllData} />}
            >
                {/* --- HEADER (Conteúdo vertical) --- */}
                <View style={styles.header}>
                    <TouchableOpacity style={styles.avatarContainer} onPress={pickImage} disabled={uploading}>
                        {uploading ? <ActivityIndicator color="#333" /> : profile?.avatar_url ? (
                            <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} />
                        ) : (
                            <Text style={styles.avatarText}>{profile?.name?.charAt(0).toUpperCase() || 'U'}</Text>
                        )}
                        <View style={styles.cameraIconBadge}><Ionicons name="camera" size={14} color="white" /></View>
                    </TouchableOpacity>
                    <View style={styles.nameRow}>
                        <Text style={styles.name}>{profile?.name}</Text>
                        <TouchableOpacity onPress={() => { setNewName(profile?.name || ''); setEditModalVisible(true); }} style={styles.editIconBtn}>
                            <Ionicons name="pencil" size={14} color="#007AFF" />
                        </TouchableOpacity>
                    </View>
                    <Text style={styles.email}>{profile?.email}</Text>
                </View>

                {isSuperAdmin && (
                    <TouchableOpacity style={styles.adminButton} onPress={() => router.push('/super-admin')}>
                        <Ionicons name="shield-checkmark" size={20} color="white" />
                        <Text style={{ color: 'white', fontWeight: 'bold' }}>Super Admin</Text>
                    </TouchableOpacity>
                )}
                {pendingInvites > 0 && (
                    <TouchableOpacity style={styles.inviteCard} onPress={() => router.push('/invites')}>
                        <Ionicons name="mail-unread" size={22} color="white" />
                        <View style={{ flex: 1 }}>
                            <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>Convite Pendente</Text>
                            <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13 }}>Tens {pendingInvites} convite(s).</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color="white" />
                    </TouchableOpacity>
                )}

                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitleBig}>O Meu Espaço</Text>
                </View>

                {/* --- ABAS --- */}
                <View style={styles.tabContainer}>
                    <TouchableOpacity style={[styles.tabBtn, activeTab === 'upcoming' && styles.tabBtnActive]} onPress={() => setActiveTab('upcoming')}>
                        <Text style={[styles.tabText, activeTab === 'upcoming' && styles.tabTextActive]}>Próximas</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.tabBtn, activeTab === 'history' && styles.tabBtnActive]} onPress={() => setActiveTab('history')}>
                        <Text style={[styles.tabText, activeTab === 'history' && styles.tabTextActive]}>Histórico</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.tabBtn, activeTab === 'favorites' && styles.tabBtnActive]} onPress={() => setActiveTab('favorites')}>
                        <Text style={[styles.tabText, activeTab === 'favorites' && styles.tabTextActive]}>Favoritos</Text>
                    </TouchableOpacity>
                </View>

                {/* --- CARROSSEL HORIZONTAL --- */}
                <FlatList
                    data={getDataToShow()}
                    horizontal={true}
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 10 }}
                    keyExtractor={(item) => (activeTab === 'favorites' ? 'fav-'+item.fav_id : 'app-'+item.id)}
                    renderItem={renderItem}
                    ListEmptyComponent={renderEmpty}
                    snapToInterval={CARD_WIDTH + CARD_SPACING} // Efeito magnético no cartão
                    decelerationRate="fast"
                    snapToAlignment="start"
                />

                {/* --- FOOTER (Botões de menu) --- */}
                <View style={{ marginTop: 20 }}>
                    <View style={styles.menuSection}>
                        <TouchableOpacity style={styles.menuItem} onPress={handleLogout}>
                            <View style={[styles.menuIconBg, { backgroundColor: '#FFEBEE' }]}><Ionicons name="log-out-outline" size={20} color="#D32F2F" /></View>
                            <Text style={[styles.menuText, { color: '#D32F2F' }]}>Terminar Sessão</Text>
                        </TouchableOpacity>
                    </View>
                    <View style={styles.footerInfo}><Text style={styles.versionText}>FindIt v1.0.0</Text></View>
                </View>
            </ScrollView>

            {/* MODAL EDITAR NOME */}
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
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8f9fa' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    header: { alignItems: 'center', paddingVertical: 30 },
    avatarContainer: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#e1e1e1', justifyContent: 'center', alignItems: 'center', marginBottom: 15, borderWidth: 3, borderColor: 'white', shadowColor: '#000', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.1, shadowRadius: 5, elevation: 5 },
    avatarImage: { width: '100%', height: '100%', borderRadius: 50, resizeMode: 'cover' },
    avatarText: { fontSize: 40, fontWeight: 'bold', color: '#666' },
    cameraIconBadge: { position: 'absolute', bottom: 0, right: 0, backgroundColor: '#1a1a1a', width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'white' },
    nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 4, marginTop: 10, minWidth: 100 },
    editIconBtn: { position: 'absolute', right: -32, padding: 6, backgroundColor: '#E3F2FD', borderRadius: 15, top: 2 },
    name: { fontSize: 24, fontWeight: 'bold', color: '#333', textAlign: 'center' },
    email: { fontSize: 14, color: '#888', marginTop: 4 },

    adminButton: { backgroundColor: '#FF3B30', padding: 15, borderRadius: 10, marginHorizontal: 20, marginBottom: 20, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 10 },
    inviteCard: { backgroundColor: '#FF9500', padding: 15, borderRadius: 12, marginHorizontal: 20, marginBottom: 20, flexDirection: 'row', alignItems: 'center', gap: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, elevation: 3 },

    sectionHeader: { paddingHorizontal: 20, marginBottom: 10 },
    sectionTitleBig: { fontSize: 20, fontWeight: 'bold', color: '#333' },
    tabContainer: { flexDirection: 'row', paddingHorizontal: 20, marginBottom: 15, borderBottomWidth: 1, borderBottomColor: '#E0E0E0' },
    tabBtn: { marginRight: 20, paddingVertical: 10, borderBottomWidth: 3, borderBottomColor: 'transparent' },
    tabBtnActive: { borderBottomColor: '#1A1A1A' },
    tabText: { fontSize: 15, color: '#999', fontWeight: '600' },
    tabTextActive: { color: '#1A1A1A', fontWeight: 'bold' },

    // --- CARDS COM LARGURA FIXA PARA O CARROSSEL ---
    card: { 
        width: CARD_WIDTH, 
        marginRight: CARD_SPACING, 
        backgroundColor: 'white', borderRadius: 16, padding: 18, 
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 8, elevation: 2 
    },
    favCard: { 
        width: CARD_WIDTH, 
        marginRight: CARD_SPACING, 
        backgroundColor: 'white', borderRadius: 16, overflow: 'hidden', 
        shadowColor: '#000', shadowOffset: {width:0, height:2}, shadowOpacity:0.05, shadowRadius:8, elevation:3 
    },
    
    // Conteúdo dos Cards (Mantido)
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    salonName: { fontSize: 16, fontWeight: 'bold', color: '#1A1A1A', marginBottom: 2, flex: 1 },
    serviceName: { fontSize: 14, color: '#666', fontWeight: '500' },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginLeft: 8 },
    statusText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
    divider: { height: 1, backgroundColor: '#F5F5F5', marginVertical: 12 },
    cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    dateTimeContainer: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    dateText: { fontSize: 14, color: '#444', fontWeight: '500' },
    priceText: { fontSize: 16, fontWeight: 'bold', color: '#1A1A1A' },
    cancelBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, backgroundColor: '#FFF5F5', borderRadius: 10, marginTop: 15, borderWidth: 1, borderColor: '#FFEBEE' },
    cancelBtnText: { color: '#FF3B30', fontWeight: '600', fontSize: 13 },
    calendarBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, backgroundColor: '#F0F8FF', borderRadius: 10, marginTop: 15, borderWidth: 1, borderColor: '#E3F2FD' },
    calendarBtnText: { color: '#007AFF', fontWeight: '600', fontSize: 13 },

    // Favoritos Styles
    favCardImage: { width: '100%', height: 140, resizeMode: 'cover' },
    favCardContent: { padding: 12 },
    favCardTitle: { fontSize: 16, fontWeight: 'bold', color: '#1a1a1a', marginBottom: 2 },
    favLocationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    favCardLocation: { fontSize: 12, fontWeight: '600', color: '#666' },
    favRatingBadge: { position: 'absolute', top: 10, left: 10, backgroundColor: 'white', flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, elevation: 3 },
    favRatingText: { fontWeight: '800', fontSize: 11, color: '#1a1a1a' },
    favRemoveBtn: { position: 'absolute', top: 10, right: 10, backgroundColor: 'white', width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center', elevation: 3 },

    // Empty State
    emptyContainer: { alignItems: 'center', paddingVertical: 20, justifyContent: 'center' },
    emptyIconBg: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#F0F0F0', justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
    emptyTextTitle: { fontSize: 15, fontWeight: 'bold', color: '#333' },
    emptyTextSubtitle: { fontSize: 12, color: '#999', textAlign: 'center' },

    // Footer / Menu Styles
    menuSection: { backgroundColor: 'white', marginHorizontal: 20, marginBottom: 15, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 4, elevation: 2 },
    menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 15, borderBottomWidth: 1, borderBottomColor: '#f9f9f9' },
    menuIconBg: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#f5f5f5', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
    menuText: { flex: 1, fontSize: 15, fontWeight: '500', color: '#333' },
    footerInfo: { alignItems: 'center', marginTop: 10 },
    versionText: { color: '#ccc', fontSize: 12 },

    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
    modalContent: { backgroundColor: 'white', width: '85%', borderRadius: 20, padding: 20, alignItems: 'center', elevation: 5 },
    modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, color: '#333' },
    input: { width: '100%', backgroundColor: '#F5F5F5', borderRadius: 12, padding: 15, fontSize: 16, marginBottom: 20, borderWidth: 1, borderColor: '#EEE' },
    modalButtons: { flexDirection: 'row', gap: 10, width: '100%' },
    modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
    modalBtnCancel: { backgroundColor: '#F5F5F5' },
    modalBtnSave: { backgroundColor: '#1a1a1a' },
    modalBtnTextCancel: { color: '#666', fontWeight: '600' },
    modalBtnTextSave: { color: 'white', fontWeight: 'bold' },
});