import { Ionicons } from '@expo/vector-icons';
import { Session } from '@supabase/supabase-js';
import * as Location from 'expo-location';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    Dimensions,
    Image,
    Modal,
    Platform,
    RefreshControl,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    UIManager,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../supabase';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// --- CONSTANTES ---
const CATEGORIES = ['Todos', 'Cabeleireiro', 'Barbearia', 'Unhas', 'Estética'];
const AUDIENCES = ['Todos', 'Homem', 'Mulher', 'Unissexo'];

// --- CALIBRAÇÃO ---
const SCROLL_DISTANCE = 100; 
const HEADER_INITIAL_HEIGHT = 80; 
const BTN_SIZE = 50;
const NOTIF_BTN_TOP = 80; 
const LIST_TOP_PADDING = 100;

function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; 
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; 
  return d;
}

function deg2rad(deg: number) {
  return deg * (Math.PI / 180);
}

export default function HomeScreen() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [session, setSession] = useState<Session | null>(null);
    const [unreadCount, setUnreadCount] = useState(0);
    
    // --- ESTADO DE LOCALIZAÇÃO ---
    const [userLocation, setUserLocation] = useState<Location.LocationObject | null>(null);

    const scrollY = useRef(new Animated.Value(0)).current;

    const [salons, setSalons] = useState<any[]>([]);
    const [filteredSalons, setFilteredSalons] = useState<any[]>([]);
    
    const [searchText, setSearchText] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('Todos');
    
    // O público começa em 'Todos', mas será atualizado logo a seguir
    const [selectedAudience, setSelectedAudience] = useState('Todos');
    
    const [filterModalVisible, setFilterModalVisible] = useState(false);

    const [reviewModalVisible, setReviewModalVisible] = useState(false);
    const [appointmentToReview, setAppointmentToReview] = useState<any>(null);
    const [rating, setRating] = useState(0);
    const [submittingReview, setSubmittingReview] = useState(false);

    useEffect(() => {
        (async () => {
            let { status } = await Location.requestForegroundPermissionsAsync();
            if (status === 'granted') {
                let location = await Location.getCurrentPositionAsync({});
                setUserLocation(location);
            }
            // Primeiro verifica o género, depois busca os salões
            await checkUserGenderAndFetch();
        })();
        
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
        });

        return () => subscription.unsubscribe();
    }, []);

    useEffect(() => {
        if (userLocation && salons.length > 0) {
            const sorted = calculateDistancesAndSort(salons, userLocation);
            setSalons(sorted); 
        }
    }, [userLocation, salons.length]); 

    useFocusEffect(
        useCallback(() => {
            if (session?.user) {
                fetchUnreadCount(session.user.id);
                checkPendingReview(session.user.id); 
            }
        }, [session])
    );

    useEffect(() => {
        filterData();
    }, [searchText, selectedCategory, selectedAudience, salons]);

    // --- NOVA FUNÇÃO: VERIFICA GÉNERO E INICIA FETCH ---
    async function checkUserGenderAndFetch() {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user?.user_metadata?.gender) {
            const userGender = user.user_metadata.gender;
            // Só aplica se for um valor válido que temos nos filtros
            if (AUDIENCES.includes(userGender)) {
                setSelectedAudience(userGender);
            }
        }
        
        await fetchSalons();
    }

    async function checkPendingReview(userId: string) {
        const { data, error } = await supabase
            .from('appointments')
            .select('*, salons(nome_salao), services(nome)')
            .eq('cliente_id', userId)
            .eq('status', 'concluido')
            .eq('avaliado', false)
            .order('data_hora', { ascending: false })
            .limit(1)
            .single();

        if (data && !error) {
            setAppointmentToReview(data);
            setRating(0); 
            setReviewModalVisible(true);
        }
    }

    async function submitReview() {
        if (rating === 0) {
            Alert.alert("Avaliação", "Por favor seleciona uma classificação de 1 a 5 estrelas.");
            return;
        }
        setSubmittingReview(true);
        try {
            const { error: reviewError } = await supabase.from('reviews').insert({
                salon_id: appointmentToReview.salon_id,
                user_id: session?.user.id,
                rating: rating,
            });
            if (reviewError) throw reviewError;

            const { error: updateError } = await supabase
                .from('appointments')
                .update({ avaliado: true })
                .eq('id', appointmentToReview.id);

            if (updateError) throw updateError;

            Alert.alert("Obrigado!", "A tua avaliação foi registada.");
            setReviewModalVisible(false);
            setAppointmentToReview(null);
            fetchSalons(); 

        } catch (error: any) {
            Alert.alert("Erro", "Não foi possível enviar a avaliação: " + error.message);
        } finally {
            setSubmittingReview(false);
        }
    }

    function skipReview() {
        setReviewModalVisible(false);
    }

    async function fetchUnreadCount(userId: string) {
        const { count, error } = await supabase
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('read', false);
            
        if (!error && count !== null) {
            setUnreadCount(count);
        }
    }

    function calculateDistancesAndSort(salonsData: any[], location: Location.LocationObject) {
        return salonsData.map((salon) => {
            let distance = null;
            if (salon.latitude && salon.longitude && location) {
                distance = getDistanceFromLatLonInKm(
                    location.coords.latitude,
                    location.coords.longitude,
                    salon.latitude,
                    salon.longitude
                );
            }
            return { ...salon, distance };
        }).sort((a, b) => {
            if (a.distance !== null && b.distance !== null) return a.distance - b.distance;
            if (a.distance !== null) return -1;
            if (b.distance !== null) return 1;
            return 0;
        });
    }

    async function fetchSalons() {
        // setLoading(true); // Removido daqui porque já é gerido no checkUserGenderAndFetch
        const { data } = await supabase.from('salons').select('*, reviews(rating)');
        if (data) {
            let processedSalons = data.map((salon: any) => {
                const reviews = salon.reviews || [];
                let avg: number | string = "Novo";
                if (reviews.length > 0) {
                    const total = reviews.reduce((acc: number, r: any) => acc + r.rating, 0);
                    avg = (total / reviews.length).toFixed(1);
                }
                return { ...salon, averageRating: avg };
            });

            if (userLocation) {
                processedSalons = calculateDistancesAndSort(processedSalons, userLocation);
            }

            setSalons(processedSalons);
        }
        setLoading(false);
    }

    function filterData() {
        let result = salons;
        
        if (selectedCategory !== 'Todos') {
            result = result.filter(s => s.categoria && s.categoria.includes(selectedCategory));
        }

        if (selectedAudience !== 'Todos') result = result.filter(s => s.publico === selectedAudience);
        if (searchText !== '') {
            const lowerText = searchText.toLowerCase();
            result = result.filter(s => s.nome_salao.toLowerCase().includes(lowerText) || s.cidade.toLowerCase().includes(lowerText));
        }
        setFilteredSalons(result);
    }

    const hasActiveFilters = selectedCategory !== 'Todos' || selectedAudience !== 'Todos';

    const headerTextOpacity = scrollY.interpolate({
        inputRange: [0, SCROLL_DISTANCE * 0.5],
        outputRange: [1, 0],
        extrapolate: 'clamp',
    });

    const headerTextTranslateY = scrollY.interpolate({
        inputRange: [0, SCROLL_DISTANCE],
        outputRange: [0, -30],
        extrapolate: 'clamp',
    });

    const FINAL_SEARCH_WIDTH = SCREEN_WIDTH - 40 - BTN_SIZE - 15; 
    const searchBarWidth = scrollY.interpolate({
        inputRange: [0, SCROLL_DISTANCE],
        outputRange: [SCREEN_WIDTH - 40, FINAL_SEARCH_WIDTH], 
        extrapolate: 'clamp',
    });

    const searchContainerTranslateY = scrollY.interpolate({
        inputRange: [0, SCROLL_DISTANCE],
        outputRange: [0, -75], 
        extrapolate: 'clamp',
    });

    const headerBgColor = scrollY.interpolate({
        inputRange: [0, SCROLL_DISTANCE],
        outputRange: ['rgba(248, 249, 250, 1)', 'rgba(248, 249, 250, 0)'], 
        extrapolate: 'clamp',
    });

    const renderSalonItem = ({ item }: { item: any }) => (
        <TouchableOpacity 
            style={styles.card} 
            onPress={() => router.push(`/salon/${item.id}`)}
            activeOpacity={0.95}
        >
            <Image source={{ uri: item.imagem || 'https://via.placeholder.com/400x300' }} style={styles.cardImage} />
            
            <View style={styles.badgesContainer}>
                {item.categoria && item.categoria.split(',').map((cat: string, index: number) => (
                    <View key={index} style={styles.categoryPill}>
                        <Text style={styles.categoryPillText}>{cat.trim()}</Text>
                    </View>
                ))}
            </View>
            
            <View style={styles.ratingBadge}>
                <Ionicons name="star" size={12} color="#FFD700" />
                <Text style={styles.ratingText}>{item.averageRating}</Text>
            </View>

            {item.distance !== null && item.distance !== undefined && (
                <View style={styles.distanceBadge}>
                    <Ionicons name="navigate" size={10} color="white" />
                    <Text style={styles.distanceText}>~{item.distance.toFixed(1)} km</Text>
                </View>
            )}

            <View style={styles.cardContent}>
                <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start'}}>
                    <Text style={styles.cardTitle}>{item.nome_salao}</Text>
                    <Ionicons name="chevron-forward" size={20} color="#ccc" />
                </View>
                <View style={styles.locationRow}>
                    <Ionicons name="location-sharp" size={14} color="#666" />
                    <Text style={styles.cardLocation}>{item.cidade}</Text>
                    <Text style={[styles.cardLocation, {color: '#999', fontWeight: '400'}]}> • {item.publico}</Text>
                </View>
                <Text style={styles.cardAddress} numberOfLines={1}>{item.morada}</Text>
            </View>
        </TouchableOpacity>
    );

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            
            <StatusBar style="dark" />

            <Animated.View style={[styles.headerWrapper, { backgroundColor: headerBgColor }]}>
                <View style={styles.headerContent}>
                    
                    <Animated.View 
                        style={{ 
                            opacity: headerTextOpacity, 
                            transform: [{ translateY: headerTextTranslateY }],
                            height: HEADER_INITIAL_HEIGHT,
                            justifyContent: 'center',
                            marginTop: 55, 
                            marginBottom: 10
                        }}
                    >
                        <Text style={styles.headerTitle} numberOfLines={1}>Explorar</Text>
                        <Text style={styles.headerSubtitle} numberOfLines={1}>Encontra o melhor profissional.</Text>
                    </Animated.View>

                    <View style={styles.absoluteNotifBtn}>
                        {session ? (
                            <TouchableOpacity style={styles.notificationBtn} onPress={() => router.push('/notifications')}>
                                <Ionicons name="notifications-outline" size={24} color="#333" />
                                {unreadCount > 0 && (
                                    <View style={styles.badge}>
                                        <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                                    </View>
                                )}
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity style={styles.loginBtn} onPress={() => router.push('/login')}>
                                <Text style={styles.loginText}>Entrar</Text>
                                <Ionicons name="log-in-outline" size={20} color="white" />
                            </TouchableOpacity>
                        )}
                    </View>

                    <Animated.View 
                        style={[
                            styles.searchRow, 
                            { 
                                width: searchBarWidth, 
                                transform: [{ translateY: searchContainerTranslateY }]
                            }
                        ]}
                    >
                        <View style={styles.searchBar}>
                            <Ionicons name="search" size={20} color="#666" style={{marginRight: 8}} />
                            <TextInput 
                                placeholder="Pesquisar..." 
                                placeholderTextColor="#999"
                                style={styles.searchInput}
                                value={searchText}
                                onChangeText={setSearchText}
                            />
                            {searchText.length > 0 && (
                                <TouchableOpacity onPress={() => setSearchText('')}>
                                    <Ionicons name="close-circle" size={18} color="#ccc" />
                                </TouchableOpacity>
                            )}
                        </View>

                        <TouchableOpacity 
                            style={[styles.filterButton, (hasActiveFilters) && styles.filterButtonActive]} 
                            onPress={() => setFilterModalVisible(true)}
                        >
                            <Ionicons name="options-outline" size={22} color={(hasActiveFilters) ? "white" : "#333"} />
                        </TouchableOpacity>
                    </Animated.View>

                </View>
            </Animated.View>

            {loading ? (
                <View style={styles.center}><ActivityIndicator size="large" color="#333" /></View>
            ) : (
                <Animated.FlatList
                    data={filteredSalons}
                    keyExtractor={(item: any) => item.id.toString()}
                    renderItem={renderSalonItem}
                    contentContainerStyle={{ padding: 20, paddingTop: HEADER_INITIAL_HEIGHT + LIST_TOP_PADDING, paddingBottom: 120 }} 
                    showsVerticalScrollIndicator={false}
                    refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchSalons} progressViewOffset={HEADER_INITIAL_HEIGHT + LIST_TOP_PADDING} />}
                    onScroll={Animated.event(
                        [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                        { useNativeDriver: false }
                    )}
                    scrollEventThrottle={16}
                    ListEmptyComponent={
                        <View style={styles.center}>
                            <Ionicons name="search-outline" size={50} color="#ddd" />
                            <Text style={{color: '#999', marginTop: 10}}>Nenhum salão encontrado.</Text>
                        </View>
                    }
                />
            )}

            <Modal
                animationType="fade"
                transparent={true}
                visible={filterModalVisible}
                onRequestClose={() => setFilterModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Filtros</Text>
                            <TouchableOpacity onPress={() => setFilterModalVisible(false)}>
                                <Ionicons name="close" size={24} color="#333" />
                            </TouchableOpacity>
                        </View>
                        <View style={{paddingVertical: 10}}>
                            <View style={styles.sectionHeader}>
                                <Text style={styles.filterSectionTitle}>Categoria</Text>
                                {selectedCategory !== 'Todos' && (
                                    <TouchableOpacity onPress={() => setSelectedCategory('Todos')}>
                                        <Text style={styles.clearBtnText}>Limpar</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                            <View style={styles.chipsContainer}>
                                {CATEGORIES.map((cat) => (
                                    <TouchableOpacity key={cat} style={[styles.chip, selectedCategory === cat && styles.chipActive]} onPress={() => setSelectedCategory(cat)}>
                                        <Text style={[styles.chipText, selectedCategory === cat && styles.chipTextActive]}>{cat}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                            <View style={[styles.sectionHeader, {marginTop: 20}]}>
                                <Text style={styles.filterSectionTitle}>Público</Text>
                                {selectedAudience !== 'Todos' && (
                                    <TouchableOpacity onPress={() => setSelectedAudience('Todos')}>
                                        <Text style={styles.clearBtnText}>Limpar</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                            <View style={styles.chipsContainer}>
                                {AUDIENCES.map((aud) => (
                                    <TouchableOpacity key={aud} style={[styles.chip, selectedAudience === aud && styles.chipAudienceActive]} onPress={() => setSelectedAudience(aud)}>
                                        <Text style={[styles.chipText, selectedAudience === aud && styles.chipTextActive]}>{aud}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                        <TouchableOpacity style={styles.applyButton} onPress={() => setFilterModalVisible(false)}>
                            <Text style={styles.applyButtonText}>Ver Resultados</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <Modal
                animationType="slide"
                transparent={true}
                visible={reviewModalVisible}
                onRequestClose={skipReview}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.reviewModalContent}>
                        <Text style={styles.reviewTitle}>Como foi a experiência?</Text>
                        {appointmentToReview && (
                            <View style={{alignItems: 'center', marginBottom: 20}}>
                                <Text style={styles.reviewSalonName}>{appointmentToReview.salons?.nome_salao}</Text>
                                <Text style={styles.reviewServiceName}>{appointmentToReview.services?.nome}</Text>
                            </View>
                        )}
                        <View style={styles.starsContainer}>
                            {[1, 2, 3, 4, 5].map((star) => (
                                <TouchableOpacity key={star} onPress={() => setRating(star)} activeOpacity={0.7}>
                                    <Ionicons name={star <= rating ? "star" : "star-outline"} size={40} color="#FFD700" />
                                </TouchableOpacity>
                            ))}
                        </View>
                        <TouchableOpacity style={[styles.applyButton, {marginTop: 20, width: '100%'}]} onPress={submitReview} disabled={submittingReview}>
                            {submittingReview ? <ActivityIndicator color="white" /> : <Text style={styles.applyButtonText}>Avaliar</Text>}
                        </TouchableOpacity>
                        <TouchableOpacity style={{marginTop: 15, padding: 10}} onPress={skipReview}>
                            <Text style={{color: '#999', fontWeight: '600'}}>Agora não</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8f9fa' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 50 },
    
    headerWrapper: {
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100, 
        backgroundColor: '#f8f9fa', 
        overflow: 'hidden'
    },
    headerContent: { paddingHorizontal: 20, paddingBottom: 10 },
    
    absoluteNotifBtn: {
        position: 'absolute',
        top: NOTIF_BTN_TOP, 
        right: 20,
        zIndex: 20,
    },

    headerTitle: { fontSize: 32, fontWeight: '800', color: '#1a1a1a', letterSpacing: -0.5 },
    headerSubtitle: { fontSize: 16, color: '#666', marginTop: 2 },
    
    loginBtn: { 
        backgroundColor: '#1a1a1a', 
        flexDirection: 'row', 
        alignItems: 'center', 
        paddingVertical: 8, 
        paddingHorizontal: 16, 
        borderRadius: 30, 
        gap: 6,
        height: BTN_SIZE 
    },
    loginText: { color: 'white', fontWeight: '600', fontSize: 13 },
    
    notificationBtn: {
        width: BTN_SIZE, height: BTN_SIZE,
        backgroundColor: 'white',
        borderRadius: BTN_SIZE / 2,
        justifyContent: 'center', alignItems: 'center',
        shadowColor: '#000', shadowOffset: {width:0, height:2}, shadowOpacity:0.05, shadowRadius:5, elevation:2,
    },
    badge: {
        position: 'absolute', top: -2, right: -2,
        backgroundColor: '#FF3B30', minWidth: 18, height: 18, borderRadius: 9,
        justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#f8f9fa'
    },
    badgeText: { color: 'white', fontSize: 9, fontWeight: 'bold' },
    
    searchRow: { flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: 10 },
    searchBar: { 
        flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', 
        borderRadius: 25, paddingHorizontal: 16, height: BTN_SIZE,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 5, elevation: 2
    },
    searchInput: { flex: 1, fontSize: 15, color: '#1a1a1a', marginLeft: 5 },
    
    filterButton: { 
        width: BTN_SIZE, height: BTN_SIZE, backgroundColor: 'white', borderRadius: 25, 
        justifyContent: 'center', alignItems: 'center',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 5, elevation: 2
    },
    filterButtonActive: { backgroundColor: '#1a1a1a', shadowOpacity: 0.2 },

    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20
    },
    modalContent: {
        backgroundColor: 'white',
        width: '100%',
        borderRadius: 20,
        padding: 20,
        shadowColor: '#000', shadowOffset: {width:0,height:2}, shadowOpacity:0.25, shadowRadius:4, elevation:5
    },
    modalHeader: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20
    },
    modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#1a1a1a' },
    
    chipsContainer: {
        flexDirection: 'row', flexWrap: 'wrap', gap: 8
    },

    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    filterSectionTitle: { fontSize: 12, fontWeight: '700', color: '#999', textTransform: 'uppercase', letterSpacing: 0.5 },
    clearBtnText: { color: '#FF3B30', fontSize: 12, fontWeight: '600' },
    
    chip: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20, backgroundColor: 'white', borderWidth: 1, borderColor: '#f0f0f0' },
    chipActive: { backgroundColor: '#1a1a1a', borderColor: '#1a1a1a' },
    chipAudienceActive: { backgroundColor: '#007AFF', borderColor: '#007AFF' },
    chipText: { fontWeight: '600', color: '#666', fontSize: 13 },
    chipTextActive: { color: 'white' },

    applyButton: {
        backgroundColor: '#1a1a1a', padding: 15, borderRadius: 15, alignItems: 'center', marginTop: 25
    },
    applyButtonText: { color: 'white', fontWeight: 'bold', fontSize: 16 },

    card: { backgroundColor: 'white', borderRadius: 20, marginBottom: 20, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 3 },
    cardImage: { width: '100%', height: 190, resizeMode: 'cover' },
    cardContent: { padding: 18 },
    cardTitle: { fontSize: 20, fontWeight: 'bold', color: '#1a1a1a', marginBottom: 6 },
    locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
    cardLocation: { fontSize: 14, fontWeight: '600', color: '#666' },
    cardAddress: { fontSize: 13, color: '#999' },
    
    // --- ALTERAÇÃO AQUI: NOMES NOVOS PARA EVITAR CONFLITO ---
    badgesContainer: {
        position: 'absolute',
        top: 15,
        left: 15,
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
        maxWidth: '75%', 
        zIndex: 10
    },
    categoryPill: { // Era badgeItem
        backgroundColor: 'rgba(0,0,0,0.85)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
    },
    categoryPillText: { // Era badgeText
        color: 'white',
        fontSize: 12, 
        fontWeight: 'bold',
        textTransform: 'uppercase',
        letterSpacing: 0.5
    },
    
    ratingBadge: { position: 'absolute', top: 15, right: 15, backgroundColor: 'white', flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, shadowColor: '#000', shadowOpacity: 0.15, elevation: 3 },
    ratingText: { fontWeight: '800', fontSize: 12, color: '#1a1a1a' },

    distanceBadge: {
        position: 'absolute', top: 50, right: 15, 
        backgroundColor: '#1a1a1a', 
        flexDirection: 'row', alignItems: 'center', gap: 4, 
        paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, 
        shadowColor: '#000', shadowOpacity: 0.2, elevation: 3
    },
    distanceText: { fontWeight: '600', fontSize: 10, color: 'white' },

    reviewModalContent: {
        backgroundColor: 'white',
        width: '90%',
        borderRadius: 20,
        padding: 24,
        alignItems: 'center',
        shadowColor: '#000', shadowOffset: {width:0,height:4}, shadowOpacity:0.3, shadowRadius:8, elevation:10
    },
    reviewTitle: { fontSize: 20, fontWeight: 'bold', color: '#1a1a1a', marginBottom: 15, textAlign: 'center' },
    reviewSalonName: { fontSize: 16, fontWeight: '600', color: '#333' },
    reviewServiceName: { fontSize: 14, color: '#666', marginTop: 2 },
    starsContainer: { flexDirection: 'row', gap: 8, marginVertical: 10 },
});