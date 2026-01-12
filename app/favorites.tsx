import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Image,
    RefreshControl,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { supabase } from '../supabase';

type FavoriteItem = {
    id: number;
    salon_id: number;
    salons: {
        id: number;
        nome_salao: string;
        imagem: string;
        cidade: string;
        categoria: string;
        rating_avg?: number; // Opcional se quiseres mostrar média
    };
};

export default function FavoritesScreen() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [favorites, setFavorites] = useState<FavoriteItem[]>([]);

    useEffect(() => {
        fetchFavorites();
    }, []);

    async function fetchFavorites() {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) return;

        // Vamos buscar a tabela 'favorites' e juntar com 'salons'
        const { data, error } = await supabase
            .from('favorites')
            .select('id, salon_id, salons (id, nome_salao, imagem, cidade, categoria)')
            .eq('user_id', user.id);

        if (data) {
            setFavorites(data as any);
        }
        setLoading(false);
    }

    async function removeFavorite(favId: number) {
        Alert.alert("Remover", "Tirar dos favoritos?", [
            { text: "Cancelar", style: "cancel" },
            { 
                text: "Sim", 
                style: 'destructive',
                onPress: async () => {
                    const { error } = await supabase.from('favorites').delete().eq('id', favId);
                    if (!error) fetchFavorites();
                }
            }
        ]);
    }

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color="#333" />
                </TouchableOpacity>
                <Text style={styles.title}>Meus Favoritos</Text>
            </View>

            {loading ? (
                <View style={styles.center}><ActivityIndicator color="#007AFF" /></View>
            ) : (
                <FlatList
                    data={favorites}
                    keyExtractor={(item) => item.id.toString()}
                    contentContainerStyle={{ padding: 20 }}
                    refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchFavorites} />}
                    ListEmptyComponent={
                        <View style={styles.center}>
                            <Ionicons name="heart-dislike-outline" size={50} color="#ddd" />
                            <Text style={styles.emptyText}>Ainda não tens favoritos.</Text>
                            <TouchableOpacity style={styles.exploreBtn} onPress={() => router.replace('/(tabs)')}>
                                <Text style={styles.exploreBtnText}>Explorar Salões</Text>
                            </TouchableOpacity>
                        </View>
                    }
                    renderItem={({ item }) => (
                        <TouchableOpacity 
                            style={styles.card} 
                            onPress={() => router.push(`/salon/${item.salons.id}`)}
                            activeOpacity={0.9}
                        >
                            <Image 
                                source={{ uri: item.salons.imagem || 'https://via.placeholder.com/150' }} 
                                style={styles.image} 
                            />
                            <View style={styles.cardContent}>
                                <Text style={styles.category}>{item.salons.categoria}</Text>
                                <Text style={styles.name}>{item.salons.nome_salao}</Text>
                                <View style={styles.locationRow}>
                                    <Ionicons name="location-sharp" size={12} color="#999" />
                                    <Text style={styles.city}>{item.salons.cidade}</Text>
                                </View>
                            </View>
                            
                            <TouchableOpacity style={styles.removeBtn} onPress={() => removeFavorite(item.id)}>
                                <Ionicons name="heart" size={20} color="#FF3B30" />
                            </TouchableOpacity>
                        </TouchableOpacity>
                    )}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8f9fa' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 50 },
    header: { flexDirection: 'row', alignItems: 'center', padding: 20, paddingTop: 60, backgroundColor: 'white', borderBottomWidth:1, borderBottomColor:'#eee' },
    backBtn: { marginRight: 15 },
    title: { fontSize: 22, fontWeight: 'bold' },

    card: { flexDirection: 'row', backgroundColor: 'white', borderRadius: 16, marginBottom: 15, padding: 10, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05, elevation: 2 },
    image: { width: 70, height: 70, borderRadius: 12, backgroundColor: '#eee' },
    cardContent: { flex: 1, marginLeft: 15 },
    category: { fontSize: 10, color: '#007AFF', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 2 },
    name: { fontSize: 16, fontWeight: 'bold', color: '#333' },
    locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
    city: { fontSize: 13, color: '#999' },
    
    removeBtn: { padding: 10 },
    emptyText: { marginTop: 15, color: '#999', fontSize: 16 },
    exploreBtn: { marginTop: 20, backgroundColor: '#333', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 20 },
    exploreBtnText: { color: 'white', fontWeight: 'bold' }
});