import { Ionicons } from '@expo/vector-icons';
import { Session } from '@supabase/supabase-js';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
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
    View
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
    averageRating?: number | string; // <--- Para guardar a média calculada
};

const CATEGORIES = ['Todos', 'Cabeleireiro', 'Barbearia', 'Unhas', 'Estética'];
const AUDIENCES = ['Todos', 'Homem', 'Mulher', 'Unissexo'];

export default function HomeScreen() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [session, setSession] = useState<Session | null>(null);
    
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

    useEffect(() => {
        filterData();
    }, [searchText, selectedCategory, selectedAudience, salons]);

    function checkSession() {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
        });
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
        });
        return () => subscription.unsubscribe();
    }

    async function fetchSalons() {
        setLoading(true);
        // Vamos buscar os salões E as suas reviews para calcular a média
        const { data, error } = await supabase
            .from('salons')
            .select('*, reviews(rating)');
            
        if (data) {
            // Calcular a média para cada salão
            const salonsWithRating = data.map((salon: any) => {
                const reviews = salon.reviews || [];
                let avg: number | string = "Novo";
                
                if (reviews.length > 0) {
                    const total = reviews.reduce((acc: number, r: any) => acc + r.rating, 0);
                    avg = (total / reviews.length).toFixed(1); // Ex: "4.8"
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
            activeOpacity={0.9}
        >
            <Image source={{ uri: item.imagem || 'https://via.placeholder.com/400x300' }} style={styles.cardImage} />
            
            {/* Categoria (Esquerda) */}
            <View style={styles.categoryBadge}>
                <Text style={styles.categoryBadgeText}>{item.categoria}</Text>
            </View>

            {/* Rating (Direita) - NOVO */}
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
                    
                    {/* Opcional: Mostrar também o público no texto se quiseres, ou manter escondido */}
                    <Text style={[styles.cardLocation, {color: '#999', fontWeight: '400'}]}> • {item.publico}</Text>
                </View>
                <Text style={styles.cardAddress} numberOfLines={1}>{item.morada}</Text>
            </View>
        </TouchableOpacity>
    );

    const userAvatar = session?.user?.user_metadata?.avatar_url;

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            
            <View style={styles.headerContainer}>
                <View style={styles.topRow}>
                    <View>
                        <Text style={styles.headerTitle}>Explorar</Text>
                        <Text style={styles.headerSubtitle}>Encontra o melhor profissional.</Text>
                    </View>

                    {session ? (
                        <TouchableOpacity onPress={() => router.push('/(tabs)/profile')}>
                            {userAvatar ? (
                                <Image source={{ uri: userAvatar }} style={styles.avatarImage} />
                            ) : (
                                <View style={styles.avatarPlaceholder}>
                                    <Text style={styles.avatarText}>{session.user.user_metadata?.full_name?.charAt(0) || 'U'}</Text>
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
                        <Ionicons name="search" size={20} color="#999" style={{marginRight: 10}} />
                        <TextInput 
                            placeholder="Pesquisar..." 
                            placeholderTextColor="#999"
                            style={styles.searchInput}
                            value={searchText}
                            onChangeText={setSearchText}
                        />
                        {searchText.length > 0 && <TouchableOpacity onPress={() => setSearchText('')}><Ionicons name="close-circle" size={20} color="#ccc" /></TouchableOpacity>}
                    </View>

                    <TouchableOpacity 
                        style={[styles.filterButton, (showFilters || hasActiveFilters) && styles.filterButtonActive]} 
                        onPress={toggleFilters}
                    >
                        <Ionicons 
                            name="options-outline" 
                            size={24} 
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
                                    <Text style={styles.clearBtnText}>Limpar tudo</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap: 8, paddingBottom: 20}}>
                            {CATEGORIES.map((cat) => (
                                <TouchableOpacity key={cat} style={[styles.chip, selectedCategory === cat && styles.chipActive]} onPress={() => setSelectedCategory(cat)}>
                                    <Text style={[styles.chipText, selectedCategory === cat && styles.chipTextActive]}>{cat}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        <View style={styles.sectionHeader}>
                            <Text style={styles.filterSectionTitle}>Público Alvo</Text>
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
                    contentContainerStyle={{ padding: 20, paddingTop: 10 }}
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
    headerContainer: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 15, backgroundColor: '#f8f9fa', borderBottomWidth: 1, borderBottomColor: '#eee' },
    topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
    headerTitle: { fontSize: 32, fontWeight: 'bold', color: '#333' },
    headerSubtitle: { fontSize: 16, color: '#666' },
    loginBtn: { backgroundColor: '#333', flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 15, borderRadius: 20, gap: 5 },
    loginText: { color: 'white', fontWeight: 'bold', fontSize: 14 },
    avatarImage: { width: 45, height: 45, borderRadius: 25, borderWidth: 2, borderColor: 'white' },
    avatarPlaceholder: { width: 45, height: 45, borderRadius: 25, backgroundColor: '#333', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'white' },
    avatarText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
    
    searchRow: { flexDirection: 'row', gap: 10, marginBottom: 5 },
    searchBar: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', borderRadius: 12, paddingHorizontal: 15, paddingVertical: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 5, elevation: 2 },
    searchInput: { flex: 1, fontSize: 16, color: '#333' },
    filterButton: { width: 50, height: 50, backgroundColor: 'white', borderRadius: 12, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 5, elevation: 2 },
    filterButtonActive: { backgroundColor: '#333' },

    filtersPanel: { marginTop: 15, backgroundColor: 'white', padding: 20, borderRadius: 16, borderWidth: 1, borderColor: '#f0f0f0', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, elevation: 2 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    filterSectionTitle: { fontSize: 12, fontWeight: 'bold', color: '#999', textTransform: 'uppercase', letterSpacing: 0.5 },
    clearBtn: { paddingVertical: 2 },
    clearBtnText: { color: '#FF3B30', fontSize: 12, fontWeight: '600' },
    
    chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 25, backgroundColor: '#f8f9fa', borderWidth: 1, borderColor: '#eee', alignItems: 'center', justifyContent: 'center' },
    chipActive: { backgroundColor: '#333', borderColor: '#333' },
    chipAudienceActive: { backgroundColor: '#007AFF', borderColor: '#007AFF' },
    chipText: { fontWeight: '600', color: '#666', fontSize: 13 },
    chipTextActive: { color: 'white' },

    card: { backgroundColor: 'white', borderRadius: 16, marginBottom: 20, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 3, position: 'relative' },
    cardImage: { width: '100%', height: 180, resizeMode: 'cover' },
    cardContent: { padding: 15 },
    cardTitle: { fontSize: 20, fontWeight: 'bold', color: '#333', marginBottom: 5 },
    locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 5 },
    cardLocation: { fontSize: 14, fontWeight: 'bold', color: '#666' },
    cardAddress: { fontSize: 14, color: '#999' },
    
    categoryBadge: { position: 'absolute', top: 15, left: 15, backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    categoryBadgeText: { color: 'white', fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase' },
    
    // NOVO BADGE DE RATING (Canto Superior Direito)
    ratingBadge: { position: 'absolute', top: 15, right: 15, backgroundColor: 'white', flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, shadowColor: '#000', shadowOpacity: 0.1, elevation: 2 },
    ratingText: { fontWeight: 'bold', fontSize: 12, color: '#333' }
});