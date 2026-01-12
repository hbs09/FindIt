import { Ionicons } from '@expo/vector-icons';
import { Session } from '@supabase/supabase-js';
import { useFocusEffect, useRouter } from 'expo-router'; // Adicionado useFocusEffect
import { useCallback, useEffect, useState } from 'react'; // Adicionado useCallback
import {
    ActivityIndicator,
    FlatList,
    Image,
    LayoutAnimation,
    Platform,
    RefreshControl,
    ScrollView,
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

type Salon = {
    id: number;
    nome_salao: string;
    imagem: string;
    morada: string;
    cidade: string;
    categoria: string;
    publico: string; 
    averageRating?: number | string;
};

const CATEGORIES = ['Todos', 'Cabeleireiro', 'Barbearia', 'Unhas', 'Estética'];
const AUDIENCES = ['Todos', 'Homem', 'Mulher', 'Unissexo'];

export default function HomeScreen() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [session, setSession] = useState<Session | null>(null);
    
    // Notificações
    const [unreadCount, setUnreadCount] = useState(0);

    const [salons, setSalons] = useState<Salon[]>([]);
    const [filteredSalons, setFilteredSalons] = useState<Salon[]>([]);
    
    // Filtros
    const [searchText, setSearchText] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('Todos');
    const [selectedAudience, setSelectedAudience] = useState('Todos');
    const [showFilters, setShowFilters] = useState(false);

    useEffect(() => {
        fetchSalons();
        checkSession();
    }, []);

    // Atualiza o contador de notificações sempre que o ecrã ganha foco (ex: ao voltar das notificações)
    useFocusEffect(
        useCallback(() => {
            if (session?.user) {
                fetchUnreadCount(session.user.id);
            }
        }, [session])
    );

    useEffect(() => {
        filterData();
    }, [searchText, selectedCategory, selectedAudience, salons]);

    function checkSession() {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            if (session?.user) fetchUnreadCount(session.user.id);
        });
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            if (session?.user) fetchUnreadCount(session.user.id);
        });
        return () => subscription.unsubscribe();
    }

    // --- NOVA LÓGICA DE NOTIFICAÇÕES ---
    async function fetchUnreadCount(userId: string) {
        const { count, error } = await supabase
            .from('notifications')
            .select('*', { count: 'exact', head: true }) // Conta sem trazer os dados todos
            .eq('user_id', userId)
            .eq('read', false);

        if (count !== null) setUnreadCount(count);
    }
    // -----------------------------------

    async function fetchSalons() {
        setLoading(true);
        const { data, error } = await supabase
            .from('salons')
            .select('*, reviews(rating)');
            
        if (data) {
            const salonsWithRating = data.map((salon: any) => {
                const reviews = salon.reviews || [];
                let avg: number | string = "Novo";
                
                if (reviews.length > 0) {
                    const total = reviews.reduce((acc: number, r: any) => acc + r.rating, 0);
                    avg = (total / reviews.length).toFixed(1);
                }

                return { ...salon, averageRating: avg };
            });
            setSalons(salonsWithRating);
        }
        setLoading(false);
    }

    function filterData() {
        let result = salons;
        if (selectedCategory !== 'Todos') {
            result = result.filter(s => s.categoria === selectedCategory);
        }
        if (selectedAudience !== 'Todos') {
            result = result.filter(s => s.publico === selectedAudience);
        }
        if (searchText !== '') {
            const lowerText = searchText.toLowerCase();
            result = result.filter(s => 
                s.nome_salao.toLowerCase().includes(lowerText) ||
                s.cidade.toLowerCase().includes(lowerText)
            );
        }
        setFilteredSalons(result);
    }

    function toggleFilters() {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setShowFilters(!showFilters);
    }

    function clearFilters() {
        setSelectedCategory('Todos');
        setSelectedAudience('Todos');
        setSearchText('');
    }

    const hasActiveFilters = selectedCategory !== 'Todos' || selectedAudience !== 'Todos';

    const renderSalonItem = ({ item }: { item: Salon }) => (
        <TouchableOpacity 
            style={styles.card} 
            onPress={() => router.push(`/salon/${item.id}`)}
            activeOpacity={0.95}
        >
            <Image source={{ uri: item.imagem || 'https://via.placeholder.com/400x300' }} style={styles.cardImage} />
            
            <View style={styles.categoryBadge}>
                <Text style={styles.categoryBadgeText}>{item.categoria}</Text>
            </View>

            <View style={styles.ratingBadge}>
                <Ionicons name="star" size={12} color="#FFD700" />
                <Text style={styles.ratingText}>{item.averageRating}</Text>
            </View>

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
            
            <View style={styles.headerContainer}>
                {/* Header Title Row */}
                <View style={styles.topRow}>
                    <View>
                        <Text style={styles.headerTitle}>Explorar</Text>
                        <Text style={styles.headerSubtitle}>Encontra o melhor profissional.</Text>
                    </View>

                    {/* BOTÃO DE NOTIFICAÇÕES COM BADGE */}
                    {session ? (
                        <TouchableOpacity 
                            style={styles.notificationBtn}
                            onPress={() => router.push('/notifications')}
                        >
                            <Ionicons name="notifications-outline" size={24} color="#333" />
                            
                            {/* BOLINHA VERMELHA SE HOUVER NÃO LIDAS */}
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

                {/* SEARCH + FILTER BUTTON ROW */}
                <View style={styles.searchRow}>
                    <View style={styles.searchBar}>
                        <Ionicons name="search" size={20} color="#666" style={{marginRight: 8}} />
                        <TextInput 
                            placeholder="O que procuras?" 
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
                        style={[styles.filterButton, (showFilters || hasActiveFilters) && styles.filterButtonActive]} 
                        onPress={toggleFilters}
                    >
                        <Ionicons 
                            name="options-outline" 
                            size={22} 
                            color={(showFilters || hasActiveFilters) ? "white" : "#333"} 
                        />
                    </TouchableOpacity>
                </View>

                {/* PAINEL DE FILTROS */}
                {showFilters && (
                    <View style={styles.filtersPanel}>
                        <View style={styles.sectionHeader}>
                            <Text style={styles.filterSectionTitle}>Categoria</Text>
                            {hasActiveFilters && (
                                <TouchableOpacity onPress={clearFilters} style={styles.clearBtn}>
                                    <Text style={styles.clearBtnText}>Limpar</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap: 8, paddingBottom: 15}}>
                            {CATEGORIES.map((cat) => (
                                <TouchableOpacity key={cat} style={[styles.chip, selectedCategory === cat && styles.chipActive]} onPress={() => setSelectedCategory(cat)}>
                                    <Text style={[styles.chipText, selectedCategory === cat && styles.chipTextActive]}>{cat}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        <View style={styles.sectionHeader}>
                            <Text style={styles.filterSectionTitle}>Público</Text>
                        </View>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap: 8}}>
                            {AUDIENCES.map((aud) => (
                                <TouchableOpacity key={aud} style={[styles.chip, selectedAudience === aud && styles.chipAudienceActive]} onPress={() => setSelectedAudience(aud)}>
                                    <Text style={[styles.chipText, selectedAudience === aud && styles.chipTextActive]}>{aud}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                )}
            </View>

            {loading ? (
                <View style={styles.center}><ActivityIndicator size="large" color="#333" /></View>
            ) : (
                <FlatList
                    data={filteredSalons}
                    keyExtractor={(item) => item.id.toString()}
                    renderItem={renderSalonItem}
                    contentContainerStyle={{ padding: 20, paddingTop: 10, paddingBottom: 120 }} 
                    showsVerticalScrollIndicator={false}
                    refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchSalons} />}
                    ListEmptyComponent={
                        <View style={styles.center}>
                            <Ionicons name="search-outline" size={50} color="#ddd" />
                            <Text style={{color: '#999', marginTop: 10}}>Nenhum salão encontrado.</Text>
                        </View>
                    }
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8f9fa' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 50 },
    
    headerContainer: { 
        paddingHorizontal: 20, 
        paddingTop: 10, 
        paddingBottom: 20, 
        backgroundColor: '#f8f9fa', 
    },
    topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    headerTitle: { fontSize: 32, fontWeight: '800', color: '#1a1a1a', letterSpacing: -0.5 },
    headerSubtitle: { fontSize: 16, color: '#666', marginTop: 2 },
    
    loginBtn: { backgroundColor: '#1a1a1a', flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 30, gap: 6 },
    loginText: { color: 'white', fontWeight: '600', fontSize: 13 },
    
    // NOTIFICATION BTN & BADGE
    notificationBtn: {
        width: 45, height: 45,
        backgroundColor: 'white',
        borderRadius: 25,
        justifyContent: 'center', alignItems: 'center',
        shadowColor: '#000', shadowOffset: {width:0, height:2}, shadowOpacity:0.05, shadowRadius:5, elevation:2,
        position: 'relative' // Importante para o badge absoluto
    },
    badge: {
        position: 'absolute',
        top: -2, right: -2,
        backgroundColor: '#FF3B30',
        minWidth: 18, height: 18,
        borderRadius: 9,
        justifyContent: 'center', alignItems: 'center',
        borderWidth: 2, borderColor: '#f8f9fa'
    },
    badgeText: { color: 'white', fontSize: 9, fontWeight: 'bold' },
    
    searchRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
    searchBar: { 
        flex: 1, 
        flexDirection: 'row', 
        alignItems: 'center', 
        backgroundColor: 'white', 
        borderRadius: 25, 
        paddingHorizontal: 16, 
        height: 50,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 5, elevation: 2
    },
    searchInput: { flex: 1, fontSize: 15, color: '#1a1a1a', marginLeft: 5 },
    
    filterButton: { 
        width: 50, 
        height: 50, 
        backgroundColor: 'white', 
        borderRadius: 25, 
        justifyContent: 'center', 
        alignItems: 'center',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 5, elevation: 2
    },
    filterButtonActive: { 
        backgroundColor: '#1a1a1a', 
        shadowOpacity: 0.2,
    },

    filtersPanel: { marginTop: 20 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    filterSectionTitle: { fontSize: 12, fontWeight: '700', color: '#999', textTransform: 'uppercase', letterSpacing: 0.5 },
    clearBtn: { paddingVertical: 4, paddingHorizontal: 8 },
    clearBtnText: { color: '#FF3B30', fontSize: 12, fontWeight: '600' },
    
    chip: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20, backgroundColor: 'white', borderWidth: 1, borderColor: '#f0f0f0', marginRight: 0 },
    chipActive: { backgroundColor: '#1a1a1a', borderColor: '#1a1a1a' },
    chipAudienceActive: { backgroundColor: '#007AFF', borderColor: '#007AFF' },
    chipText: { fontWeight: '600', color: '#666', fontSize: 13 },
    chipTextActive: { color: 'white' },

    card: { backgroundColor: 'white', borderRadius: 20, marginBottom: 20, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 3 },
    cardImage: { width: '100%', height: 190, resizeMode: 'cover' },
    cardContent: { padding: 18 },
    cardTitle: { fontSize: 20, fontWeight: 'bold', color: '#1a1a1a', marginBottom: 6 },
    locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
    cardLocation: { fontSize: 14, fontWeight: '600', color: '#666' },
    cardAddress: { fontSize: 13, color: '#999' },
    
    categoryBadge: { position: 'absolute', top: 15, left: 15, backgroundColor: 'rgba(0,0,0,0.75)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
    categoryBadgeText: { color: 'white', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
    
    ratingBadge: { position: 'absolute', top: 15, right: 15, backgroundColor: 'white', flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, shadowColor: '#000', shadowOpacity: 0.15, elevation: 3 },
    ratingText: { fontWeight: '800', fontSize: 12, color: '#1a1a1a' },
});