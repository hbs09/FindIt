import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    Alert,
    FlatList,
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View
} from 'react-native';
import { supabase } from '../../supabase';

type Service = { id: number; nome: string; preco: number; duracao_minutos: number; };
type Review = { id: number; rating: number; comentario: string; created_at: string; };

export default function SalonDetails() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  
  // Estados de Dados
  const [services, setServices] = useState<Service[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [salonName, setSalonName] = useState('');
  const [isFavorite, setIsFavorite] = useState(false);
  
  // NOVO ESTADO: Regra do Salão
  const [requerDados, setRequerDados] = useState(false);
  
  // Estados do Modal de Review
  const [modalVisible, setModalVisible] = useState(false);
  const [newRating, setNewRating] = useState(5);
  const [newComment, setNewComment] = useState('');

  // Estados da Data de Marcação
  const [date, setDate] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [mode, setMode] = useState<'date' | 'time'>('date');

  useEffect(() => {
    if (id) {
      fetchSalonDetails();
      fetchServices();
      checkIfFavorite();
      fetchReviews();
    }
  }, [id]);

  async function fetchSalonDetails() {
    // Agora vamos buscar também a regra 'requer_dados'
    const { data } = await supabase
        .from('salons')
        .select('nome_salao, requer_dados') // <--- CAMPO NOVO
        .eq('id', id)
        .single();
    
    if (data) {
        setSalonName(data.nome_salao);
        setRequerDados(data.requer_dados || false);
    }
  }

  async function fetchServices() {
    const { data } = await supabase.from('services').select('*').eq('salon_id', id);
    if (data) setServices(data as Service[]);
  }

  async function fetchReviews() {
    const { data } = await supabase
      .from('reviews')
      .select('*')
      .eq('salon_id', id)
      .order('created_at', { ascending: false });
    if (data) setReviews(data as Review[]);
  }

  async function checkIfFavorite() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('favorites').select('*').eq('user_id', user.id).eq('salon_id', id).single();
    if (data) setIsFavorite(true);
  }

  async function toggleFavorite() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Alert.alert("Erro", "Login necessário para favoritos.");
    
    if (isFavorite) {
      await supabase.from('favorites').delete().eq('user_id', user.id).eq('salon_id', id);
      setIsFavorite(false);
    } else {
      await supabase.from('favorites').insert({ user_id: user.id, salon_id: id });
      setIsFavorite(true);
    }
  }

  // Verificar login antes de abrir modal de review
  async function handleOpenReview() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        Alert.alert("Login Necessário", "Tens de entrar na tua conta para escrever uma avaliação.");
        return;
    }
    setModalVisible(true);
  }

  async function submitReview() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from('reviews').insert({
        salon_id: id,
        user_id: user.id,
        rating: newRating,
        comentario: newComment
    });

    if (error) {
        Alert.alert("Erro", "Não foi possível enviar a avaliação.");
    } else {
        setModalVisible(false);
        setNewComment('');
        fetchReviews(); 
        Alert.alert("Obrigado!", "A tua opinião foi registada.");
    }
  }

  // --- LÓGICA DE MARCAÇÃO ATUALIZADA ---
  async function handleBooking(service: Service) {
    const { data: { user } } = await supabase.auth.getUser();
    
    // 1. Verificação de Login
    if (!user) {
        Alert.alert("Login Necessário", "Precisas de entrar na conta para marcar.");
        router.push('/login');
        return;
    }

    // 2. NOVA VERIFICAÇÃO: O Salão exige dados completos?
    if (requerDados) {
        const temNome = user.user_metadata?.full_name;
        const temTelefone = user.user_metadata?.phone;

        if (!temNome || !temTelefone) {
            Alert.alert(
                "Dados em Falta", 
                "Este estabelecimento requer Nome e Telemóvel para aceitar marcações.",
                [
                    { text: "Cancelar", style: "cancel" },
                    { text: "Completar Perfil", onPress: () => router.push('/(tabs)/profile') }
                ]
            );
            return; // Bloqueia a marcação
        }
    }

    // 3. Confirmação e Marcação
    Alert.alert("Confirmar", `Marcar ${service.nome}?`, [
        { text: "Cancelar" },
        { text: "Confirmar", onPress: async () => {
            
            // Constrói o nome do cliente (com fallback para email se não houver metadados)
            const nomeCliente = user.user_metadata?.full_name 
                ? `${user.user_metadata.full_name} (${user.user_metadata.phone || 'Sem nº'})`
                : user.email;

            const { error } = await supabase.from('appointments').insert({
                salon_id: id,
                service_id: service.id,
                cliente_id: user.id,
                cliente_nome: nomeCliente, // Envia o nome formatado
                data_hora: date.toISOString(),
                status: 'pendente'
            });

            if (error) {
                Alert.alert("Erro", "Algo correu mal na marcação.");
            } else {
                router.replace('/success');
            }
        }}
    ]);
  }

  const onChange = (event: any, selectedDate?: Date) => {
    const currentDate = selectedDate || date;
    setShowPicker(false);
    setDate(currentDate);
  };

  const showMode = (currentMode: 'date' | 'time') => {
    setShowPicker(true);
    setMode(currentMode);
  };

  // --- COMPONENTE DO CABEÇALHO DA LISTA ---
  const ListHeader = () => (
    <View>
        <View style={styles.headerRow}>
            <Text style={styles.title}>{salonName}</Text>
            <TouchableOpacity onPress={toggleFavorite}>
                <Ionicons name={isFavorite ? "heart" : "heart-outline"} size={32} color={isFavorite ? "#FF3B30" : "#333"} />
            </TouchableOpacity>
        </View>

        {/* Picker de Data e Hora */}
        <View style={styles.dateContainer}>
            <Text style={styles.label}>Para quando?</Text>
            <View style={styles.row}>
                <TouchableOpacity onPress={() => showMode('date')} style={styles.dateBtn}>
                    <Text style={styles.btnText}>📅 {date.toLocaleDateString()}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => showMode('time')} style={styles.dateBtn}>
                    <Text style={styles.btnText}>⏰ {date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</Text>
                </TouchableOpacity>
            </View>
            {showPicker && <DateTimePicker value={date} mode={mode} is24Hour={true} onChange={onChange} minimumDate={new Date()} />}
        </View>

        {/* Lista de Serviços */}
        <Text style={styles.subtitle}>Serviços</Text>
        <View style={{ marginBottom: 20 }}>
            {services.map(service => (
                <TouchableOpacity key={service.id} style={styles.serviceCard} onPress={() => handleBooking(service)}>
                    <View>
                        <Text style={styles.serviceName}>{service.nome}</Text>
                        <Text style={styles.duration}>{service.duracao_minutos} min</Text>
                    </View>
                    <Text style={styles.price}>{service.preco}€</Text>
                </TouchableOpacity>
            ))}
        </View>

        {/* Cabeçalho das Reviews */}
        <View style={styles.reviewsHeader}>
            <Text style={styles.subtitle}>Opiniões ({reviews.length})</Text>
            <TouchableOpacity onPress={handleOpenReview}>
                <Text style={styles.writeReviewLink}>Escrever Avaliação</Text>
            </TouchableOpacity>
        </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* LISTA PRINCIPAL */}
      <FlatList
        data={reviews}
        keyExtractor={(item) => item.id.toString()}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={<Text style={styles.emptyText}>Sê o primeiro a avaliar!</Text>}
        renderItem={({ item }) => (
            <View style={styles.reviewCard}>
                <View style={styles.reviewTop}>
                    <Text style={styles.reviewUser}>Cliente</Text> 
                    <View style={{flexDirection: 'row'}}>{[...Array(item.rating)].map((_, i) => <Ionicons key={i} name="star" size={12} color="#FFD700" />)}</View>
                </View>
                <Text style={styles.reviewComment}>{item.comentario}</Text>
            </View>
        )}
      />

      {/* MODAL DE REVIEW */}
      <Modal visible={modalVisible} animationType="slide" transparent={true}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <KeyboardAvoidingView 
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.modalOverlay}
            >
                <View style={styles.modalContent}>
                    <Text style={styles.modalTitle}>Avaliar Experiência</Text>
                    
                    <View style={styles.starsRow}>
                        {[1, 2, 3, 4, 5].map((star) => (
                            <TouchableOpacity key={star} onPress={() => setNewRating(star)}>
                                <Ionicons name={star <= newRating ? "star" : "star-outline"} size={40} color="#FFD700" />
                            </TouchableOpacity>
                        ))}
                    </View>

                    <TextInput 
                        style={styles.input} 
                        placeholder="Escreve aqui a tua opinião..." 
                        multiline={true} 
                        blurOnSubmit={true} 
                        returnKeyType="done"
                        onSubmitEditing={Keyboard.dismiss}
                        value={newComment}
                        onChangeText={setNewComment}
                    />

                    <View style={styles.modalButtons}>
                        <TouchableOpacity style={[styles.btn, {backgroundColor: '#ccc'}]} onPress={() => setModalVisible(false)}>
                            <Text>Cancelar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.btn, {backgroundColor: '#333'}]} onPress={submitReview}>
                            <Text style={{color: 'white'}}>Enviar</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f5f5f5', paddingTop: 60 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#333', flex: 1 },
  subtitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 10, marginTop: 10 },
  dateContainer: { backgroundColor: 'white', padding: 15, borderRadius: 10, marginBottom: 10 },
  label: { fontWeight: 'bold', marginBottom: 10 },
  row: { flexDirection: 'row', gap: 10 },
  dateBtn: { backgroundColor: '#e1e1e1', padding: 10, borderRadius: 8, flex: 1, alignItems: 'center' },
  btnText: { fontWeight: 'bold' },
  serviceCard: { backgroundColor: 'white', padding: 15, borderRadius: 12, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, elevation: 2 },
  serviceName: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  duration: { fontSize: 12, color: 'gray', marginTop: 2 },
  price: { fontSize: 18, fontWeight: 'bold', color: '#2e8b57' },

  reviewsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, marginBottom: 10 },
  writeReviewLink: { color: '#007AFF', fontWeight: '600' },
  reviewCard: { backgroundColor: 'white', padding: 15, borderRadius: 10, marginBottom: 10 },
  reviewTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  reviewUser: { fontWeight: 'bold', fontSize: 12, color: '#666' },
  reviewComment: { color: '#333' },
  emptyText: { fontStyle: 'italic', color: '#999', marginBottom: 20 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: 'white', width: '85%', padding: 20, borderRadius: 20, alignItems: 'center' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 20 },
  starsRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  input: { width: '100%', height: 100, borderColor: '#ddd', borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 20, textAlignVertical: 'top' },
  modalButtons: { flexDirection: 'row', gap: 10, width: '100%' },
  btn: { flex: 1, padding: 15, borderRadius: 10, alignItems: 'center' }
});