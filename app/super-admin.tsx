import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Image,
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

export default function SuperAdminScreen() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    
    // --- ESTADO DAS ABAS ---
    const [activeTab, setActiveTab] = useState<'create' | 'manage'>('create');

    // --- DADOS ---
    const [users, setUsers] = useState<any[]>([]);
    const [salons, setSalons] = useState<any[]>([]);
    const [fetchingData, setFetchingData] = useState(false);

    // --- FORMULÁRIO DE CRIAÇÃO ---
    const [salonName, setSalonName] = useState('');
    const [selectedUser, setSelectedUser] = useState<any>(null);

    // --- SELETOR DE USER ---
    const [modalVisible, setModalVisible] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        fetchUsers();
        fetchSalons();
    }, []);

    // --- 1. BUSCAR DADOS ---
    async function fetchUsers() {
        const { data, error } = await supabase.from('profiles').select('*');
        if (!error) setUsers(data || []);
    }

    async function fetchSalons() {
        setFetchingData(true);
        const { data, error } = await supabase
            .from('salons')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) console.log("Erro ao buscar salões:", error);
        else setSalons(data || []);
        
        setFetchingData(false);
    }

    function openUserSelector() {
        setModalVisible(true);
        fetchUsers(); // Garante dados frescos
    }

    // --- 2. CRIAR SALÃO ---
    async function handleCreateSalon() {
        if (!salonName || !selectedUser) {
            return Alert.alert("Erro", "Preenche o nome e seleciona um gerente.");
        }
        setLoading(true);

        const { error } = await supabase.from('salons').insert({
            nome_salao: salonName,
            cidade: 'A definir',
            dono_id: selectedUser.id,
            publico: 'Unissexo',
            categoria: 'Cabeleireiro',
            morada: 'A definir',
            hora_abertura: '09:00',
            hora_fecho: '19:00'
        });

        setLoading(false);

        if (error) {
            Alert.alert("Erro", error.message);
        } else {
            Alert.alert("Sucesso", "Salão criado!");
            setSalonName('');
            setSelectedUser(null);
            fetchSalons(); // Atualiza a lista
            setActiveTab('manage'); // Vai para a lista para veres o resultado
        }
    }

    // --- 3. REMOVER GERENTE ---
    async function handleRemoveManager(salonId: string, salonName: string) {
        Alert.alert(
            "Remover Gerente",
            `Tens a certeza que queres deixar o salão "${salonName}" sem gerente?`,
            [
                { text: "Cancelar", style: "cancel" },
                {
                    text: "Remover",
                    style: "destructive",
                    onPress: async () => {
                        const { error } = await supabase
                            .from('salons')
                            .update({ dono_id: null }) // Define como NULL
                            .eq('id', salonId);

                        if (error) {
                            Alert.alert("Erro", error.message);
                        } else {
                            fetchSalons(); // Atualiza a lista visualmente
                        }
                    }
                }
            ]
        );
    }

    // --- 4. ELIMINAR SALÃO (ATUALIZADO) ---
    async function handleDeleteSalon(salonId: string, salonName: string) {
        Alert.alert(
            "Eliminar Salão",
            `Atenção! Esta ação irá apagar o salão "${salonName}" e TODOS os dados associados (histórico, favoritos, serviços, etc). Confirmas?`,
            [
                { text: "Cancelar", style: "cancel" },
                {
                    text: "Eliminar TUDO",
                    style: "destructive",
                    onPress: async () => {
                        setLoading(true); // Opcional: Adicionar estado de loading se quiseres feedback visual
                        
                        try {
                            // 1. Apagar Favoritos
                            await supabase.from('favorites').delete().eq('salon_id', salonId);
                            
                            // 2. Apagar Reviews
                            await supabase.from('reviews').delete().eq('salon_id', salonId);

                            // 3. Apagar Agendamentos
                            await supabase.from('appointments').delete().eq('salon_id', salonId);

                            // 4. Apagar Imagens do Portfólio
                            await supabase.from('portfolio_images').delete().eq('salon_id', salonId);

                            // 5. Apagar Serviços
                            await supabase.from('services').delete().eq('salon_id', salonId);

                            // 6. Finalmente, Apagar o Salão
                            const { error } = await supabase
                                .from('salons')
                                .delete()
                                .eq('id', salonId);

                            if (error) throw error;

                            Alert.alert("Sucesso", "Salão e todos os dados associados foram eliminados.");
                            fetchSalons(); // Atualiza a lista

                        } catch (error: any) {
                            Alert.alert("Erro ao eliminar", error.message);
                        } finally {
                            setLoading(false);
                        }
                    }
                }
            ]
        );
    }

    // Filtros
    const filteredUsers = users.filter(u => 
        (u.nome?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
        (u.email?.toLowerCase() || '').includes(searchQuery.toLowerCase())
    );

    // Renderizar Item da Lista de Salões
    const renderSalonItem = ({ item }: { item: any }) => {
        // Encontra o user correspondente na lista de perfis
        const manager = users.find(u => u.id === item.dono_id);

        return (
            <View style={styles.salonItem}>
                <View style={styles.salonInfo}>
                    <Text style={styles.salonName}>{item.nome_salao}</Text>
                    
                    {manager ? (
                        <View style={styles.managerBadge}>
                            {manager.avatar_url ? (
                                <Image source={{ uri: manager.avatar_url }} style={styles.tinyAvatar} />
                            ) : (
                                <View style={styles.tinyAvatarPlaceholder}>
                                    <Text style={styles.tinyAvatarText}>
                                        {(manager.nome || '?').charAt(0).toUpperCase()}
                                    </Text>
                                </View>
                            )}
                            <Text style={styles.managerName}>{manager.nome || manager.email}</Text>
                        </View>
                    ) : (
                        <Text style={styles.noManagerText}>Sem Gerente ⚠️</Text>
                    )}
                </View>

                {/* Container de Ações */}
                <View style={styles.actionsContainer}>
                    {/* Botão de Remover Gerente (Só aparece se houver gerente) */}
                    {manager && (
                        <TouchableOpacity 
                            style={styles.actionBtn} 
                            onPress={() => handleRemoveManager(item.id, item.nome_salao)}
                        >
                            <Ionicons name="person-remove-outline" size={20} color="#FF9500" />
                        </TouchableOpacity>
                    )}

                    {/* Botão de Eliminar Salão */}
                    <TouchableOpacity 
                        style={[styles.actionBtn, styles.deleteBtn]} 
                        onPress={() => handleDeleteSalon(item.id, item.nome_salao)}
                    >
                        <Ionicons name="trash-outline" size={20} color="#FF3B30" />
                    </TouchableOpacity>
                </View>
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color="#1a1a1a" />
                </TouchableOpacity>
                <Text style={styles.title}>Super Admin</Text>
            </View>

            {/* Abas (Tabs) */}
            <View style={styles.tabsContainer}>
                <TouchableOpacity 
                    style={[styles.tab, activeTab === 'create' && styles.activeTab]} 
                    onPress={() => setActiveTab('create')}
                >
                    <Text style={[styles.tabText, activeTab === 'create' && styles.activeTabText]}>Novo Salão</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                    style={[styles.tab, activeTab === 'manage' && styles.activeTab]} 
                    onPress={() => { setActiveTab('manage'); fetchSalons(); }}
                >
                    <Text style={[styles.tabText, activeTab === 'manage' && styles.activeTabText]}>Gerir Salões</Text>
                </TouchableOpacity>
            </View>

            {/* --- CONTEÚDO: ABA CRIAR --- */}
            {activeTab === 'create' && (
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{flex:1}}>
                    <ScrollView contentContainerStyle={{ padding: 20 }}>
                        <View style={styles.card}>
                            <Text style={styles.sectionTitle}>Atribuir Novo Salão</Text>
                            
                            <Text style={styles.label}>NOME DO SALÃO</Text>
                            <TextInput 
                                style={styles.input} 
                                value={salonName} 
                                onChangeText={setSalonName}
                                placeholder="Ex: Cortes & Co." 
                            />

                            <Text style={styles.label}>GERENTE</Text>
                            <TouchableOpacity style={styles.userSelector} onPress={openUserSelector}>
                                {selectedUser ? (
                                    <View style={styles.selectedUserRow}>
                                        {selectedUser.avatar_url ? (
                                            <Image source={{ uri: selectedUser.avatar_url }} style={styles.avatarSmallImg} />
                                        ) : (
                                            <View style={styles.avatarSmall}>
                                                <Text style={styles.avatarTextSmall}>
                                                    {(selectedUser.nome || selectedUser.email).charAt(0).toUpperCase()}
                                                </Text>
                                            </View>
                                        )}
                                        <View>
                                            <Text style={styles.selectedUserName}>{selectedUser.nome || 'Sem nome'}</Text>
                                            <Text style={styles.selectedUserEmail}>{selectedUser.email}</Text>
                                        </View>
                                        <Ionicons name="checkmark-circle" size={24} color="#2E7D32" style={{marginLeft: 'auto'}} />
                                    </View>
                                ) : (
                                    <View style={styles.placeholderRow}>
                                        <Text style={styles.placeholderText}>Selecionar utilizador...</Text>
                                        <Ionicons name="chevron-down" size={20} color="#666" />
                                    </View>
                                )}
                            </TouchableOpacity>

                            <TouchableOpacity 
                                style={[styles.createBtn, loading && { opacity: 0.7 }]} 
                                onPress={handleCreateSalon} 
                                disabled={loading}
                            >
                                {loading ? <ActivityIndicator color="white" /> : <Text style={styles.btnText}>Criar e Associar</Text>}
                            </TouchableOpacity>
                        </View>
                    </ScrollView>
                </KeyboardAvoidingView>
            )}

            {/* --- CONTEÚDO: ABA GERIR --- */}
            {activeTab === 'manage' && (
                <View style={{flex: 1, backgroundColor: '#f8f9fa'}}>
                    {fetchingData ? (
                        <ActivityIndicator style={{marginTop: 50}} color="#007AFF" />
                    ) : (
                        <FlatList
                            data={salons}
                            keyExtractor={(item) => item.id}
                            contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
                            refreshControl={<RefreshControl refreshing={fetchingData} onRefresh={fetchSalons} />}
                            ListEmptyComponent={<Text style={styles.emptyText}>Sem salões criados.</Text>}
                            renderItem={renderSalonItem}
                        />
                    )}
                </View>
            )}

            {/* --- MODAL DE SELEÇÃO DE USER --- */}
            <Modal
                visible={modalVisible}
                animationType="slide"
                presentationStyle="pageSheet"
                onRequestClose={() => setModalVisible(false)}
            >
                <View style={styles.modalContainer}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>Selecionar Gerente</Text>
                        <TouchableOpacity onPress={() => setModalVisible(false)}>
                            <Text style={styles.closeText}>Fechar</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.searchBar}>
                        <Ionicons name="search" size={20} color="#999" />
                        <TextInput 
                            style={styles.searchInput}
                            placeholder="Pesquisar..."
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                        />
                    </View>

                    <FlatList
                        data={filteredUsers}
                        keyExtractor={(item) => item.id}
                        contentContainerStyle={{ padding: 20 }}
                        renderItem={({ item }) => (
                            <TouchableOpacity 
                                style={styles.userItem} 
                                onPress={() => { setSelectedUser(item); setModalVisible(false); }}
                            >
                                <View style={styles.avatarContainer}>
                                    {item.avatar_url ? (
                                        <Image source={{ uri: item.avatar_url }} style={styles.avatarImg} />
                                    ) : (
                                        <View style={styles.avatarPlaceholder}>
                                            <Text style={styles.avatarText}>
                                                {(item.nome || item.email || '?').charAt(0).toUpperCase()}
                                            </Text>
                                        </View>
                                    )}
                                </View>
                                <View style={{flex: 1}}>
                                    <Text style={styles.userName}>{item.nome || 'Sem nome'}</Text>
                                    <Text style={styles.userEmail}>{item.email}</Text>
                                </View>
                                <Ionicons name="chevron-forward" size={20} color="#ccc" />
                            </TouchableOpacity>
                        )}
                    />
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8f9fa' },
    
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 15, marginTop: 10 },
    backBtn: { marginRight: 15, padding: 8, backgroundColor: 'white', borderRadius: 10 },
    title: { fontSize: 24, fontWeight: 'bold' },

    // Tabs
    tabsContainer: { flexDirection: 'row', marginHorizontal: 20, marginBottom: 15, backgroundColor: '#e1e1e1', borderRadius: 12, padding: 4 },
    tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
    activeTab: { backgroundColor: 'white', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 2, elevation: 1 },
    tabText: { fontWeight: '600', color: '#666' },
    activeTabText: { color: '#1a1a1a' },

    // Card Criar
    card: { backgroundColor: 'white', padding: 20, borderRadius: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
    sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 20 },
    label: { fontSize: 12, fontWeight: 'bold', color: '#666', marginBottom: 8, marginTop: 15 },
    input: { backgroundColor: '#f5f5f5', padding: 15, borderRadius: 10, borderWidth: 1, borderColor: '#eee', fontSize: 16 },
    createBtn: { backgroundColor: '#1a1a1a', padding: 18, borderRadius: 12, alignItems: 'center', marginTop: 30 },
    btnText: { color: 'white', fontWeight: 'bold', fontSize: 16 },

    // User Selector
    userSelector: { backgroundColor: '#f0f9ff', borderWidth: 1, borderColor: '#007AFF', borderRadius: 10, padding: 15, borderStyle: 'dashed' },
    placeholderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    placeholderText: { color: '#007AFF', fontWeight: '500' },
    selectedUserRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    selectedUserName: { fontWeight: 'bold', color: '#1a1a1a' },
    selectedUserEmail: { fontSize: 12, color: '#666' },

    // Avatares
    avatarSmall: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#007AFF', justifyContent: 'center', alignItems: 'center' },
    avatarSmallImg: { width: 40, height: 40, borderRadius: 20, resizeMode: 'cover' },
    avatarTextSmall: { color: 'white', fontWeight: 'bold' },

    // Lista de Salões (Manage Tab)
    salonItem: { 
        backgroundColor: 'white', padding: 15, borderRadius: 12, marginBottom: 12, 
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 5, elevation: 1
    },
    salonInfo: { flex: 1, marginRight: 10 },
    salonName: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 6 },
    managerBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0F9FF', alignSelf: 'flex-start', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8 },
    tinyAvatar: { width: 20, height: 20, borderRadius: 10, marginRight: 6 },
    tinyAvatarPlaceholder: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#007AFF', marginRight: 6, justifyContent: 'center', alignItems: 'center' },
    tinyAvatarText: { color: 'white', fontSize: 10, fontWeight: 'bold' },
    managerName: { fontSize: 12, color: '#007AFF', fontWeight: '600' },
    noManagerText: { fontSize: 12, color: '#FF3B30', fontStyle: 'italic', marginTop: 2 },
    
    // Botões de Ação (NOVO)
    actionsContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8
    },
    actionBtn: { 
        padding: 10, 
        backgroundColor: '#FFF3E0', // Laranja claro (Remover Gerente)
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center'
    },
    deleteBtn: {
        backgroundColor: '#FFEBEE', // Vermelho claro (Eliminar Salão)
    },

    // Modal
    modalContainer: { flex: 1, backgroundColor: '#fff' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#eee' },
    modalTitle: { fontSize: 18, fontWeight: 'bold' },
    closeText: { color: '#007AFF', fontSize: 16, fontWeight: '600' },
    searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f5f5', margin: 20, padding: 12, borderRadius: 10, gap: 10 },
    searchInput: { flex: 1, fontSize: 16 },
    userItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#f5f5f5', gap: 15 },
    avatarContainer: { width: 50, height: 50, borderRadius: 25, overflow: 'hidden' },
    avatarImg: { width: '100%', height: '100%', resizeMode: 'cover' },
    avatarPlaceholder: { width: '100%', height: '100%', backgroundColor: '#e1e1e1', justifyContent: 'center', alignItems: 'center' },
    avatarText: { fontSize: 20, fontWeight: 'bold', color: '#666' },
    userName: { fontSize: 16, fontWeight: '600', color: '#333' },
    userEmail: { fontSize: 14, color: '#888' },
    emptyText: { textAlign: 'center', marginTop: 50, color: '#999' }
});