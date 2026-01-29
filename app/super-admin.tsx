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
import { sendNotification } from '../utils/notifications';

// --- TIPOS ---
type Ticket = {
    id: number;
    user_id: string;
    nome?: string;      // Legado
    email?: string;     // Legado
    assunto: string;
    status: 'aberto' | 'resolvido';
    created_at: string;
    // Adicionado relacionamento com profiles
    profiles?: {
        nome: string;
        email: string;
    };
};

type Message = {
    id: number;
    message: string;
    sender_id: string;
    created_at: string;
};

export default function SuperAdminScreen() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const flatListRef = useRef<FlatList>(null);

    // --- ESTADO GERAL ---
    const [activeTab, setActiveTab] = useState<'create' | 'manage' | 'admins' | 'tickets'>('create');
    const [myAdminId, setMyAdminId] = useState<string | null>(null);

    // --- DADOS ---
    const [users, setUsers] = useState<any[]>([]);
    const [salons, setSalons] = useState<any[]>([]);
    const [fetchingData, setFetchingData] = useState(false);

    // --- SELEÇÃO EM MASSA ---
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedSalons, setSelectedSalons] = useState<string[]>([]);

    // --- FORMULÁRIO ---
    const [salonName, setSalonName] = useState('');
    const [selectedUser, setSelectedUser] = useState<any>(null);
    const [modalVisible, setModalVisible] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // --- TICKETS & CHAT ---
    const [loadingTickets, setLoadingTickets] = useState(false);
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [ticketFilter, setTicketFilter] = useState<'aberto' | 'resolvido'>('aberto');

    // Chat States
    const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [sendingMsg, setSendingMsg] = useState(false);

    useEffect(() => {
        getAdminProfile();
        fetchUsers();
        fetchSalons();
    }, []);

    useEffect(() => {
        if (activeTab === 'tickets') fetchTickets();
    }, [activeTab]);

    // NOVO: Subscrever ao chat em tempo real
    useEffect(() => {
        if (!selectedTicket) return;

        const channel = supabase.channel(`admin_chat_${selectedTicket.id}`)
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
                    setMessages((current) => {
                        if (current.some(m => m.id === newMsg.id)) return current;
                        return [...current, newMsg];
                    });
                }
            )
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [selectedTicket]);

    async function getAdminProfile() {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) setMyAdminId(user.id);
    }

    // --- 1. BUSCAR DADOS ---
    async function fetchUsers() {
        const { data } = await supabase.from('profiles').select('*');
        if (data) setUsers(data);
    }

    async function fetchSalons() {
        setFetchingData(true);
        const { data } = await supabase.from('salons').select('*').order('created_at', { ascending: false });
        if (data) setSalons(data);
        setFetchingData(false);
    }

    async function fetchTickets() {
        setLoadingTickets(true);

        // 1. Buscar TODOS os tickets (sem tentar joins complicados)
        const { data: ticketsData, error: ticketError } = await supabase
            .from('support_tickets')
            .select('*')
            .order('created_at', { ascending: false });

        if (ticketError) {
            console.log("Erro ao buscar tickets:", ticketError);
            Alert.alert("Erro", "Falha ao carregar tickets.");
            setLoadingTickets(false);
            return;
        }

        // Se não houver tickets, pára aqui
        if (!ticketsData || ticketsData.length === 0) {
            setTickets([]);
            setLoadingTickets(false);
            return;
        }

        // 2. Buscar os perfis dos utilizadores que criaram estes tickets
        // (Cria uma lista apenas com os IDs únicos para não repetir buscas)
        const userIds = [...new Set(ticketsData.map(t => t.user_id))];

        const { data: profilesData } = await supabase
            .from('profiles')
            .select('id, nome, email')
            .in('id', userIds);

        // 3. Juntar a informação manualmente (Ticket + Nome do Perfil)
        const ticketsComNomes = ticketsData.map(ticket => {
            // Tenta encontrar o perfil correspondente
            const profile = profilesData?.find(p => p.id === ticket.user_id);

            return {
                ...ticket,
                // Adiciona o objeto profiles manualmente para o resto do código funcionar
                profiles: profile ? { nome: profile.nome, email: profile.email } : null
            };
        });

        setTickets(ticketsComNomes as any);
        setLoadingTickets(false);
    }

    // --- 2. LÓGICA DO CHAT ---
    async function openTicketChat(ticket: Ticket) {
        setSelectedTicket(ticket);
        fetchMessages(ticket.id);
    }

    async function fetchMessages(ticketId: number) {
        const { data } = await supabase
            .from('ticket_messages')
            .select('*')
            .eq('ticket_id', ticketId)
            .order('created_at', { ascending: true });

        if (data) setMessages(data as any);
    }

    async function sendMessage() {
        if (!newMessage.trim() || !selectedTicket || !myAdminId) return;

        setSendingMsg(true);
        try {
            // 1. Inserir a mensagem e recuperar os dados (.select().single())
            const { data: msgData, error } = await supabase.from('ticket_messages').insert({
                ticket_id: selectedTicket.id,
                sender_id: myAdminId, // ID do Admin
                message: newMessage.trim()
            })
                .select()
                .single();

            if (error) throw error;

            // 2. ATUALIZAÇÃO IMEDIATA (Faz a msg aparecer logo no chat)
            if (msgData) {
                setMessages(previous => [...previous, msgData]);
            }

            // 3. Marcar como "NÃO LIDO" pelo utilizador (Bolinha Vermelha no Gerente)
            await supabase
                .from('support_tickets')
                .update({ unread_by_user: true })
                .eq('id', selectedTicket.id);

            // 4. Enviar Notificação Push
            await sendNotification(
                selectedTicket.user_id,
                "Nova mensagem do Suporte",
                `Recebeste uma resposta sobre "${selectedTicket.assunto}".`,
                { screen: '/support-ticket' }
            );

            // 5. Limpar input
            setNewMessage('');

        } catch (error: any) {
            Alert.alert("Erro", "Falha ao enviar mensagem.");
            console.log(error);
        } finally {
            setSendingMsg(false);
        }
    }

    async function toggleTicketStatus() {
        if (!selectedTicket) return;
        const newStatus = selectedTicket.status === 'aberto' ? 'resolvido' : 'aberto';

        Alert.alert("Alterar Estado", `Mudar ticket para ${newStatus.toUpperCase()}?`, [
            { text: "Cancelar", style: "cancel" },
            {
                text: "Confirmar", onPress: async () => {
                    const { error } = await supabase
                        .from('support_tickets')
                        .update({ status: newStatus })
                        .eq('id', selectedTicket.id);

                    if (!error) {
                        setSelectedTicket(prev => prev ? { ...prev, status: newStatus } : null);
                        fetchTickets();
                    }
                }
            }
        ]);
    }

    // --- HELPER PARA NOME DO USER ---
    function getTicketUserName(t: Ticket) {
        if (t.profiles?.nome) return t.profiles.nome;
        if (t.nome) return t.nome;
        return "Utilizador (Sem Nome)";
    }

    function getTicketUserEmail(t: Ticket) {
        if (t.profiles?.email) return t.profiles.email;
        if (t.email) return t.email;
        return "";
    }

    // --- 3. FUNÇÕES DE GESTÃO ---
    function toggleSelectionMode() { setIsSelectionMode(!isSelectionMode); if (isSelectionMode) setSelectedSalons([]); }
    function toggleSalonSelection(id: string) {
        if (selectedSalons.includes(id)) setSelectedSalons(prev => prev.filter(item => item !== id));
        else setSelectedSalons(prev => [...prev, id]);
    }
    function selectAll() {
        if (selectedSalons.length === salons.length) setSelectedSalons([]);
        else setSelectedSalons(salons.map(s => s.id));
    }

    async function handleCreateSalon() {
        if (!salonName || !selectedUser) return Alert.alert("Erro", "Dados em falta.");
        setLoading(true);
        const { error } = await supabase.from('salons').insert({
            nome_salao: salonName, cidade: 'A definir', dono_id: selectedUser.id,
            publico: 'Unissexo', categoria: 'Cabeleireiro', morada: 'A definir',
            hora_abertura: '09:00', hora_fecho: '19:00'
        });
        setLoading(false);
        if (error) Alert.alert("Erro", error.message);
        else { Alert.alert("Sucesso", "Salão criado!"); setSalonName(''); setSelectedUser(null); fetchSalons(); setActiveTab('manage'); }
    }

    async function handleRemoveManager(salonId: string) {
        Alert.alert("Remover", "Remover gerente?", [
            { text: "Cancelar" },
            { text: "Sim", onPress: async () => { await supabase.from('salons').update({ dono_id: null }).eq('id', salonId); fetchSalons(); } }
        ]);
    }

    async function handleDeleteSalon(salonId: string) {
        Alert.alert("Apagar", "Eliminar salão?", [
            { text: "Cancelar" },
            { text: "Apagar", style: 'destructive', onPress: () => performDelete([salonId]) }
        ]);
    }

    async function handleBulkDelete() {
        if (selectedSalons.length === 0) return;
        Alert.alert("Apagar Massa", `Eliminar ${selectedSalons.length}?`, [
            { text: "Cancelar" },
            { text: "Apagar", style: 'destructive', onPress: () => performDelete(selectedSalons) }
        ]);
    }

    async function performDelete(ids: string[]) {
        setLoading(true);
        try {
            await supabase.from('favorites').delete().in('salon_id', ids);
            await supabase.from('reviews').delete().in('salon_id', ids);
            await supabase.from('appointments').delete().in('salon_id', ids);
            await supabase.from('portfolio_images').delete().in('salon_id', ids);
            await supabase.from('services').delete().in('salon_id', ids);
            await supabase.from('salons').delete().in('id', ids);
            setIsSelectionMode(false); setSelectedSalons([]); fetchSalons();
        } catch (e) { Alert.alert("Erro", "Falha ao apagar."); }
        setLoading(false);
    }

    async function toggleSuperAdmin(userId: string, current: boolean) {
        Alert.alert("Admin", `Mudar permissão?`, [
            { text: "Cancelar" },
            {
                text: "Sim", onPress: async () => {
                    await supabase.from('profiles').update({ is_super_admin: !current }).eq('id', userId);
                    setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_super_admin: !current } : u));
                }
            }
        ]);
    }

    // --- FILTROS ---
    const filteredUsers = users.filter(u => (u.nome || '').toLowerCase().includes(searchQuery.toLowerCase()) || (u.email || '').toLowerCase().includes(searchQuery.toLowerCase()));
    const filteredTickets = tickets.filter(t => t.status === ticketFilter);
    function getStatusColor(status: string) { return status === 'aberto' ? '#FF9500' : '#4CD964'; }

    // RENDER SALON
    const renderSalonItem = ({ item }: { item: any }) => {
        const manager = users.find(u => u.id === item.dono_id);
        const isSelected = selectedSalons.includes(item.id);
        return (
            <TouchableOpacity
                style={[styles.salonItem, isSelected && styles.salonItemSelected]}
                onPress={() => isSelectionMode && toggleSalonSelection(item.id)}
                activeOpacity={isSelectionMode ? 0.7 : 1} disabled={!isSelectionMode}
            >
                {isSelectionMode && <Ionicons name={isSelected ? "checkbox" : "square-outline"} size={24} color={isSelected ? "#007AFF" : "#ccc"} style={{ marginRight: 10 }} />}
                <View style={{ flex: 1 }}>
                    <Text style={styles.salonName}>{item.nome_salao}</Text>
                    <Text style={{ fontSize: 12, color: manager ? '#007AFF' : '#FF3B30' }}>{manager ? manager.nome : 'Sem Gerente'}</Text>
                </View>
                {!isSelectionMode && (
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                        {manager && <TouchableOpacity onPress={() => handleRemoveManager(item.id)}><Ionicons name="person-remove" size={20} color="#FF9500" /></TouchableOpacity>}
                        <TouchableOpacity onPress={() => handleDeleteSalon(item.id)}><Ionicons name="trash" size={20} color="#FF3B30" /></TouchableOpacity>
                    </View>
                )}
            </TouchableOpacity>
        );
    };

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><Ionicons name="arrow-back" size={24} color="#1a1a1a" /></TouchableOpacity>
                <Text style={styles.title}>Super Admin</Text>
            </View>

            <View style={styles.tabsContainer}>
                <TouchableOpacity style={[styles.tab, activeTab === 'create' && styles.activeTab]} onPress={() => setActiveTab('create')}><Text style={[styles.tabText, activeTab === 'create' && styles.activeTabText]}>Criar</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.tab, activeTab === 'manage' && styles.activeTab]} onPress={() => { setActiveTab('manage'); fetchSalons(); }}><Text style={[styles.tabText, activeTab === 'manage' && styles.activeTabText]}>Gerir</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.tab, activeTab === 'admins' && styles.activeTab]} onPress={() => { setActiveTab('admins'); fetchUsers(); }}><Text style={[styles.tabText, activeTab === 'admins' && styles.activeTabText]}>Admins</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.tab, activeTab === 'tickets' && styles.activeTab]} onPress={() => setActiveTab('tickets')}>
                    <Text style={[styles.tabText, activeTab === 'tickets' && styles.activeTabText]}>Tickets</Text>
                    {tickets.filter(t => t.status === 'aberto').length > 0 && <View style={styles.tabBadge} />}
                </TouchableOpacity>
            </View>

            {/* ABA CRIAR */}
            {activeTab === 'create' && (
                <ScrollView contentContainerStyle={{ padding: 20 }}>
                    <View style={styles.card}>
                        <Text style={styles.sectionTitle}>Novo Salão</Text>
                        <TextInput style={styles.input} value={salonName} onChangeText={setSalonName} placeholder="Nome do Salão" />
                        <TouchableOpacity style={styles.userSelector} onPress={() => setModalVisible(true)}>
                            <Text style={{ color: selectedUser ? '#000' : '#999' }}>{selectedUser ? selectedUser.nome : "Selecionar Gerente..."}</Text>
                            <Ionicons name="chevron-down" size={20} color="#999" />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.createBtn} onPress={handleCreateSalon} disabled={loading}>
                            {loading ? <ActivityIndicator color="white" /> : <Text style={styles.btnText}>Criar</Text>}
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            )}

            {/* ABA GERIR */}
            {activeTab === 'manage' && (
                <View style={{ flex: 1 }}>
                    <View style={styles.selectionToolbar}>
                        <Text style={styles.listTitle}>{isSelectionMode ? `${selectedSalons.length} selecionados` : `Total: ${salons.length}`}</Text>
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                            {isSelectionMode && <TouchableOpacity onPress={selectAll}><Text style={styles.toolbarActionText}>Todos</Text></TouchableOpacity>}
                            <TouchableOpacity onPress={toggleSelectionMode}><Text style={[styles.toolbarActionText, isSelectionMode ? { color: '#FF3B30' } : { color: '#007AFF' }]}>{isSelectionMode ? 'Cancelar' : 'Selecionar'}</Text></TouchableOpacity>
                        </View>
                    </View>
                    <FlatList data={salons} keyExtractor={item => item.id} contentContainerStyle={{ padding: 20, paddingBottom: 100 }} renderItem={renderSalonItem} />
                    {isSelectionMode && selectedSalons.length > 0 && <TouchableOpacity style={styles.bulkDeleteBtn} onPress={handleBulkDelete}><Ionicons name="trash" size={20} color="white" /></TouchableOpacity>}
                </View>
            )}

            {/* ABA ADMINS */}
            {activeTab === 'admins' && (
                <View style={{ flex: 1 }}>
                    <View style={styles.searchBar}><Ionicons name="search" size={20} color="#999" /><TextInput style={styles.searchInput} placeholder="Pesquisar..." value={searchQuery} onChangeText={setSearchQuery} /></View>
                    <FlatList data={filteredUsers} keyExtractor={item => item.id} contentContainerStyle={{ padding: 20 }} renderItem={({ item }) => (
                        <View style={styles.userItemCard}>
                            <View>
                                <Text style={styles.userName}>{item.nome || 'Sem nome'}</Text>
                                <Text style={styles.userEmail}>{item.email}</Text>
                            </View>
                            <TouchableOpacity onPress={() => toggleSuperAdmin(item.id, item.is_super_admin)}>
                                <Ionicons name={item.is_super_admin ? "arrow-down-circle" : "arrow-up-circle"} size={28} color={item.is_super_admin ? "#D32F2F" : "#2E7D32"} />
                            </TouchableOpacity>
                        </View>
                    )} />
                </View>
            )}

            {/* ABA TICKETS (CHAT) */}
            {activeTab === 'tickets' && (
                <View style={{ flex: 1 }}>
                    <View style={styles.filterContainer}>
                        <TouchableOpacity style={[styles.filterBtn, ticketFilter === 'aberto' && styles.filterBtnActive]} onPress={() => setTicketFilter('aberto')}><Text style={[styles.filterText, ticketFilter === 'aberto' && styles.filterTextActive]}>Pendentes</Text></TouchableOpacity>
                        <TouchableOpacity style={[styles.filterBtn, ticketFilter === 'resolvido' && styles.filterBtnActive]} onPress={() => setTicketFilter('resolvido')}><Text style={[styles.filterText, ticketFilter === 'resolvido' && styles.filterTextActive]}>Resolvidos</Text></TouchableOpacity>
                    </View>
                    <FlatList
                        data={filteredTickets} keyExtractor={(item) => item.id.toString()} contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
                        refreshControl={<RefreshControl refreshing={loadingTickets} onRefresh={fetchTickets} />}
                        ListEmptyComponent={<View style={styles.emptyContainer}><Ionicons name="checkmark-circle-outline" size={64} color="#ccc" /><Text style={styles.emptyText}>Tudo limpo.</Text></View>}
                        renderItem={({ item }) => (
                            <TouchableOpacity style={styles.cardTicket} onPress={() => openTicketChat(item)}>
                                <View style={styles.cardHeader}>
                                    {/* CORREÇÃO AQUI: Usa helper para mostrar nome do Profile */}
                                    <Text style={styles.cardUser}>{getTicketUserName(item)} ({getTicketUserEmail(item)})</Text>
                                    <Text style={styles.cardDate}>{new Date(item.created_at).toLocaleDateString()}</Text>
                                </View>
                                <Text style={styles.cardSubject}>{item.assunto}</Text>
                                <View style={styles.cardFooter}>
                                    <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
                                        <View style={[styles.statusDot, { backgroundColor: getStatusColor(item.status) }]} />
                                        <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>{item.status.toUpperCase()}</Text>
                                    </View>
                                </View>
                            </TouchableOpacity>
                        )}
                    />
                </View>
            )}

            {/* MODAL SELEÇÃO USER */}
            <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalVisible(false)}>
                <View style={styles.modalContainer}>
                    <View style={styles.searchBar}><TextInput style={styles.searchInput} placeholder="Pesquisar..." value={searchQuery} onChangeText={setSearchQuery} /></View>
                    <FlatList data={filteredUsers} keyExtractor={item => item.id} contentContainerStyle={{ padding: 20 }} renderItem={({ item }) => (
                        <TouchableOpacity style={styles.userItem} onPress={() => { setSelectedUser(item); setModalVisible(false); }}>
                            <Text style={styles.userName}>{item.nome || item.email}</Text>
                        </TouchableOpacity>
                    )} />
                </View>
            </Modal>

            {/* MODAL CHAT */}
            <Modal visible={selectedTicket !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelectedTicket(null)}>
                {selectedTicket && (
                    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalContainer} keyboardVerticalOffset={Platform.OS === "ios" ? 40 : 0}>
                        <View style={styles.modalHeader}>
                            <View>
                                <Text style={styles.modalTitle}>{selectedTicket.assunto}</Text>
                                <Text style={{ fontSize: 10, color: '#999' }}>{getTicketUserEmail(selectedTicket)}</Text>
                            </View>
                            <View style={{ flexDirection: 'row', gap: 15, alignItems: 'center' }}>
                                <TouchableOpacity onPress={toggleTicketStatus} style={{ padding: 5 }}>
                                    {selectedTicket.status === 'aberto' ?
                                        <Ionicons name="checkmark-done-circle" size={26} color="#4CD964" /> :
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><Ionicons name="lock-closed" size={14} color="#999" /><Text style={{ fontSize: 10, color: '#999' }}>Reabrir</Text></View>
                                    }
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => setSelectedTicket(null)}><Ionicons name="close-circle" size={28} color="#ccc" /></TouchableOpacity>
                            </View>
                        </View>

                        <FlatList
                            ref={flatListRef}
                            data={messages}
                            keyExtractor={item => item.id.toString()}
                            contentContainerStyle={{ padding: 15, paddingBottom: 20 }}
                            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
                            renderItem={({ item }) => {
                                const isMe = item.sender_id === myAdminId;
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
                                    placeholder="Escreve a resposta..."
                                    value={newMessage}
                                    onChangeText={setNewMessage}
                                    multiline={true} // <--- ADICIONADO
                                    textAlignVertical="top" // <--- ADICIONADO
                                />
                                <TouchableOpacity style={styles.sendIconBtn} onPress={sendMessage} disabled={sendingMsg}>
                                    {sendingMsg ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={20} color="white" />}
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <View style={styles.closedBanner}>
                                <Ionicons name="lock-closed" size={18} color="#666" />
                                <Text style={styles.closedText}>Ticket Resolvido.</Text>
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
    header: { flexDirection: 'row', alignItems: 'center', padding: 20, gap: 15 },
    backBtn: { padding: 8, backgroundColor: 'white', borderRadius: 10 },
    title: { fontSize: 24, fontWeight: 'bold' },

    tabsContainer: { flexDirection: 'row', marginHorizontal: 20, marginBottom: 15, backgroundColor: '#e1e1e1', borderRadius: 12, padding: 4 },
    tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
    activeTab: { backgroundColor: 'white' },
    tabText: { fontWeight: '600', color: '#666', fontSize: 12 },
    activeTabText: { color: '#1a1a1a' },
    tabBadge: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF3B30', position: 'absolute', top: 8, right: 8 },

    card: { backgroundColor: 'white', padding: 20, borderRadius: 16, marginBottom: 20 },
    sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 20 },
    input: { backgroundColor: '#f5f5f5', padding: 15, borderRadius: 10, marginBottom: 15 },
    userSelector: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, backgroundColor: '#f5f5f5', borderRadius: 10, marginBottom: 20 },
    createBtn: { backgroundColor: '#1a1a1a', padding: 15, borderRadius: 12, alignItems: 'center' },
    btnText: { color: 'white', fontWeight: 'bold' },

    selectionToolbar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 10 },
    listTitle: { color: '#666' },
    toolbarActionText: { color: '#007AFF', fontWeight: '600' },
    salonItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', padding: 15, borderRadius: 12, marginBottom: 10 },
    salonItemSelected: { backgroundColor: '#F0F9FF', borderColor: '#007AFF', borderWidth: 1 },
    salonName: { fontWeight: 'bold', fontSize: 16 },
    bulkDeleteBtn: { position: 'absolute', bottom: 30, alignSelf: 'center', backgroundColor: '#FF3B30', padding: 15, borderRadius: 30 },
    userItemCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white', padding: 15, borderRadius: 12, marginBottom: 10 },
    userName: { fontWeight: 'bold' },
    userEmail: { color: '#888', fontSize: 12 },

    filterContainer: { flexDirection: 'row', padding: 15, gap: 10 },
    filterBtn: { flex: 1, paddingVertical: 8, backgroundColor: 'white', borderRadius: 20, alignItems: 'center', borderWidth: 1, borderColor: '#eee' },
    filterBtnActive: { backgroundColor: '#1a1a1a', borderColor: '#1a1a1a' },
    filterText: { fontWeight: '600', color: '#666', fontSize: 12 },
    filterTextActive: { color: 'white' },
    cardTicket: { backgroundColor: 'white', marginBottom: 10, padding: 15, borderRadius: 12 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
    cardUser: { fontSize: 12, fontWeight: 'bold', color: '#666' },
    cardDate: { fontSize: 12, color: '#999' },
    cardSubject: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 5 },
    cardFooter: { flexDirection: 'row', justifyContent: 'space-between' },
    statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, gap: 5 },
    statusDot: { width: 6, height: 6, borderRadius: 3 },
    statusText: { fontSize: 10, fontWeight: 'bold' },

    emptyContainer: { alignItems: 'center', marginTop: 50, gap: 10 },
    emptyText: { color: '#999' },

    modalContainer: { flex: 1, backgroundColor: '#f2f2f2' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#eee' },
    modalTitle: { fontSize: 16, fontWeight: 'bold' },

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
    },
    sendIconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#007AFF', justifyContent: 'center', alignItems: 'center' },

    searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f5f5', marginHorizontal: 20, marginBottom: 10, padding: 12, borderRadius: 10, gap: 10 },
    searchInput: { flex: 1 },
    userItem: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#eee' },

    closedBanner: { padding: 20, backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10, borderTopWidth: 1, borderTopColor: '#e0e0e0', marginBottom: 20 },
    closedText: { color: '#666', fontSize: 13, fontWeight: '600' },
});