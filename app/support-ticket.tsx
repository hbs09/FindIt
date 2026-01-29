import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../supabase';

type Ticket = {
    id: number;
    assunto: string;
    status: 'aberto' | 'resolvido';
    created_at: string;
    user_id: string;
    unread_by_user: boolean;
};

type Message = {
    id: number;
    message: string;
    sender_id: string;
    created_at: string;
};

export default function SupportTicketScreen() {
    const router = useRouter();

    const [activeTab, setActiveTab] = useState<'new' | 'history'>('new');
    const [loading, setLoading] = useState(false);
    const [myUserId, setMyUserId] = useState<string | null>(null);

    const [subject, setSubject] = useState('');
    const [firstMessage, setFirstMessage] = useState('');

    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [refreshing, setRefreshing] = useState(false);

    const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [sendingMsg, setSendingMsg] = useState(false);

    const flatListRef = useRef<FlatList>(null);

    // Verifica se existe ALGUM ticket não lido para mostrar a bolinha na aba
    const hasUnread = tickets.some(t => t.unread_by_user);

    useEffect(() => {
        getCurrentUser();
        fetchMyTickets(); // <--- Carrega logo para atualizar o badge da aba
        setupTicketsRealtime();
    }, []);



    const setupTicketsRealtime = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const channel = supabase.channel('my_tickets_list_updates')
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'support_tickets',
                    filter: `user_id=eq.${user.id}`
                },
                (payload) => {
                    setTickets(currentTickets =>
                        currentTickets.map(t =>
                            t.id === payload.new.id ? { ...t, ...payload.new } : t
                        )
                    );
                }
            )
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    };

    // Subscrever ao chat em tempo real
    useEffect(() => {
        if (!selectedTicket) return;

        // Cria o canal para ouvir mensagens deste ticket
        const channel = supabase.channel(`chat_room_${selectedTicket.id}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'ticket_messages',
                    filter: `ticket_id=eq.${selectedTicket.id}`
                },
                (payload) => {
                    const newMsg = payload.new as Message;
                    // Adiciona à lista APENAS se ainda não existir (evita duplicados do envio manual)
                    setMessages((current) => {
                        if (current.some(m => m.id === newMsg.id)) return current;
                        return [...current, newMsg];
                    });
                }
            )
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [selectedTicket]);

    async function getCurrentUser() {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) setMyUserId(user.id);
    }

    async function fetchMyTickets() {
        setRefreshing(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const { data } = await supabase
                .from('support_tickets')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });
            if (data) setTickets(data as any);
        }
        setRefreshing(false);
    }

    async function fetchMessages(ticketId: number) {
        const { data } = await supabase
            .from('ticket_messages')
            .select('*')
            .eq('ticket_id', ticketId)
            .order('created_at', { ascending: true });

        if (data) setMessages(data as any);
    }

    function openTicket(ticket: Ticket) {
        setSelectedTicket(ticket);
        fetchMessages(ticket.id);

        if (ticket.unread_by_user) {
            supabase.from('support_tickets')
                .update({ unread_by_user: false })
                .eq('id', ticket.id)
                .then(() => {
                    setTickets(prev => prev.map(t => t.id === ticket.id ? { ...t, unread_by_user: false } : t));
                });
        }
    }

    async function createTicket() {
        if (!subject.trim() || !firstMessage.trim()) return Alert.alert("Atenção", "Preenche tudo.");
        if (!myUserId) return;

        setLoading(true);
        try {
            const { data: ticketData, error } = await supabase
                .from('support_tickets')
                .insert({
                    user_id: myUserId,
                    assunto: subject.trim(),
                    status: 'aberto',
                    unread_by_user: false
                })
                .select()
                .single();

            if (error) throw error;

            await supabase.from('ticket_messages').insert({
                ticket_id: ticketData.id,
                sender_id: myUserId,
                message: firstMessage.trim()
            });

            Alert.alert("Sucesso", "Ticket criado!");
            setSubject(''); setFirstMessage('');
            setActiveTab('history');
            fetchMyTickets();

        } catch (error: any) {
            Alert.alert("Erro", error.message);
        } finally {
            setLoading(false);
        }
    }

    // Substitui a função sendMessage no app/support-ticket.tsx por esta:
    async function sendMessage() {
        // Validação simples
        if (!newMessage.trim() || !selectedTicket || !myUserId) return;

        setSendingMsg(true);
        try {
            // 1. Inserir a mensagem na base de dados
            const { data: msgData, error } = await supabase.from('ticket_messages').insert({
                ticket_id: selectedTicket.id,
                sender_id: myUserId, // Aqui é sempre o ID do utilizador logado
                message: newMessage.trim()
            })
                .select()
                .single();

            if (error) throw error;

            // 2. Atualização Otimista (Mostrar logo a mensagem no chat)
            if (msgData) {
                setMessages(previous => [...previous, msgData]);
            }

            // 3. Lógica específica do Gerente:
            // Se o ticket estava "resolvido", reabre-o automaticamente ao enviar nova mensagem
            if (selectedTicket.status === 'resolvido') {
                await supabase.from('support_tickets')
                    .update({ status: 'aberto' })
                    .eq('id', selectedTicket.id);

                // Atualiza o estado local do modal
                setSelectedTicket(prev => prev ? { ...prev, status: 'aberto' } : null);

                // Atualiza a lista de fundo também
                setTickets(prev => prev.map(t => t.id === selectedTicket!.id ? { ...t, status: 'aberto' } : t));
            }

            setNewMessage('');

        } catch (error: any) {
            Alert.alert("Erro", "Falha ao enviar mensagem.");
            console.log(error);
        } finally {
            setSendingMsg(false);
        }
    }

    async function closeTicket() {
        if (!selectedTicket) return;
        Alert.alert("Fechar Ticket", "O problema foi resolvido?", [
            { text: "Cancelar", style: "cancel" },
            {
                text: "Sim, fechar", onPress: async () => {
                    await supabase.from('support_tickets').update({ status: 'resolvido' }).eq('id', selectedTicket.id);
                    setSelectedTicket(prev => prev ? { ...prev, status: 'resolvido' } : null);
                }
            }
        ]);
    }

    function getStatusColor(status: string) { return status === 'aberto' ? '#FF9500' : '#4CD964'; }

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><Ionicons name="arrow-back" size={24} color="#1a1a1a" /></TouchableOpacity>
                <Text style={styles.headerTitle}>Ajuda & Suporte</Text>
                <View style={{ width: 40 }} />
            </View>

            {/* --- ABAS COM BOLINHA NO BOTÃO --- */}
            <View style={styles.tabsContainer}>
                <TouchableOpacity style={[styles.tab, activeTab === 'new' && styles.activeTab]} onPress={() => setActiveTab('new')}>
                    <Ionicons name="create-outline" size={18} color={activeTab === 'new' ? '#1a1a1a' : '#999'} />
                    <Text style={[styles.tabText, activeTab === 'new' && styles.activeTabText]}>Novo Pedido</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.tab, activeTab === 'history' && styles.activeTab]} onPress={() => setActiveTab('history')}>
                    <Ionicons name="time-outline" size={18} color={activeTab === 'history' ? '#1a1a1a' : '#999'} />
                    <Text style={[styles.tabText, activeTab === 'history' && styles.activeTabText]}>Histórico</Text>

                    {/* AQUI ESTÁ A NOVA BOLINHA NA ABA */}
                    {hasUnread && <View style={styles.tabBadge} />}
                </TouchableOpacity>
            </View>

            {activeTab === 'new' && (
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                    <ScrollView contentContainerStyle={{ padding: 20 }}>
                        <View style={styles.card}>
                            <Text style={styles.welcomeTitle}>Nova Conversa</Text>
                            <Text style={styles.label}>ASSUNTO</Text>
                            <TextInput style={styles.input} value={subject} onChangeText={setSubject} placeholder="Resumo do problema" />
                            <Text style={styles.label}>MENSAGEM</Text>
                            <TextInput style={[styles.input, styles.textArea]} value={firstMessage} onChangeText={setFirstMessage} placeholder="Descreve os detalhes..." multiline textAlignVertical="top" />
                            <TouchableOpacity style={styles.submitBtn} onPress={createTicket} disabled={loading}>
                                {loading ? <ActivityIndicator color="white" /> : <Text style={styles.submitBtnText}>Iniciar Conversa</Text>}
                            </TouchableOpacity>
                        </View>
                    </ScrollView>
                </KeyboardAvoidingView>
            )}

            {activeTab === 'history' && (
                <FlatList
                    data={tickets}
                    keyExtractor={item => item.id.toString()}
                    contentContainerStyle={{ padding: 20 }}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchMyTickets} />}
                    ListEmptyComponent={<Text style={styles.emptyText}>Sem tickets.</Text>}
                    renderItem={({ item }) => (
                        <TouchableOpacity style={styles.ticketCard} onPress={() => openTicket(item)}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                                {/* Mantive a bolinha aqui também mas ajustei o layout para não tapar o texto */}
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                                    {item.unread_by_user && <View style={styles.unreadDotList} />}
                                    <Text style={[styles.ticketSubject, item.unread_by_user && { fontWeight: '800' }]} numberOfLines={1}>
                                        {item.assunto}
                                    </Text>
                                </View>

                                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
                                    <View style={[styles.statusDot, { backgroundColor: getStatusColor(item.status) }]} />
                                    <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>{item.status.toUpperCase()}</Text>
                                </View>
                            </View>
                            <Text style={styles.dateText}>Criado a {new Date(item.created_at).toLocaleDateString()}</Text>
                        </TouchableOpacity>
                    )}
                />
            )}

            <Modal visible={selectedTicket !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelectedTicket(null)}>
                {selectedTicket && (
                    <KeyboardAvoidingView
                        behavior={Platform.OS === "ios" ? "padding" : "height"}
                        style={styles.modalContainer}
                        keyboardVerticalOffset={Platform.OS === "ios" ? 40 : 0}
                    >
                        <View style={styles.modalHeader}>
                            <View>
                                <Text style={styles.modalTitle}>{selectedTicket.assunto}</Text>
                                <Text style={[styles.modalSubtitle, { color: getStatusColor(selectedTicket.status) }]}>{selectedTicket.status.toUpperCase()}</Text>
                            </View>
                            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                                {selectedTicket.status === 'aberto' ? (
                                    // BOTÃO PARA RESOLVER (Mais intuitivo)
                                    <TouchableOpacity
                                        onPress={closeTicket}
                                        style={{
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            gap: 6,
                                            backgroundColor: '#E8F5E9', // Fundo verde claro
                                            paddingVertical: 6,
                                            paddingHorizontal: 12,
                                            borderRadius: 20
                                        }}
                                    >
                                        <Ionicons name="checkmark-done" size={16} color="#2E7D32" />
                                        <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#2E7D32' }}>Fechar</Text>
                                    </TouchableOpacity>
                                ) : (
                                    // ETIQUETA DE FECHADO
                                    <View style={{
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        gap: 5,
                                        backgroundColor: '#F5F5F5', // Fundo cinza
                                        paddingVertical: 6,
                                        paddingHorizontal: 12,
                                        borderRadius: 20
                                    }}>
                                        <Ionicons name="lock-closed" size={12} color="#999" />
                                        <Text style={{ fontSize: 12, color: '#999', fontWeight: '600' }}>Resolvido</Text>
                                    </View>
                                )}

                                {/* Botão de Fechar Modal (X) */}
                                <TouchableOpacity onPress={() => setSelectedTicket(null)}>
                                    <Ionicons name="close-circle" size={30} color="#ddd" />
                                </TouchableOpacity>
                            </View>
                        </View>

                        <FlatList
                            ref={flatListRef}
                            data={messages}
                            keyExtractor={item => item.id.toString()}
                            contentContainerStyle={{ padding: 15, paddingBottom: 20 }}
                            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
                            onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
                            renderItem={({ item }) => {
                                const isMe = item.sender_id === myUserId;
                                return (
                                    <View style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowOther]}>
                                        <View style={[styles.msgBubble, isMe ? styles.msgBubbleMe : styles.msgBubbleOther]}>
                                            <Text style={[styles.msgText, isMe ? styles.msgTextMe : styles.msgTextOther]}>{item.message}</Text>
                                            <Text style={[styles.msgDate, isMe ? { color: 'rgba(255,255,255,0.7)' } : { color: '#999' }]}>
                                                {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </Text>
                                        </View>
                                    </View>
                                );
                            }}
                        />

                        {selectedTicket.status === 'aberto' ? (
                            <View style={styles.chatInputContainer}>
                                <TextInput
                                    style={styles.chatInput}
                                    placeholder="Escreve uma mensagem..."
                                    value={newMessage}
                                    onChangeText={setNewMessage}
                                    multiline={true} // <--- ISTO PERMITE QUEBRA DE LINHA
                                    textAlignVertical="top" // Garante que o texto começa no topo (Android)
                                />
                                <TouchableOpacity style={styles.sendIconBtn} onPress={sendMessage} disabled={sendingMsg}>
                                    {sendingMsg ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={20} color="white" />}
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <View style={styles.closedBanner}>
                                <Ionicons name="lock-closed" size={18} color="#666" />
                                <Text style={styles.closedText}>Este ticket foi resolvido. Cria um novo se precisares de ajuda.</Text>
                            </View>
                        )}
                    </KeyboardAvoidingView>
                )}
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8f9fa' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 10 },
    backBtn: { padding: 8, backgroundColor: 'white', borderRadius: 12 },
    headerTitle: { fontSize: 18, fontWeight: 'bold' },

    // TABS E BADGE
    tabsContainer: { flexDirection: 'row', backgroundColor: 'white', margin: 20, borderRadius: 12, padding: 4 },
    tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 8, gap: 6 },
    activeTab: { backgroundColor: '#f0f0f0' },
    tabText: { fontWeight: '600', color: '#999' },
    activeTabText: { color: '#1a1a1a' },

    // ESTILO DA NOVA BOLINHA NA ABA
    tabBadge: {
        position: 'absolute',
        top: 8,
        right: 20,
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#FF3B30',
        borderWidth: 1,
        borderColor: 'white'
    },

    card: { backgroundColor: 'white', borderRadius: 16, padding: 20 },
    welcomeTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 20 },
    label: { fontSize: 12, fontWeight: 'bold', color: '#999', marginBottom: 6, marginTop: 10 },
    input: { backgroundColor: '#f8f9fa', borderRadius: 10, padding: 15, fontSize: 16, borderWidth: 1, borderColor: '#eee' },
    textArea: { height: 100 },
    submitBtn: { backgroundColor: '#1a1a1a', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 25 },
    submitBtnText: { color: 'white', fontWeight: 'bold' },
    emptyText: { textAlign: 'center', marginTop: 50, color: '#999' },

    ticketCard: { backgroundColor: 'white', padding: 15, borderRadius: 12, marginBottom: 10 },
    ticketSubject: { fontSize: 16, fontWeight: 'bold', color: '#333' },
    dateText: { fontSize: 12, color: '#ccc', marginTop: 5 },
    statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, gap: 5 },
    statusDot: { width: 6, height: 6, borderRadius: 3 },
    statusText: { fontSize: 10, fontWeight: 'bold' },

    // BOLINHA DENTRO DA LISTA (Ajustada)
    unreadDotList: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#007AFF' }, // Azul para diferenciar ou vermelho se preferires

    // Modal & Chat
    modalContainer: { flex: 1, backgroundColor: '#f2f2f2' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#eee' },
    modalTitle: { fontSize: 16, fontWeight: 'bold' },
    modalSubtitle: { fontSize: 10, fontWeight: 'bold', marginTop: 2 },

    msgRow: { flexDirection: 'row', marginBottom: 10 },
    msgRowMe: { justifyContent: 'flex-end' },
    msgRowOther: { justifyContent: 'flex-start' },
    msgBubble: { padding: 12, borderRadius: 16, maxWidth: '80%' },
    msgBubbleMe: { backgroundColor: '#007AFF', borderBottomRightRadius: 2 },
    msgBubbleOther: { backgroundColor: 'white', borderBottomLeftRadius: 2 },
    msgText: { fontSize: 15 },
    msgTextMe: { color: 'white' },
    msgTextOther: { color: '#333' },
    msgDate: { fontSize: 10, marginTop: 4, textAlign: 'right' },

    chatInputContainer: { flexDirection: 'row', padding: 10, backgroundColor: 'white', alignItems: 'center', gap: 10 },
    chatInput: {
        flex: 1,
        backgroundColor: '#f8f9fa',
        borderRadius: 20,
        paddingHorizontal: 15,
        paddingVertical: 10,
        maxHeight: 100,
        // minHeight: 40 // (Opcional) Se quiseres forçar uma altura mínima
    }, sendIconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#007AFF', justifyContent: 'center', alignItems: 'center' },

    closedBanner: { padding: 20, backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10, borderTopWidth: 1, borderTopColor: '#e0e0e0', marginBottom: 20 },
    closedText: { color: '#666', fontSize: 13, fontWeight: '600' }
});