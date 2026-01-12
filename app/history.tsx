import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Modal,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { supabase } from '../supabase';

type HistoryItem = {
    id: number;
    data_hora: string;
    status: string;
    avaliado: boolean;
    services: { nome: string; preco: number };
    salons: { id: number; nome_salao: string; morada: string };
};

export default function HistoryScreen() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [history, setHistory] = useState<HistoryItem[]>([]);
    
    // Abas Principais
    const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');
    
    // Sub-filtro para a aba "Anteriores"
    const [pastFilter, setPastFilter] = useState<'todos' | 'concluido' | 'cancelado' | 'faltou'>('todos');

    // --- ESTADOS DO MODAL DE AVALIAÇÃO ---
    const [modalVisible, setModalVisible] = useState(false);
    const [selectedRating, setSelectedRating] = useState(0);
    const [currentAppointment, setCurrentAppointment] = useState<HistoryItem | null>(null);
    const [submittingReview, setSubmittingReview] = useState(false);

    useEffect(() => {
        fetchHistory();
    }, []);

    async function fetchHistory() {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) return router.replace('/login');

        const { data, error } = await supabase
            .from('appointments')
            .select(`
                id, data_hora, status, avaliado,
                services (nome, preco),
                salons (id, nome_salao, morada)
            `)
            .eq('cliente_id', user.id)
            .order('data_hora', { ascending: false });

        if (data) setHistory(data as any || []);
        setLoading(false);
    }

    // --- FUNÇÃO DE CANCELAR (NOVO) ---
    function handleCancel(id: number) {
        Alert.alert(
            "Cancelar Marcação",
            "Tens a certeza que queres cancelar? Esta ação não pode ser desfeita.",
            [
                { text: "Não", style: "cancel" },
                { 
                    text: "Sim, Cancelar", 
                    style: 'destructive',
                    onPress: async () => {
                        const { error } = await supabase
                            .from('appointments')
                            .update({ status: 'cancelado' })
                            .eq('id', id);
                        
                        if (error) {
                            Alert.alert("Erro", "Não foi possível cancelar.");
                        } else {
                            fetchHistory(); // Recarrega para mover para o histórico
                        }
                    }
                }
            ]
        );
    }

    // --- FUNÇÕES DE AVALIAÇÃO ---
    function openReviewModal(item: HistoryItem) {
        setCurrentAppointment(item);
        setSelectedRating(0);
        setModalVisible(true);
    }

    async function submitReview() {
        if (selectedRating === 0) {
            return Alert.alert("Erro", "Por favor seleciona uma classificação (1-5 estrelas).");
        }
        if (!currentAppointment) return;

        setSubmittingReview(true);
        const { data: { user } } = await supabase.auth.getUser();

        try {
            const { error: reviewError } = await supabase.from('reviews').insert({
                salon_id: currentAppointment.salons.id,
                user_id: user?.id,
                rating: selectedRating
            });

            if (reviewError) throw reviewError;

            const { error: updateError } = await supabase
                .from('appointments')
                .update({ avaliado: true })
                .eq('id', currentAppointment.id);

            if (updateError) throw updateError;

            Alert.alert("Sucesso", "Obrigado pela tua avaliação!");
            setModalVisible(false);
            fetchHistory(); 

        } catch (error) {
            console.error(error);
            Alert.alert("Erro", "Falha ao enviar avaliação.");
        } finally {
            setSubmittingReview(false);
        }
    }

    // --- LÓGICA DE FILTRAGEM ---
    
    // 1. Agendados
    const upcomingList = history
        .filter(item => item.status === 'pendente' || item.status === 'confirmado')
        .reverse(); 

    // 2. Anteriores
    let pastList = history.filter(item => ['concluido', 'cancelado', 'faltou'].includes(item.status));

    if (pastFilter !== 'todos') {
        pastList = pastList.filter(item => item.status === pastFilter);
    }

    const dataToShow = activeTab === 'upcoming' ? upcomingList : pastList;

    const getStatusColor = (status: string) => {
        switch(status?.toLowerCase()) {
            case 'confirmado': return '#4CD964';
            case 'concluido': return '#333';
            case 'cancelado': return '#FF3B30';
            case 'faltou': return '#FF9500';
            default: return '#007AFF';
        }
    };

    if (loading) return <View style={styles.center}><ActivityIndicator color="#333" /></View>;

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color="#333" />
                </TouchableOpacity>
                <Text style={styles.title}>Minhas Marcações</Text>
            </View>

            <View style={styles.tabContainer}>
                <TouchableOpacity style={[styles.tabBtn, activeTab === 'upcoming' && styles.tabBtnActive]} onPress={() => setActiveTab('upcoming')}>
                    <Text style={[styles.tabText, activeTab === 'upcoming' && styles.tabTextActive]}>Agendados</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.tabBtn, activeTab === 'past' && styles.tabBtnActive]} onPress={() => setActiveTab('past')}>
                    <Text style={[styles.tabText, activeTab === 'past' && styles.tabTextActive]}>Anteriores</Text>
                </TouchableOpacity>
            </View>

            {activeTab === 'past' && (
                <View style={styles.subFilterContainer}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingHorizontal: 20, gap: 10}}>
                        <TouchableOpacity onPress={() => setPastFilter('todos')} style={[styles.chip, pastFilter === 'todos' && styles.chipActive]}><Text style={[styles.chipText, pastFilter === 'todos' && styles.chipTextActive]}>Todos</Text></TouchableOpacity>
                        <TouchableOpacity onPress={() => setPastFilter('concluido')} style={[styles.chip, pastFilter === 'concluido' && styles.chipActive]}><Text style={[styles.chipText, pastFilter === 'concluido' && styles.chipTextActive]}>Concluídos</Text></TouchableOpacity>
                        <TouchableOpacity onPress={() => setPastFilter('cancelado')} style={[styles.chip, pastFilter === 'cancelado' && styles.chipActive]}><Text style={[styles.chipText, pastFilter === 'cancelado' && styles.chipTextActive]}>Cancelados</Text></TouchableOpacity>
                        <TouchableOpacity onPress={() => setPastFilter('faltou')} style={[styles.chip, pastFilter === 'faltou' && styles.chipActive]}><Text style={[styles.chipText, pastFilter === 'faltou' && styles.chipTextActive]}>Faltas</Text></TouchableOpacity>
                    </ScrollView>
                </View>
            )}

            <FlatList
                data={dataToShow}
                keyExtractor={item => item.id.toString()}
                contentContainerStyle={{padding: 20}}
                refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchHistory} />}
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Ionicons name={activeTab === 'upcoming' ? "calendar-outline" : "time-outline"} size={50} color="#ddd" />
                        <Text style={styles.emptyText}>
                            {activeTab === 'upcoming' ? "Não tens marcações ativas." : "Nenhum histórico encontrado."}
                        </Text>
                    </View>
                }
                renderItem={({ item }) => (
                    <View style={[styles.card, activeTab === 'past' && {opacity: 1}]}> 
                        <View style={{flex: 1}}>
                            <Text style={styles.salonName}>{item.salons?.nome_salao || "Salão"}</Text>
                            <Text style={styles.serviceText}>{item.services?.nome} • {item.services?.preco}€</Text>
                            <Text style={[styles.dateText, (activeTab === 'upcoming' && new Date(item.data_hora) < new Date()) && {color: '#FF3B30'}]}>
                                {new Date(item.data_hora).toLocaleDateString()} às {new Date(item.data_hora).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                            </Text>
                            
                            {/* BOTÃO CANCELAR (SÓ NA ABA AGENDADOS) */}
                            {activeTab === 'upcoming' && (
                                <TouchableOpacity style={styles.cancelLink} onPress={() => handleCancel(item.id)}>
                                    <Text style={styles.cancelLinkText}>Cancelar Marcação</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                        
                        <View style={{alignItems: 'flex-end', gap: 8}}>
                            <View style={[styles.badge, {backgroundColor: getStatusColor(item.status)}]}>
                                <Text style={styles.badgeText}>{item.status}</Text>
                            </View>

                            {/* Botão Avaliar */}
                            {item.status === 'concluido' && !item.avaliado && (
                                <TouchableOpacity style={styles.rateBtn} onPress={() => openReviewModal(item)}>
                                    <Ionicons name="star" size={14} color="white" />
                                    <Text style={styles.rateBtnText}>Avaliar</Text>
                                </TouchableOpacity>
                            )}

                            {item.status === 'concluido' && item.avaliado && (
                                <View style={{flexDirection:'row', alignItems:'center'}}>
                                    <Ionicons name="checkmark-circle" size={14} color="#4CD964" />
                                    <Text style={{fontSize:10, color:'#666', marginLeft:2}}>Avaliado</Text>
                                </View>
                            )}
                        </View>
                    </View>
                )}
            />

            {/* Modal de Avaliação */}
            <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Avaliar Serviço</Text>
                        <Text style={styles.modalSubtitle}>Como foi a tua experiência em {currentAppointment?.salons.nome_salao}?</Text>
                        <View style={styles.starsContainer}>
                            {[1, 2, 3, 4, 5].map((star) => (
                                <TouchableOpacity key={star} onPress={() => setSelectedRating(star)}>
                                    <Ionicons name={star <= selectedRating ? "star" : "star-outline"} size={45} color="#FFD700" />
                                </TouchableOpacity>
                            ))}
                        </View>
                        <View style={styles.modalButtons}>
                            <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                                <Text style={styles.cancelText}>Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.submitBtn} onPress={submitReview} disabled={submittingReview}>
                                {submittingReview ? <ActivityIndicator color="white"/> : <Text style={styles.submitText}>Enviar</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8f9fa' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: { flexDirection: 'row', alignItems: 'center', padding: 20, paddingTop: 60, backgroundColor: 'white' },
    backBtn: { marginRight: 15 },
    title: { fontSize: 22, fontWeight: 'bold' },
    
    // Tabs Principais
    tabContainer: { flexDirection: 'row', padding: 15, gap: 10, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#eee' },
    tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 20, backgroundColor: '#f0f0f0' },
    tabBtnActive: { backgroundColor: '#333' },
    tabText: { fontWeight: '600', color: '#666' },
    tabTextActive: { color: 'white' },

    // Sub-Filtros (Chips)
    subFilterContainer: { paddingVertical: 10, backgroundColor: '#f8f9fa' },
    chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: 'white', borderWidth: 1, borderColor: '#ddd', marginRight: 0 },
    chipActive: { backgroundColor: '#333', borderColor: '#333' },
    chipText: { fontSize: 12, fontWeight: '600', color: '#666' },
    chipTextActive: { color: 'white' },

    emptyContainer: { alignItems: 'center', marginTop: 50 },
    emptyText: { marginTop: 10, color: '#999', fontSize: 16 },
    card: { backgroundColor: 'white', flexDirection: 'row', padding: 15, borderRadius: 12, marginBottom: 15, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05, elevation: 2 },
    salonName: { fontWeight: 'bold', fontSize: 16, marginBottom: 2 },
    serviceText: { color: '#666', fontSize: 14 },
    dateText: { color: '#007AFF', fontWeight: '600', fontSize: 13, marginTop: 5 },
    badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
    badgeText: { color: 'white', fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase' },
    
    // Botão Cancelar
    cancelLink: { marginTop: 10, alignSelf: 'flex-start' },
    cancelLinkText: { color: '#FF3B30', fontSize: 12, fontWeight: '600', textDecorationLine: 'underline' },

    rateBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#333', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 15, gap: 4 },
    rateBtnText: { color: 'white', fontSize: 12, fontWeight: 'bold' },

    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
    modalContent: { backgroundColor: 'white', borderRadius: 20, padding: 25, width: '100%', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.25, elevation: 5 },
    modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 10 },
    modalSubtitle: { textAlign: 'center', color: '#666', marginBottom: 20 },
    starsContainer: { flexDirection: 'row', gap: 10, marginBottom: 30 },
    modalButtons: { flexDirection: 'row', width: '100%', gap: 10 },
    cancelBtn: { flex: 1, padding: 15, borderRadius: 10, backgroundColor: '#eee', alignItems: 'center' },
    cancelText: { fontWeight: 'bold', color: '#666' },
    submitBtn: { flex: 1, padding: 15, borderRadius: 10, backgroundColor: '#333', alignItems: 'center' },
    submitText: { fontWeight: 'bold', color: 'white' }
});