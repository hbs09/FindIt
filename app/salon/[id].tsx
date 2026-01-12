import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    FlatList,
    Image,
    Modal,
    NativeScrollEvent,
    NativeSyntheticEvent,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { supabase } from '../../supabase';

const { width, height } = Dimensions.get('window');

type Salon = {
    id: number;
    nome_salao: string;
    imagem: string;
    morada: string;
    cidade: string;
    hora_abertura: string;
    hora_fecho: string;
    intervalo_minutos: number;
};

type PortfolioItem = {
    id: number;
    image_url: string;
};

export default function SalonScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [salon, setSalon] = useState<Salon | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Estado do Favorito e Login
  const [isFavorite, setIsFavorite] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false); // <--- NOVO ESTADO

  // Dados Extra
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
  const [averageRating, setAverageRating] = useState<string>('--');
  const [totalReviews, setTotalReviews] = useState(0);

  // Data e Horários
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [slots, setSlots] = useState<string[]>([]);
  const [busySlots, setBusySlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  // Modal de Imagem Fullscreen
  const [fullImageIndex, setFullImageIndex] = useState<number | null>(null);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    if (id) {
        fetchSalonDetails();
        checkUserAndFavorite(); // <--- Agora verifica login E favorito
    }
  }, [id]);

  useEffect(() => {
    if (salon) {
        generateTimeSlots();
        fetchAvailability();
    }
  }, [selectedDate, salon]);

  async function fetchSalonDetails() {
    setLoading(true);
    const { data: salonData } = await supabase.from('salons').select('*').eq('id', id).single();
    if (salonData) {
        setSalon({
            ...salonData,
            hora_abertura: salonData.hora_abertura || '09:00',
            hora_fecho: salonData.hora_fecho || '19:00',
            intervalo_minutos: salonData.intervalo_minutos || 30
        });
    }

    const { data: reviewsData } = await supabase.from('reviews').select('rating').eq('salon_id', id);
    if (reviewsData && reviewsData.length > 0) {
        const total = reviewsData.length;
        const sum = reviewsData.reduce((acc, curr) => acc + curr.rating, 0);
        const avg = (sum / total).toFixed(1);
        setAverageRating(avg);
        setTotalReviews(total);
    } else {
        setAverageRating('Novo');
        setTotalReviews(0);
    }

    const { data: portfolioData } = await supabase
        .from('portfolio_images')
        .select('*')
        .eq('salon_id', id)
        .order('created_at', { ascending: false });
    
    if (portfolioData) setPortfolio(portfolioData);
    setLoading(false);
  }

  // --- LÓGICA DE LOGIN E FAVORITOS ---
  async function checkUserAndFavorite() {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
          setIsLoggedIn(true); // <--- Utilizador detetado, mostra o botão
          
          // Verifica se já é favorito
          const { data } = await supabase
              .from('favorites')
              .select('id')
              .eq('salon_id', id)
              .eq('user_id', user.id)
              .single();
          
          if (data) setIsFavorite(true);
      } else {
          setIsLoggedIn(false); // <--- Sem user, esconde o botão
      }
  }

  async function toggleFavorite() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return; // Segurança extra

      if (isFavorite) {
          await supabase.from('favorites').delete().eq('salon_id', id).eq('user_id', user.id);
          setIsFavorite(false);
      } else {
          await supabase.from('favorites').insert({ salon_id: Number(id), user_id: user.id });
          setIsFavorite(true);
      }
  }

  async function fetchAvailability() {
      setLoadingSlots(true);
      setBusySlots([]);
      const startOfDay = new Date(selectedDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(selectedDate);
      endOfDay.setHours(23, 59, 59, 999);

      const { data } = await supabase
        .from('appointments')
        .select('data_hora')
        .eq('salon_id', id)
        .gte('data_hora', startOfDay.toISOString())
        .lte('data_hora', endOfDay.toISOString())
        .neq('status', 'cancelado')
        .neq('status', 'faltou');

      if (data) {
          const occupied = data.map(app => {
              const d = new Date(app.data_hora);
              return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          });
          setBusySlots(occupied);
      }
      setLoadingSlots(false);
  }

  function generateTimeSlots() {
    if (!salon) return;
    const timeSlots = [];
    const fixTime = (t: string) => t.includes(':') && t.split(':')[0].length === 1 ? `0${t}` : t;
    const startStr = fixTime(salon.hora_abertura);
    const endStr = fixTime(salon.hora_fecho);
    let current = new Date(`2000-01-01T${startStr}`);
    const end = new Date(`2000-01-01T${endStr}`);
    const now = new Date();
    const isToday = selectedDate.getDate() === now.getDate() && selectedDate.getMonth() === now.getMonth() && selectedDate.getFullYear() === now.getFullYear();

    if (isNaN(current.getTime()) || isNaN(end.getTime())) { setSlots([]); return; }

    while (current < end) {
        const timeString = current.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        let shouldAdd = true;
        if (isToday) {
            const slotHour = current.getHours();
            const slotMinute = current.getMinutes();
            const currentHour = now.getHours();
            const currentMinute = now.getMinutes();
            if (slotHour < currentHour || (slotHour === currentHour && slotMinute <= currentMinute)) shouldAdd = false;
        }
        if (shouldAdd) timeSlots.push(timeString);
        current.setMinutes(current.getMinutes() + salon.intervalo_minutos);
    }
    setSlots(timeSlots);
  }

  function changeDate(days: number) {
      const newDate = new Date(selectedDate);
      newDate.setDate(newDate.getDate() + days);
      const today = new Date();
      today.setHours(0,0,0,0);
      if (newDate >= today) { setSelectedDate(newDate); setSelectedSlot(null); }
  }

  function handleBooking() {
      if (!selectedSlot) return Alert.alert("Selecione um horário", "Por favor escolha uma hora para o corte.");
      router.push({
          pathname: '/book-confirm',
          params: { salonId: id, salonName: salon?.nome_salao, date: selectedDate.toISOString(), time: selectedSlot }
      });
  }

  function openGallery(index: number) { setFullImageIndex(index); }

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const contentOffset = e.nativeEvent.contentOffset.x;
      const viewSize = e.nativeEvent.layoutMeasurement.width;
      const newIndex = Math.floor(contentOffset / viewSize);
      setFullImageIndex(newIndex);
  };

  if (loading || !salon) return <View style={styles.center}><ActivityIndicator size="large" color="#333"/></View>;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{paddingBottom: 100}}>
        
        <View style={{position: 'relative'}}>
            <Image source={{ uri: salon.imagem || 'https://via.placeholder.com/400x300' }} style={styles.coverImage} />
            
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                <Ionicons name="arrow-back" size={24} color="white" />
            </TouchableOpacity>

            {/* AQUI ESTÁ A MUDANÇA: SÓ MOSTRA SE ESTIVER LOGADO */}
            {isLoggedIn && (
                <TouchableOpacity style={styles.favButton} onPress={toggleFavorite}>
                    <Ionicons 
                        name={isFavorite ? "heart" : "heart-outline"} 
                        size={26} 
                        color={isFavorite ? "#FF3B30" : "white"} 
                    />
                </TouchableOpacity>
            )}
        </View>

        <View style={styles.content}>
            <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start'}}>
                <View style={{flex: 1}}>
                    <Text style={styles.title}>{salon.nome_salao}</Text>
                    <View style={styles.infoRow}>
                        <Ionicons name="location-sharp" size={16} color="#666" />
                        <Text style={styles.infoText}>{salon.morada}, {salon.cidade}</Text>
                    </View>
                </View>
                <View style={styles.ratingBadge}>
                    <Ionicons name="star" size={16} color="white" />
                    <Text style={styles.ratingText}>{averageRating}</Text>
                </View>
            </View>

            <View style={styles.infoRow}>
                <Ionicons name="time-outline" size={16} color="#666" />
                <Text style={styles.infoText}>Aberto: {salon.hora_abertura} - {salon.hora_fecho}</Text>
            </View>
            
            <Text style={{color:'#999', fontSize:12, marginTop: 5}}>Baseado em {totalReviews} avaliações</Text>
            <View style={styles.divider} />

            <Text style={styles.sectionTitle}>Escolha o Dia</Text>
            <View style={styles.dateSelector}>
                <TouchableOpacity onPress={() => changeDate(-1)}><Ionicons name="chevron-back" size={24} color="#333" /></TouchableOpacity>
                <Text style={styles.dateText}>{selectedDate.toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
                <TouchableOpacity onPress={() => changeDate(1)}><Ionicons name="chevron-forward" size={24} color="#333" /></TouchableOpacity>
            </View>

            <Text style={styles.sectionTitle}>Horários</Text>
            
            {loadingSlots ? (
                <ActivityIndicator color="#333" style={{marginTop: 20}} />
            ) : slots.length === 0 ? (
                <Text style={styles.noSlotsText}>Não há vagas para este dia.</Text>
            ) : (
                <View style={styles.slotsGrid}>
                    {slots.map((time) => {
                        const isBusy = busySlots.includes(time);
                        return (
                            <TouchableOpacity 
                                key={time} 
                                disabled={isBusy}
                                style={[
                                    styles.slotItem, 
                                    selectedSlot === time && styles.slotItemSelected,
                                    isBusy && styles.slotItemBusy
                                ]}
                                onPress={() => setSelectedSlot(time)}
                            >
                                <Text style={[
                                    styles.slotText, 
                                    selectedSlot === time && styles.slotTextSelected,
                                    isBusy && styles.slotTextBusy
                                ]}>
                                    {time}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            )}

            {/* GALERIA */}
            {portfolio.length > 0 && (
                <View style={{marginTop: 30}}>
                    <Text style={styles.sectionTitle}>Galeria ({portfolio.length})</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginLeft: -5}}>
                        {portfolio.map((img, index) => (
                            <TouchableOpacity key={img.id} onPress={() => openGallery(index)}>
                                <Image source={{ uri: img.image_url }} style={styles.galleryImage} />
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>
            )}

        </View>
      </ScrollView>

      <View style={styles.footer}>
          <View>
              <Text style={{color: '#666', fontSize: 12}}>Horário Selecionado</Text>
              <Text style={{fontWeight: 'bold', fontSize: 16}}>{selectedSlot || '--:--'}</Text>
          </View>
          <TouchableOpacity style={[styles.bookBtn, !selectedSlot && {backgroundColor: '#ccc'}]} disabled={!selectedSlot} onPress={handleBooking}>
              <Text style={styles.bookBtnText}>Continuar</Text>
              <Ionicons name="arrow-forward" size={20} color="white" />
          </TouchableOpacity>
      </View>

      <Modal visible={fullImageIndex !== null} transparent={true} animationType="fade" onRequestClose={() => setFullImageIndex(null)}>
          <View style={styles.fullScreenContainer}>
              <TouchableOpacity style={styles.closeButton} onPress={() => setFullImageIndex(null)}>
                  <Ionicons name="close-circle" size={40} color="white" />
              </TouchableOpacity>
              {fullImageIndex !== null && <Text style={styles.counterText}>{fullImageIndex + 1} / {portfolio.length}</Text>}
              {fullImageIndex !== null && (
                <FlatList
                    ref={flatListRef}
                    data={portfolio}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    keyExtractor={item => item.id.toString()}
                    initialScrollIndex={fullImageIndex}
                    getItemLayout={(data, index) => ({ length: width, offset: width * index, index })}
                    onMomentumScrollEnd={onScrollEnd}
                    renderItem={({ item }) => (
                        <View style={{ width: width, height: height, justifyContent: 'center', alignItems: 'center' }}>
                            <Image source={{ uri: item.image_url }} style={styles.fullScreenImage} />
                        </View>
                    )}
                />
              )}
          </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { flex: 1, backgroundColor: 'white' },
  coverImage: { width: '100%', height: 250, resizeMode: 'cover' },
  backButton: { position: 'absolute', top: 50, left: 20, backgroundColor: 'rgba(0,0,0,0.5)', padding: 8, borderRadius: 20 },
  favButton: { position: 'absolute', top: 50, right: 20, backgroundColor: 'rgba(0,0,0,0.5)', padding: 8, borderRadius: 20 },
  content: { padding: 20 },
  title: { fontSize: 26, fontWeight: 'bold', color: '#333', marginBottom: 5 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5 },
  infoText: { color: '#666', fontSize: 14 },
  ratingBadge: { flexDirection: 'row', backgroundColor: '#333', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20, alignItems: 'center', gap: 5 },
  ratingText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 20 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 15 },
  dateSelector: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f8f9fa', padding: 15, borderRadius: 12, marginBottom: 20 },
  dateText: { fontSize: 16, fontWeight: 'bold', textTransform: 'capitalize' },
  slotsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  slotItem: { width: '30%', paddingVertical: 12, alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: '#eee', backgroundColor: 'white' },
  slotItemSelected: { backgroundColor: '#333', borderColor: '#333' },
  slotItemBusy: { backgroundColor: '#f5f5f5', borderColor: '#f0f0f0' },
  slotText: { fontWeight: '600', color: '#333' },
  slotTextSelected: { color: 'white' },
  slotTextBusy: { color: '#ccc', textDecorationLine: 'line-through' },
  noSlotsText: { color: '#999', fontStyle: 'italic' },
  footer: { position: 'absolute', bottom: 0, width: '100%', backgroundColor: 'white', padding: 20, paddingBottom: 40, borderTopWidth: 1, borderTopColor: '#eee', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bookBtn: { backgroundColor: '#333', flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 25, borderRadius: 30, gap: 8 },
  bookBtnText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  galleryImage: { width: 120, height: 120, borderRadius: 12, marginRight: 10, backgroundColor: '#f0f0f0' },
  fullScreenContainer: { flex: 1, backgroundColor: 'black' },
  fullScreenImage: { width: width, height: height * 0.8, resizeMode: 'contain' },
  closeButton: { position: 'absolute', top: 50, right: 20, zIndex: 999, padding: 10 },
  counterText: { position: 'absolute', top: 60, alignSelf: 'center', color: 'white', fontSize: 18, fontWeight: 'bold', zIndex: 998 }
});