import { Ionicons } from '@expo/vector-icons';
import * as Calendar from 'expo-calendar';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    Dimensions,
    FlatList,
    Image,
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    PanResponder,
    Platform,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../supabase';
import { sendNotification } from '../../utils/notifications';

const { width } = Dimensions.get('window');
const SIDE_PADDING = 20; // Padding lateral usado no menu e no carrossel
const CARD_WIDTH = width - (SIDE_PADDING * 2); // Largura total menos as margens (igual aos botões)
const CARD_SPACING = 15; // Espaço entre cartões

// --- TIPOS DE DADOS ---
type Appointment = {
    id: number;
    data_hora: string;
    status: string;
    services: { nome: string; preco: number };
    salons: { nome_salao: string; morada: string; cidade: string; intervalo_minutos: number; dono_id?: string };
    salon_id: number;
    calendarAdded?: boolean;
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
        if (activeTab === 'upcoming') return 305; // Mais alto (tem botões)
        return 260; // Mais baixo (Histórico e Favoritos não têm botões em baixo)
    };

    // --- LÓGICA DE ANIMAÇÃO E ARRASTAR (DRAG) ---
    // --- LÓGICA DE ANIMAÇÃO DO MODAL DE DEFINIÇÕES ---
    // Variável de animação (inicia fora do ecrã)
    const slideAnim = useRef(new Animated.Value(Dimensions.get('window').height)).current;

    // Função disparada quando o Modal termina de abrir (onShow)
    const onModalShow = useCallback(() => {
        // Garante que começa na posição "escondida" (em baixo)
        slideAnim.setValue(Dimensions.get('window').height);
        // Anima para cima (posição 0)
        Animated.spring(slideAnim, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 4,
            speed: 12
        }).start();
    }, []);

    // Função para fechar (anima para baixo e depois fecha o modal)
    const closeSettings = useCallback(() => {
        Animated.timing(slideAnim, {
            toValue: Dimensions.get('window').height,
            duration: 250,
            useNativeDriver: true
        }).start(() => setSettingsModalVisible(false));
    }, []);

    // Gestor de arrastar (PanResponder)
    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: (_, gestureState) => gestureState.dy > 5,
            onPanResponderMove: (_, gestureState) => {
                // Se arrastar para baixo, acompanha o dedo
                if (gestureState.dy > 0) slideAnim.setValue(gestureState.dy);
            },
            onPanResponderRelease: (_, gestureState) => {
                // Se arrastar mais de 150px ou for rápido, fecha
                if (gestureState.dy > 150 || gestureState.vy > 0.5) {
                    closeSettings();
                } else {
                    // Senão, volta à posição original
                    Animated.spring(slideAnim, {
                        toValue: 0,
                        bounciness: 4,
                        useNativeDriver: true
                    }).start();
                }
            },
        })
    ).current;


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

            // --- ATUALIZAÇÃO DO ESTADO AQUI ---
            setAppointments(prev => prev.map(appt =>
                appt.id === item.id ? { ...appt, calendarAdded: true } : appt
            ));

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
                            // --- LÓGICA DO BOTÃO CALENDÁRIO ALTERADA ---
                            item.calendarAdded ? (
                                <TouchableOpacity style={[styles.actionBtnOutline, { borderColor: '#E0E0E0', backgroundColor: '#FAFAFA' }]} disabled={true}>
                                    <Ionicons name="checkmark-circle" size={14} color="#4CD964" />
                                    <Text style={[styles.actionBtnText, { color: '#4CD964' }]}>Adicionado</Text>
                                </TouchableOpacity>
                            ) : (
                                <TouchableOpacity style={styles.actionBtnOutline} onPress={() => addToCalendar(item)}>
                                    <Ionicons name="calendar" size={14} color="#007AFF" />
                                    <Text style={[styles.actionBtnText, { color: '#007AFF' }]}>Adicionar</Text>
                                </TouchableOpacity>
                            )
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
            {/* contentContainer com space-between empurra o menu para o fundo */}
            <View style={styles.contentContainer}>

                {/* --- BLOCO SUPERIOR (Conteúdo que muda de tamanho) --- */}
                <View>
                    {/* 1. HEADER */}
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

                    {/* 2. ALERTAS */}
                    <View style={styles.alertsContainer}>
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
                                    <Text style={styles.inviteTitle}>Tens 1 convite pendente</Text>
                                </View>
                                <Ionicons name="chevron-forward" size={18} color="#CCC" />
                            </TouchableOpacity>
                        )}
                    </View>

                    {/* 3. TABS */}
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

                    {/* 4. CARROSSEL */}
                    {/* A altura muda aqui, mas como o menu está fixo em baixo, não afeta a posição dele */}
                    <View style={{ height: getCarouselHeight() }}>
                        <FlatList
                            data={getDataToShow()}
                            horizontal={true}
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={{ paddingHorizontal: 20 }}
                            keyExtractor={(item) => (activeTab === 'favorites' ? 'fav-' + item.fav_id : 'app-' + item.id)}
                            renderItem={renderItem}
                            ListEmptyComponent={renderEmpty}
                            snapToInterval={CARD_WIDTH + CARD_SPACING}
                            decelerationRate="fast"
                            snapToAlignment="start"
                        />
                    </View>
                </View>

                {/* --- BLOCO INFERIOR (MENU FIXO) --- */}
                <View style={styles.bottomMenuContainer}>
                    <TouchableOpacity style={styles.minimalRow} onPress={() => setSettingsModalVisible(true)}>
                        <View style={styles.minimalIconBox}>
                            <Ionicons name="settings-outline" size={20} color="#1A1A1A" />
                        </View>
                        <Text style={styles.minimalText}>Definições</Text>
                        <Ionicons name="chevron-forward" size={16} color="#E0E0E0" />
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.minimalRow} onPress={handleLogout}>
                        <View style={[styles.minimalIconBox, { backgroundColor: '#FFF5F5' }]}>
                            <Ionicons name="log-out-outline" size={20} color="#FF3B30" />
                        </View>
                        <Text style={[styles.minimalText, { color: '#FF3B30' }]}>Terminar Sessão</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* --- MODAIS (Mantêm-se iguais) --- */}
            {/* Modal Editar Nome */}
            <Modal animationType="slide" transparent={true} visible={editModalVisible} onRequestClose={() => setEditModalVisible(false)}>
                <TouchableWithoutFeedback onPress={() => setEditModalVisible(false)}>
                    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.bottomModalOverlay}>
                        <TouchableWithoutFeedback onPress={() => Keyboard.dismiss()}>
                            <View style={styles.bottomModalContent}>
                                <View style={styles.modalHandle} />
                                <Text style={styles.modalTitle}>Editar Nome</Text>
                                <TextInput style={styles.input} value={newName} onChangeText={setNewName} placeholder="O teu nome" autoFocus={true} />
                                <View style={styles.modalButtons}>
                                    <TouchableOpacity style={[styles.modalBtn, styles.modalBtnCancel]} onPress={() => setEditModalVisible(false)}><Text style={styles.modalBtnTextCancel}>Cancelar</Text></TouchableOpacity>
                                    <TouchableOpacity style={[styles.modalBtn, styles.modalBtnSave]} onPress={saveName} disabled={savingName}>{savingName ? <ActivityIndicator color="white" size="small" /> : <Text style={styles.modalBtnTextSave}>Guardar</Text>}</TouchableOpacity>
                                </View>
                            </View>
                        </TouchableWithoutFeedback>
                    </KeyboardAvoidingView>
                </TouchableWithoutFeedback>
            </Modal>

            {/* Modal Definições */}
            <Modal animationType="fade" transparent={true} visible={settingsModalVisible} onRequestClose={closeSettings} onShow={onModalShow}>
                <TouchableWithoutFeedback onPress={closeSettings}>
                    <View style={styles.bottomModalOverlay}>
                        <TouchableWithoutFeedback>
                            <Animated.View style={[styles.bottomModalContent, { transform: [{ translateY: slideAnim }] }]}>
                                <View style={{ width: '100%', alignItems: 'center' }} {...panResponder.panHandlers}>
                                    <View style={styles.modalHandle} />
                                    <View style={[styles.modalHeader, { justifyContent: 'center', marginBottom: 25 }]}>
                                        <Text style={styles.modalTitle}>Definições</Text>
                                    </View>
                                </View>
                                <View style={styles.settingRow}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.settingLabel}>Notificações</Text>
                                        <Text style={styles.settingSubLabel}>Receber alertas de marcações</Text>
                                    </View>
                                    <Switch trackColor={{ false: "#E0E0E0", true: "#1A1A1A" }} thumbColor={"#FFFFFF"} onValueChange={setNotificationsEnabled} value={notificationsEnabled} />
                                </View>
                                <View style={styles.divider} />
                                <View style={styles.settingRow}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.settingLabel}>Modo Escuro</Text>
                                        <Text style={styles.settingSubLabel}>Ajustar aparência da app</Text>
                                    </View>
                                    <Switch trackColor={{ false: "#E0E0E0", true: "#1A1A1A" }} thumbColor={"#FFFFFF"} onValueChange={setDarkModeEnabled} value={darkModeEnabled} />
                                </View>
                                <View style={styles.divider} />
                                <TouchableOpacity style={styles.settingLinkRow} onPress={() => Alert.alert("Info", "Página de Termos")}>
                                    <Text style={styles.settingLabel}>Termos e Condições</Text>
                                    <Ionicons name="chevron-forward" size={16} color="#CCC" />
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.settingLinkRow} onPress={() => Alert.alert("Atenção", "Esta ação apagaria a conta.")}>
                                    <Text style={[styles.settingLabel, { color: '#FF3B30' }]}>Apagar Conta</Text>
                                </TouchableOpacity>
                            </Animated.View>
                        </TouchableWithoutFeedback>
                    </View>
                </TouchableWithoutFeedback>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#FAFAFA' },

    contentContainer: { flex: 1, justifyContent: 'space-between' },

    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    // HEADER
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingTop: 50,
        paddingBottom: 10, // Reduzi para aproximar os elementos
        backgroundColor: '#FAFAFA'
    },
    avatarContainer: {
        width: 70, height: 70, borderRadius: 35,
        backgroundColor: '#F0F0F0',
        justifyContent: 'center', alignItems: 'center',
        marginRight: 16,
        borderWidth: 3, borderColor: 'white',
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 4
    },
    avatarImage: { width: '100%', height: '100%', borderRadius: 35, resizeMode: 'cover' },
    avatarText: { fontSize: 28, fontWeight: 'bold', color: '#BBB' },
    cameraIconBadge: {
        position: 'absolute', bottom: -2, right: -2, backgroundColor: '#1A1A1A', width: 24, height: 24, borderRadius: 12,
        justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'white'
    },
    headerInfo: { flex: 1, justifyContent: 'center' },
    nameRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
    name: { fontSize: 22, fontWeight: '800', color: '#1A1A1A', letterSpacing: -0.5, flexShrink: 1 },
    email: { fontSize: 13, color: '#888', fontWeight: '500' },
    editIconBtn: { padding: 6, marginLeft: 2 },

    // ALERTAS
    alertsContainer: { marginBottom: 5 }, // Margem reduzida
    adminButton: {
        backgroundColor: '#FF3B30', paddingVertical: 10, paddingHorizontal: 15,
        borderRadius: 12, marginHorizontal: 20, marginBottom: 10,
        flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8
    },
    inviteCard: {
        backgroundColor: 'white', padding: 12, borderRadius: 14, marginHorizontal: 20, marginBottom: 10,
        flexDirection: 'row', alignItems: 'center', gap: 10,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 6, elevation: 2,
        borderWidth: 1, borderColor: '#F0F0F0'
    },
    inviteIconBox: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#FFF3E0', justifyContent: 'center', alignItems: 'center' },
    inviteTitle: { fontSize: 13, fontWeight: 'bold', color: '#1A1A1A' },

    // TABS (Puxadas para cima)
    pillContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
        marginTop: 15, // <--- Reduzido de 20 para 5 (Puxa para cima)
        marginBottom: 20,
        paddingHorizontal: 20
    },
    pillBtn: {
        paddingVertical: 10, paddingHorizontal: 18, borderRadius: 24, backgroundColor: '#EFEFEF',
    },
    pillBtnActive: { backgroundColor: '#1A1A1A' },
    pillText: { fontSize: 13, fontWeight: '600', color: '#888' },
    pillTextActive: { color: 'white' },

    // CARDS
    card: {
        width: CARD_WIDTH,
        marginRight: CARD_SPACING,
        backgroundColor: 'white',
        borderRadius: 24,
        shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.08, shadowRadius: 15, elevation: 6,
        overflow: 'hidden',
        height: '98%', // Aumentado para usar todo o espaço disponível
        borderWidth: 1, borderColor: '#F5F5F5',
        marginTop: 2
    },
    favCard: {
        width: CARD_WIDTH, marginRight: CARD_SPACING, backgroundColor: 'white', borderRadius: 20, overflow: 'hidden',
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 4,
        height: '98%', // Aumentado
        marginTop: 2
    },

    // Conteúdo Card
    cardImageContainer: { height: 150, width: '100%', position: 'relative' },
    cardImage: { width: '100%', height: '100%', resizeMode: 'cover' },
    cardOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.1)' },

    dateBadge: { position: 'absolute', top: 12, left: 12, backgroundColor: 'white', borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
    dateBadgeDay: { fontSize: 18, fontWeight: '800', color: '#1A1A1A', lineHeight: 20 },
    dateBadgeMonth: { fontSize: 10, fontWeight: '700', color: '#888', textTransform: 'uppercase' },
    statusPill: { position: 'absolute', top: 12, right: 12, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 20, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
    statusPillText: { color: 'white', fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase' },

    cardContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 0, flexDirection: 'row', alignItems: 'center' }, // paddingBottom 0 para dar espaço aos botões
    cardTitle: { fontSize: 19, fontWeight: 'bold', color: '#1A1A1A', marginBottom: 4 },
    cardService: { fontSize: 15, color: '#666', fontWeight: '500', marginBottom: 6 },
    cardLocationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    cardMetaText: { fontSize: 13, color: '#888', fontWeight: '500' },
    cardDot: { fontSize: 10, color: '#DDD', marginHorizontal: 2 },
    priceTag: { backgroundColor: '#F5F5F5', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10 },
    priceTagText: { fontSize: 17, fontWeight: '800', color: '#1A1A1A' },

    cardActions: { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 15, gap: 10, marginTop: 'auto' }, // Padding bottom garantido
    actionBtnOutline: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: '#E5E5EA', backgroundColor: 'transparent' },
    actionBtnFilled: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 14, backgroundColor: '#1A1A1A' },
    actionBtnText: { fontSize: 14, fontWeight: '700' },
    actionBtnTextFilled: { fontSize: 14, fontWeight: '700', color: 'white' },

    // Fav Card Details
    favCardImage: { width: '100%', height: 180, resizeMode: 'cover' },
    favCardContent: { padding: 18 },
    favCardTitle: { fontSize: 18, fontWeight: 'bold', color: '#1a1a1a', marginBottom: 4 },
    favLocationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    favCardLocation: { fontSize: 14, fontWeight: '600', color: '#666' },
    favRatingBadge: { position: 'absolute', top: 12, left: 12, backgroundColor: 'white', flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, elevation: 3 },
    favRatingText: { fontWeight: '800', fontSize: 11, color: '#1a1a1a' },
    favRemoveBtn: { position: 'absolute', top: 12, right: 12, backgroundColor: 'white', width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center', elevation: 3 },

    // Empty State
    emptyContainer: { alignItems: 'center', justifyContent: 'center', width: width - 40, height: '100%' },
    emptyIconBg: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#F5F5F5', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
    emptyTextTitle: { fontSize: 18, fontWeight: 'bold', color: '#333' },
    emptyTextSubtitle: { fontSize: 14, color: '#999', textAlign: 'center' },

    // MENU INFERIOR
    bottomMenuContainer: {
        paddingHorizontal: 20,
        paddingBottom: 80
    },
    minimalRow: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: 'white',
        paddingVertical: 18,
        paddingHorizontal: 20, borderRadius: 24, marginBottom: 15,
        borderWidth: 1, borderColor: '#F5F5F5',
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.03, shadowRadius: 10, elevation: 1,
    },
    minimalIconBox: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F9F9F9', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
    minimalText: { flex: 1, fontSize: 15, fontWeight: '600', color: '#1A1A1A' },
    versionText: { color: '#DDD', fontSize: 12, fontWeight: '500' },

    // MODAL
    bottomModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    bottomModalContent: { backgroundColor: 'white', width: '100%', borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 24, paddingBottom: 40, alignItems: 'center', elevation: 10 },
    modalHandle: { width: 40, height: 4, backgroundColor: '#E0E0E0', borderRadius: 2, marginBottom: 20, alignSelf: 'center' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 20 },
    modalTitle: { fontSize: 20, fontWeight: '800', marginBottom: 8, color: '#1A1A1A' },
    input: { width: '100%', backgroundColor: '#F7F7F7', borderRadius: 14, padding: 16, fontSize: 16, marginBottom: 20 },
    modalButtons: { flexDirection: 'row', gap: 12, width: '100%' },
    modalBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
    modalBtnCancel: { backgroundColor: '#F5F5F5' },
    modalBtnSave: { backgroundColor: '#1A1A1A' },
    modalBtnTextCancel: { color: '#666', fontWeight: '700' },
    modalBtnTextSave: { color: 'white', fontWeight: '800' },
    settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', paddingVertical: 12 },
    settingLinkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', paddingVertical: 15 },
    settingLabel: { fontSize: 16, fontWeight: '600', color: '#1A1A1A' },
    settingSubLabel: { fontSize: 12, color: '#888', marginTop: 2 },
    divider: { height: 1, backgroundColor: '#F0F0F0', width: '100%', marginVertical: 5 },
});