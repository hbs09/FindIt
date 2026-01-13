import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Image,
    RefreshControl,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../supabase';

export default function FavoritesScreen() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [favorites, setFavorites] = useState<any[]>([]);

    useEffect(() => {
        fetchFavorites();
    }, []);

    async function fetchFavorites() {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase
            .from('favorites')
            .select(`
                id,
                salon_id,
                salons (
                    id, nome_salao, cidade, imagem, categoria, publico, morada,
                    reviews (rating)
                )
            `)
            .eq('user_id', user.id);

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
        setLoading(false);
    }

    async function removeFavorite(favId: number) {
        setFavorites(prev => prev.filter(item => item.fav_id !== favId));
        await supabase.from('favorites').delete().eq('id', favId);
    }

    const renderItem = ({ item }: { item: any }) => (
        <TouchableOpacity 
            style={styles.card} 
            onPress={() => router.push(`/salon/${item.id}`)}
            activeOpacity={0.95}
        >
            <Image source={{ uri: item.imagem || 'https://via.placeholder.com/400x300' }} style={styles.cardImage} />
            
            <TouchableOpacity 
                style={styles.removeBtn} 
                onPress={(e) => {
                    e.stopPropagation();
                    removeFavorite(item.fav_id);
                }}
            >
                <Ionicons name="heart" size={20} color="#FF3B30" />
            </TouchableOpacity>

            <View style={styles.ratingBadge}>
                <Ionicons name="star" size={12} color="#FFD700" />
                <Text style={styles.ratingText}>{item.averageRating}</Text>
            </View>

            <View style={styles.cardContent}>
                <View style={{flexDirection:'row', justifyContent:'space-between'}}>
                    <Text style={styles.cardTitle}>{item.nome_salao}</Text>
                </View>
                <View style={styles.locationRow}>
                    <Ionicons name="location-sharp" size={14} color="#666" />
                    <Text style={styles.cardLocation}>{item.cidade}</Text>
                    <Text style={[styles.cardLocation, {color: '#999', fontWeight: '400'}]}> • {item.publico}</Text>
                </View>
            </View>
        </TouchableOpacity>
    );

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            
            {/* [ALTERADO] Cabeçalho sem background */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color="#333" />
                </TouchableOpacity>
                <Text style={styles.title}>Meus Favoritos</Text>
            </View>

            {loading ? (
                <View style={styles.center}><ActivityIndicator color="#333" /></View>
            ) : (
                <FlatList
                    data={favorites}
                    keyExtractor={(item) => item.id.toString()}
                    renderItem={renderItem}
                    contentContainerStyle={{ padding: 20, paddingBottom: 50 }}
                    refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchFavorites} />}
                    ListEmptyComponent={
                        <View style={styles.center}>
                            <Ionicons name="heart-dislike-outline" size={50} color="#ccc" />
                            <Text style={{color:'#999', marginTop:10}}>Ainda não tens favoritos.</Text>
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
    
    // [ALTERADO] Removido backgroundColor e bordas
    header: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        padding: 20
    },
    backBtn: { marginRight: 15 },
    title: { fontSize: 20, fontWeight: 'bold', color: '#333' },

    card: { 
        backgroundColor: 'white', borderRadius: 16, marginBottom: 20, overflow: 'hidden',
        shadowColor: '#000', shadowOffset: {width:0, height:2}, shadowOpacity:0.05, shadowRadius:8, elevation:3
    },
    cardImage: { width: '100%', height: 160, resizeMode: 'cover' },
    
    cardContent: { padding: 15 },
    cardTitle: { fontSize: 18, fontWeight: 'bold', color: '#1a1a1a', marginBottom: 4 },
    locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    cardLocation: { fontSize: 13, fontWeight: '600', color: '#666' },

    ratingBadge: { 
        position: 'absolute', top: 15, left: 15, 
        backgroundColor: 'white', flexDirection: 'row', alignItems: 'center', gap: 4, 
        paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, 
        shadowColor: '#000', shadowOpacity: 0.15, elevation: 3 
    },
    ratingText: { fontWeight: '800', fontSize: 12, color: '#1a1a1a' },

    removeBtn: {
        position: 'absolute', top: 15, right: 15,
        backgroundColor: 'white', width: 36, height: 36, borderRadius: 18,
        justifyContent: 'center', alignItems: 'center',
        shadowColor: '#000', shadowOpacity: 0.15, elevation: 3
    }
});