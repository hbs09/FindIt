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

    // --- SELEÇÃO EM MASSA (NOVO) ---
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedSalons, setSelectedSalons] = useState<string[]>([]);

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
        fetchUsers(); 
    }

    // --- LÓGICA DE SELEÇÃO (NOVO) ---
    function toggleSelectionMode() {
        if (isSelectionMode) {
            // Cancelar seleção
            setIsSelectionMode(false);
            setSelectedSalons([]);
        } else {
            // Ativar modo
            setIsSelectionMode(true);
        }
    }

    function toggleSalonSelection(id: string) {
        if (selectedSalons.includes(id)) {
            setSelectedSalons(prev => prev.filter(item => item !== id));
        } else {
            setSelectedSalons(prev => [...prev, id]);
        }
    }

    function selectAll() {
        if (selectedSalons.length === salons.length) {
            setSelectedSalons([]);
        } else {
            setSelectedSalons(salons.map(s => s.id));
        }
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
            fetchSalons(); 
            setActiveTab('manage'); 
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
                            .update({ dono_id: null }) 
                            .eq('id', salonId);

                        if (error) {
                            Alert.alert("Erro", error.message);
                        } else {
                            fetchSalons(); 
                        }
                    }
                }
            ]
        );
    }

    // --- 4. ELIMINAR SALÃO (INDIVIDUAL) ---
    async function handleDeleteSalon(salonId: string, salonName: string) {
        Alert.alert(
            "Eliminar Salão",
            `Atenção! Esta ação irá apagar o salão "${salonName}" e TODOS os dados associados.`,
            [
                { text: "Cancelar", style: "cancel" },
                {
                    text: "Eliminar TUDO",
                    style: "destructive",
                    onPress: () => performDelete([salonId])
                }
            ]
        );
    }

    // --- 5. ELIMINAR EM MASSA (NOVO) ---
    async function handleBulkDelete() {
        if (selectedSalons.length === 0) return;

        Alert.alert(
            "Eliminar em Massa",
            `Vais eliminar ${selectedSalons.length} salões e todos os seus dados. Esta ação é irreversível.`,
            [
                { text: "Cancelar", style: "cancel" },
                {
                    text: `Eliminar ${selectedSalons.length} Salões`,
                    style: "destructive",
                    onPress: () => performDelete(selectedSalons)
                }
            ]
        );
    }

    // Função auxiliar que executa a eliminação real
    async function performDelete(idsToDelete: string[]) {
        setLoading(true);
        try {
            // Eliminar dados associados em lote usando o operador 'in'
            await supabase.from('favorites').delete().in('salon_id', idsToDelete);
            await supabase.from('reviews').delete().in('salon_id', idsToDelete);
            await supabase.from('appointments').delete().in('salon_id', idsToDelete);
            await supabase.from('portfolio_images').delete().in('salon_id', idsToDelete);
            await supabase.from('services').delete().in('salon_id', idsToDelete);

            // Eliminar os salões
            const { error } = await supabase
                .from('salons')
                .delete()
                .in('id', idsToDelete);

            if (error) throw error;

            Alert.alert("Sucesso", "Operação concluída.");
            setIsSelectionMode(false);
            setSelectedSalons([]);
            fetchSalons();

        } catch (error: any) {
            Alert.alert("Erro ao eliminar", error.message);
        } finally {
            setLoading(false);
        }
    }

    // Filtros de Users
    const filteredUsers = users.filter(u => 
        (u.nome?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
        (u.email?.toLowerCase() || '').includes(searchQuery.toLowerCase())
    );

    // Renderizar Item da Lista de Salões
    const renderSalonItem = ({ item }: { item: any }) => {
        const manager = users.find(u => u.id === item.dono_id);
        const isSelected = selectedSalons.includes(item.id);

        return (
            <TouchableOpacity 
                style={[styles.salonItem, isSelected && styles.salonItemSelected]}
                onPress={() => {
                    if (isSelectionMode) toggleSalonSelection(item.id);
                }}
                activeOpacity={isSelectionMode ? 0.7 : 1}
                disabled={!isSelectionMode} // Se não estiver em modo seleção, o toque no card não faz nada (botões fazem)
            >
                {/* Checkbox de Seleção */}
                {isSelectionMode && (
                    <View style={styles.selectionIndicator}>
                        {isSelected ? (
                            <Ionicons name="checkbox" size={24} color="#007AFF" />
                        ) : (
                            <Ionicons name="square-outline" size={24} color="#ccc" />
                        )}
                    </View>
                )}

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

                {/* Ações Individuais (Escondidas no modo de seleção para limpar a UI) */}
                {!isSelectionMode && (
                    <View style={styles.actionsContainer}>
                        {manager && (
                            <TouchableOpacity 
                                style={styles.actionBtn} 
                                onPress={() => handleRemoveManager(item.id, item.nome_salao)}
                            >
                                <Ionicons name="person-remove-outline" size={20} color="#FF9500" />
                            </TouchableOpacity>
                        )}

                        <TouchableOpacity 
                            style={[styles.actionBtn, styles.deleteBtn]} 
                            onPress={() => handleDeleteSalon(item.id, item.nome_salao)}
                        >
                            <Ionicons name="trash-outline" size={20} color="#FF3B30" />
                        </TouchableOpacity>
                    </View>
                )}
            </TouchableOpacity>
        );
    };

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            
            {/* Header */}
            <View style={styles.header}>
                <View style={{flexDirection: 'row', alignItems: 'center'}}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={24} color="#1a1a1a" />
                    </TouchableOpacity>
                    <Text style={styles.title}>Super Admin</Text>
                </View>
            </View>

            {/* Abas (Tabs) */}
            <View style={styles.tabsContainer}>
                <TouchableOpacity 
                    style={[styles.tab, activeTab === 'create' && styles.activeTab]} 
                    onPress={() => setActiveTab('create')}
                    disabled={isSelectionMode} // Bloqueia abas durante seleção
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
                    
                    {/* Toolbar de Seleção */}
                    <View style={styles.selectionToolbar}>
                        <Text style={styles.listTitle}>
                            {isSelectionMode ? `${selectedSalons.length} selecionados` : `Total: ${salons.length} salões`}
                        </Text>
                        
                        <View style={{flexDirection: 'row', gap: 10}}>
                            {isSelectionMode && (
                                <TouchableOpacity onPress={selectAll}>
                                    <Text style={styles.toolbarActionText}>Todos</Text>
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity onPress={toggleSelectionMode}>
                                <Text style={[styles.toolbarActionText, isSelectionMode ? {color: '#FF3B30'} : {color: '#007AFF'}]}>
                                    {isSelectionMode ? 'Cancelar' : 'Selecionar'}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>

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

                    {/* Barra Flutuante de Eliminação */}
                    {isSelectionMode && selectedSalons.length > 0 && (
                        <View style={styles.bulkDeleteBar}>
                            <View style={styles.bulkDeleteInfo}>
                                <Text style={styles.bulkDeleteText}>
                                    Eliminar {selectedSalons.length} {selectedSalons.length === 1 ? 'item' : 'itens'}?
                                </Text>
                            </View>
                            <TouchableOpacity style={styles.bulkDeleteBtn} onPress={handleBulkDelete}>
                                <Ionicons name="trash" size={20} color="white" />
                            </TouchableOpacity>
                        </View>
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
    
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 15, marginTop: 10 },
    backBtn: { marginRight: 15, padding: 8, backgroundColor: 'white', borderRadius: 10 },
    title: { fontSize: 24, fontWeight: 'bold' },

    // Tabs
    tabsContainer: { flexDirection: 'row', marginHorizontal: 20, marginBottom: 15, backgroundColor: '#e1e1e1', borderRadius: 12, padding: 4 },
    tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
    activeTab: { backgroundColor: 'white', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 2, elevation: 1 },
    tabText: { fontWeight: '600', color: '#666' },
    activeTabText: { color: '#1a1a1a' },

    // Selection Toolbar
    selectionToolbar: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#f8f9fa',
        borderBottomWidth: 1, borderBottomColor: '#eee'
    },
    listTitle: { fontSize: 14, fontWeight: '600', color: '#666' },
    toolbarActionText: { fontSize: 16, fontWeight: '600', color: '#007AFF' },

    // Lista de Salões (Manage Tab)
    salonItem: { 
        backgroundColor: 'white', padding: 15, borderRadius: 12, marginBottom: 12, 
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 5, elevation: 1,
        borderWidth: 2, borderColor: 'transparent' // Prepare for selection border
    },
    salonItemSelected: {
        borderColor: '#007AFF', backgroundColor: '#F0F9FF'
    },
    selectionIndicator: { marginRight: 10 },
    salonInfo: { flex: 1, marginRight: 10 },
    salonName: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 6 },
    managerBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0F9FF', alignSelf: 'flex-start', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8 },
    tinyAvatar: { width: 20, height: 20, borderRadius: 10, marginRight: 6 },
    tinyAvatarPlaceholder: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#007AFF', marginRight: 6, justifyContent: 'center', alignItems: 'center' },
    tinyAvatarText: { color: 'white', fontSize: 10, fontWeight: 'bold' },
    managerName: { fontSize: 12, color: '#007AFF', fontWeight: '600' },
    noManagerText: { fontSize: 12, color: '#FF3B30', fontStyle: 'italic', marginTop: 2 },
    
    actionsContainer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    actionBtn: { padding: 10, backgroundColor: '#FFF3E0', borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
    deleteBtn: { backgroundColor: '#FFEBEE' },

    // Bulk Delete Bar
    bulkDeleteBar: {
        position: 'absolute', bottom: 30, left: 20, right: 20,
        backgroundColor: '#1a1a1a', borderRadius: 50,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingVertical: 12, paddingHorizontal: 20,
        shadowColor: '#000', shadowOffset: {width:0,height:4}, shadowOpacity:0.3, shadowRadius:8, elevation:10
    },
    bulkDeleteInfo: { flex: 1 },
    bulkDeleteText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
    bulkDeleteBtn: { backgroundColor: '#FF3B30', padding: 10, borderRadius: 20 },

    // Card Criar (Mantido igual)
    card: { backgroundColor: 'white', padding: 20, borderRadius: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
    sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 20 },
    label: { fontSize: 12, fontWeight: 'bold', color: '#666', marginBottom: 8, marginTop: 15 },
    input: { backgroundColor: '#f5f5f5', padding: 15, borderRadius: 10, borderWidth: 1, borderColor: '#eee', fontSize: 16 },
    createBtn: { backgroundColor: '#1a1a1a', padding: 18, borderRadius: 12, alignItems: 'center', marginTop: 30 },
    btnText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
    
    // User Selector (Mantido igual)
    userSelector: { backgroundColor: '#f0f9ff', borderWidth: 1, borderColor: '#007AFF', borderRadius: 10, padding: 15, borderStyle: 'dashed' },
    placeholderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    placeholderText: { color: '#007AFF', fontWeight: '500' },
    selectedUserRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    selectedUserName: { fontWeight: 'bold', color: '#1a1a1a' },
    selectedUserEmail: { fontSize: 12, color: '#666' },
    avatarSmall: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#007AFF', justifyContent: 'center', alignItems: 'center' },
    avatarSmallImg: { width: 40, height: 40, borderRadius: 20, resizeMode: 'cover' },
    avatarTextSmall: { color: 'white', fontWeight: 'bold' },

    // Modal (Mantido igual)
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