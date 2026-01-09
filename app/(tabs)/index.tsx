import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Ionicons } from '@expo/vector-icons';
import { Link, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../supabase';

type Review = { rating: number };

type Salao = {
  id: number;
  nome_salao: string;
  cidade: string;
  imagem: string | null;
  categoria: string | null;
  reviews: Review[];
};

const CATEGORIAS = ["Todos", "Barbearia", "Cabeleireiro", "Estética"];

export default function HomeScreen() {
  const router = useRouter();
  const [saloes, setSaloes] = useState<Salao[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoriaSelecionada, setCategoriaSelecionada] = useState("Todos");

  // --- CORREÇÃO: PERMITIR VISITANTES ---
  // Removi o 'verificarUsuario()'. Agora qualquer pessoa pode ver a lista.
  useFocusEffect(
    useCallback(() => {
      fetchSaloes();
    }, [])
  );

  async function fetchSaloes() {
    // O Supabase permite ler dados públicos mesmo sem login (se as políticas RLS estiverem bem configuradas)
    const { data } = await supabase.from('salons').select('*, reviews(rating)');
    if (data) setSaloes(data as any);
    setLoading(false);
  }

  function calcularMedia(reviews: Review[]) {
    if (!reviews || reviews.length === 0) return null;
    const total = reviews.reduce((acc, item) => acc + item.rating, 0);
    return (total / reviews.length).toFixed(1);
  }

  const saloesFiltrados = saloes.filter(salao => {
    if (categoriaSelecionada === "Todos") return true;
    return salao.categoria === categoriaSelecionada;
  });

  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: '#A1CEDC', dark: '#1D3D47' }}
      headerImage={
        <Image source={require('@/assets/images/partial-react-logo.png')} style={styles.reactLogo} />
      }>
      
      <ThemedView style={styles.titleContainer}>
        <ThemedText type="title">Descobrir</ThemedText>
      </ThemedView>

      {/* FILTROS */}
      <View style={styles.categoriesContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {CATEGORIAS.map((cat) => (
                <TouchableOpacity 
                    key={cat} 
                    style={[styles.catPill, categoriaSelecionada === cat && styles.catPillActive]}
                    onPress={() => setCategoriaSelecionada(cat)}
                >
                    <Text style={[styles.catText, categoriaSelecionada === cat && styles.catTextActive]}>{cat}</Text>
                </TouchableOpacity>
            ))}
        </ScrollView>
      </View>

      <ThemedView style={styles.stepContainer}>
        <ThemedText type="subtitle">
            {categoriaSelecionada === "Todos" ? "Destaques na tua zona:" : `Resultados para ${categoriaSelecionada}:`}
        </ThemedText>
        
        {loading && <ActivityIndicator size="large" color="#000" />}

        {saloesFiltrados.map((salao) => {
          const media = calcularMedia(salao.reviews);

          return (
            <Link key={salao.id} href={{ pathname: "/salon/[id]", params: { id: salao.id } }} asChild>
              <TouchableOpacity style={styles.card}>
                <Image source={{ uri: salao.imagem || 'https://via.placeholder.com/400x200' }} style={styles.cardImage} />
                
                <View style={styles.cardCategory}>
                   <Text style={styles.cardCategoryText}>{salao.categoria || 'Geral'}</Text>
                </View>

                <View style={styles.cardContent}>
                  <View>
                      <Text style={styles.cardTitle}>{salao.nome_salao}</Text>
                      <Text style={styles.cardSubtitle}>📍 {salao.cidade}</Text>
                  </View>
                  
                  <View style={styles.ratingBox}>
                    <Ionicons name="star" size={16} color="#FFD700" />
                    <Text style={styles.ratingText}>{media ? media : 'Novo'}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            </Link>
          );
        })}

      </ThemedView>
    </ParallaxScrollView>
  );
}

const styles = StyleSheet.create({
  titleContainer: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  stepContainer: { gap: 15, marginBottom: 20 },
  reactLogo: { height: 178, width: 290, bottom: 0, left: 0, position: 'absolute' },
  
  categoriesContainer: { marginBottom: 20 },
  catPill: { backgroundColor: '#f0f0f0', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: '#eee' },
  catPillActive: { backgroundColor: '#333', borderColor: '#333' },
  catText: { fontWeight: '600', color: '#666' },
  catTextActive: { color: 'white' },
  
  card: { backgroundColor: 'white', borderRadius: 16, overflow: 'hidden', marginBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 },
  cardImage: { width: '100%', height: 150, resizeMode: 'cover' },
  cardContent: { padding: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: '#1a1a1a' },
  cardSubtitle: { fontSize: 14, color: '#666', marginTop: 4 },
  
  cardCategory: { position: 'absolute', top: 10, left: 10, backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  cardCategoryText: { color: 'white', fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase' },

  ratingBox: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f9f9f9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  ratingText: { fontWeight: 'bold', color: '#333' }
});