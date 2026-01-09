import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { User } from '@supabase/supabase-js';
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
  
  // Estado do Utilizador
  const [user, setUser] = useState<User | null>(null);

  // Estados de Dados do Salão
  const [services, setServices] = useState<Service[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [salonName, setSalonName] = useState('');
  const [isFavorite, setIsFavorite] = useState(false);
  const [requerDados, setRequerDados] = useState(false);

  // Estados de Horários
  const [openingTime, setOpeningTime] = useState('09:00');
  const [closingTime, setClosingTime] = useState('19:00');
  const [intervalMinutes, setIntervalMinutes] = useState(30);
  
  const [takenSlots, setTakenSlots] = useState<string[]>([]); 
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null); 
  
  // Modal de Review
  const [modalVisible, setModalVisible] = useState(false);
  const [newRating, setNewRating] = useState(5);
  const [newComment, setNewComment] = useState('');

  // Data
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    checkUser();
    if (id) {
      fetchSalonDetails();
      fetchServices();
      fetchReviews();
    }
  }, [id]);

  useEffect(() => {
    if (id && user) checkIfFavorite();
  }, [id, user]);

  useEffect(() => {
    if (id) {
        fetchTakenSlots();
        setSelectedSlot(null);
    }
  }, [id, date]);

  // 1. Verificar Sessão
  async function checkUser() {
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);
  }

  async function fetchSalonDetails() {
    const { data } = await supabase
        .from('salons')
        .select('nome_salao, requer_dados, hora_abertura, hora_fecho, intervalo_minutos')
        .eq('id', id)
        .single();
    
    if (data) {
        setSalonName(data.nome_salao);
        setRequerDados(data.requer_dados || false);
        if (data.hora_abertura) setOpeningTime(data.hora_abertura);
        if (data.hora_fecho) setClosingTime(data.hora_fecho);
        if (data.intervalo_minutos) setIntervalMinutes(data.intervalo_minutos);
    }
  }

  async function fetchTakenSlots() {
    const startOfDay = new Date(date);
    startOfDay.setHours(0,0,0,0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23,59,59,999);

    // Só tranca visualmente se estiver CONFIRMADO
    const { data } = await supabase
        .from('appointments')
        .select('data_hora')
        .eq('salon_id', id)
        .eq('status', 'confirmado') 
        .gte('data_hora', startOfDay.toISOString())
        .lte('data_hora', endOfDay.toISOString());

    if (data) {
        const times = data.map(item => {
            const d = new Date(item.data_hora);
            return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        });
        setTakenSlots(times);
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
    if (!user) return;
    const { data } = await supabase.from('favorites').select('*').eq('user_id', user.id).eq('salon_id', id).single();
    if (data) setIsFavorite(true);
  }

  async function toggleFavorite() {
    if (!user) return Alert.alert("Login Necessário", "Faz login para guardar nos favoritos.");
    
    if (isFavorite) {
      await supabase.from('favorites').delete().eq('user_id', user.id).eq('salon_id', id);
      setIsFavorite(false);
    } else {
      await supabase.from('favorites').insert({ user_id: user.id, salon_id: id });
      setIsFavorite(true);
    }
  }

  async function handleOpenReview() {
    if (!user) {
        Alert.alert("Login Necessário", "Tens de entrar na tua conta para escrever uma avaliação.");
        return;
    }
    setModalVisible(true);
  }

  async function submitReview() {
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

  function generateTimeSlots() {
    const slots = [];
    let current = new Date(`2000-01-01T${openingTime}`);
    const end = new Date(`2000-01-01T${closingTime}`);

    while (current < end) {
        const timeString = current.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        slots.push(timeString);
        current.setMinutes(current.getMinutes() + intervalMinutes);
    }
    return slots;
  }

  // --- LÓGICA DE MARCAÇÃO ATUALIZADA ---
  async function handleBooking(service: Service) {
    if (!user) {
        Alert.alert("Login Necessário", "Precisas de entrar na conta para marcar.");
        return;
    }

    // 1. Validação de Slot
    if (!selectedSlot) {
        Alert.alert("Horário em falta", "Por favor, seleciona um horário disponível.");
        return;
    }

    // 2. Verificação Anti-Spam (NOVO)
    // Verifica se já existe algo pendente para este utilizador neste salão
    const { data: pendingAppointments } = await supabase
        .from('appointments')
        .select('id')
        .eq('salon_id', id)
        .eq('cliente_id', user.id)
        .eq('status', 'pendente');

    if (pendingAppointments && pendingAppointments.length > 0) {
        Alert.alert(
            "Pedido Duplicado", 
            "Já tens uma marcação pendente neste salão. Aguarda a confirmação ou cancela a anterior no teu perfil."
        );
        return; // Pára tudo aqui
    }

    // 3. Validação de Perfil (Regra do Salão)
    if (requerDados) {
        const temNome = user.user_metadata?.full_name;
        const temTelefone = user.user_metadata?.phone;

        if (!temNome || !temTelefone) {
            Alert.alert(
                "Dados em Falta", 
                "Este estabelecimento requer Nome e Telemóvel.",
                [
                    { text: "Cancelar", style: "cancel" },
                    { text: "Completar Perfil", onPress: () => router.push('/(tabs)/profile') }
                ]
            );
            return;
        }
    }

    // 4. Confirmação
    Alert.alert("Confirmar", `Marcar ${service.nome} para as ${selectedSlot}?`, [
        { text: "Cancelar" },
        { text: "Confirmar", onPress: async () => {
            const nomeCliente = user.user_metadata?.full_name 
                ? `${user.user_metadata.full_name} (${user.user_metadata.phone || 'Sem nº'})`
                : user.email;

            const [hours, minutes] = selectedSlot.split(':').map(Number);
            const finalDate = new Date(date);
            finalDate.setHours(hours, minutes, 0, 0);

            const { error } = await supabase.from('appointments').insert({
                salon_id: id,
                service_id: service.id,
                cliente_id: user.id,
                cliente_nome: nomeCliente,
                data_hora: finalDate.toISOString(),
                status: 'pendente'
            });

            if (error) {
                Alert.alert("Erro", "Erro ao marcar. Tenta novamente.");
            } else {
                router.replace('/success');
            }
        }}
    ]);
  }

  const onDateChange = (event: any, selectedDate?: Date) => {
    const currentDate = selectedDate || date;
    setShowDatePicker(false);
    setDate(currentDate);
  };

  const slots = generateTimeSlots();

  const ListHeader = () => (
    <View>
        <View style={styles.headerRow}>
            <Text style={styles.title}>{salonName}</Text>
            <TouchableOpacity onPress={toggleFavorite}>
                <Ionicons name={isFavorite ? "heart" : "heart-outline"} size={32} color={isFavorite ? "#FF3B30" : "#333"} />
            </TouchableOpacity>
        </View>

        {user ? (
            <>
                <View style={styles.dateContainer}>
                    <Text style={styles.label}>Escolhe o dia:</Text>
                    <TouchableOpacity onPress={() => setShowDatePicker(true)} style={styles.dateBtn}>
                        <Text style={styles.btnText}>📅 {date.toLocaleDateString()}</Text>
                    </TouchableOpacity>
                    {showDatePicker && (
                        <DateTimePicker 
                            value={date} 
                            mode="date" 
                            onChange={onDateChange} 
                            minimumDate={new Date()} 
                        />
                    )}
                </View>

                <Text style={styles.subtitle}>Horários Disponíveis</Text>
                <View style={styles.slotsGrid}>
                    {slots.map((time) => {
                        const isTaken = takenSlots.includes(time);
                        const isSelected = selectedSlot === time;

                        return (
                            <TouchableOpacity 
                                key={time} 
                                style={[
                                    styles.slotBtn, 
                                    isSelected && styles.slotBtnActive,
                                    isTaken && styles.slotBtnDisabled
                                ]} 
                                onPress={() => !isTaken && setSelectedSlot(time)}
                                disabled={isTaken}
                            >
                                <Text style={[
                                    styles.slotText, 
                                    isSelected && styles.slotTextActive,
                                    isTaken && styles.slotTextDisabled
                                ]}>
                                    {time}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </>
        ) : (
            <View style={styles.guestWarning}>
                <Ionicons name="information-circle-outline" size={24} color="#007AFF" />
                <Text style={styles.guestText}>Faz login para veres a disponibilidade e marcares.</Text>
            </View>
        )}

        <Text style={styles.subtitle}>Serviços</Text>
        <View style={{ marginBottom: 20 }}>
            {services.map(service => {
                if (!user) {
                    return (
                        <View key={service.id} style={[styles.serviceCard, {opacity: 0.8}]}>
                            <View>
                                <Text style={styles.serviceName}>{service.nome}</Text>
                                <Text style={styles.duration}>{service.duracao_minutos} min</Text>
                            </View>
                            <Text style={styles.price}>{service.preco}€</Text>
                        </View>
                    );
                }

                return (
                    <TouchableOpacity key={service.id} style={styles.serviceCard} onPress={() => handleBooking(service)}>
                        <View>
                            <Text style={styles.serviceName}>{service.nome}</Text>
                            <Text style={styles.duration}>{service.duracao_minutos} min</Text>
                        </View>
                        <Text style={styles.price}>{service.preco}€</Text>
                    </TouchableOpacity>
                );
            })}
        </View>

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
  
  dateContainer: { backgroundColor: 'white', padding: 15, borderRadius: 10, marginBottom: 15 },
  label: { fontWeight: 'bold', marginBottom: 10 },
  dateBtn: { backgroundColor: '#e1e1e1', padding: 12, borderRadius: 8, alignItems: 'center' },
  btnText: { fontWeight: 'bold', fontSize: 16 },

  slotsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  slotBtn: { 
    paddingVertical: 10, paddingHorizontal: 15, 
    borderRadius: 8, borderWidth: 1, borderColor: '#ccc', 
    backgroundColor: 'white', minWidth: 70, alignItems: 'center'
  },
  slotBtnActive: { backgroundColor: '#333', borderColor: '#333' },
  slotBtnDisabled: { backgroundColor: '#f0f0f0', borderColor: '#eee' },
  
  slotText: { fontWeight: '600', color: '#333' },
  slotTextActive: { color: 'white' },
  slotTextDisabled: { color: '#ccc', textDecorationLine: 'line-through' },

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
  btn: { flex: 1, padding: 15, borderRadius: 10, alignItems: 'center' },

  guestWarning: {
    backgroundColor: '#e6f4ff',
    padding: 15,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 20
  },
  guestText: { color: '#007AFF', fontWeight: '500', flex: 1 }
});