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
    const [activeTab, setActiveTab] = useState<'create' | 'manage' | 'admins'>('create');

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

    // --- 6. ALTERAR VISIBILIDADE (NOVO) ---
    async function toggleVisibility(id: string, currentStatus: boolean) {
        const { error } = await supabase
            .from('salons')
            .update({ is_visible: !currentStatus })
            .eq('id', id);

        if (error) {
            Alert.alert("Erro", "Falha ao atualizar visibilidade.");
        } else {
            // Atualiza a lista localmente para refletir a mudança imediata
            setSalons(prev => prev.map(s => s.id === id ? { ...s, is_visible: !currentStatus } : s));
        }
    }

    // Filtros de Users
   // Filtros de Users + Ordenação (Admins no topo)
    const filteredUsers = users
        .filter(u =>
            (u.nome?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
            (u.email?.toLowerCase() || '').includes(searchQuery.toLowerCase())
        )
        .sort((a, b) => {
            // Lógica de Ordenação:
            // 1. Prioridade: Quem é Super Admin vem primeiro
            if (a.is_super_admin === b.is_super_admin) {
                // 2. Desempate: Se tiverem o mesmo estatuto, ordena alfabeticamente pelo nome
                return (a.nome || '').localeCompare(b.nome || '');
            }
            // Se 'a' é admin (true) vem antes (-1) de 'b' (false)
            return a.is_super_admin ? -1 : 1;
        });

    // --- 7. GERIR ADMINS (ATUALIZADO) ---
    // --- 7. GERIR ADMINS (COM DEBUG) ---
   // --- 7. GERIR ADMINS (VERSÃO ROBUSTA) ---
    async function toggleSuperAdmin(userId: string, currentStatus: boolean) {
        const newStatus = !currentStatus; // O estado para o qual queremos mudar
        const action = newStatus ? "promover" : "remover";
        
        Alert.alert(
            "Alterar Permissões",
            `Tens a certeza que queres ${action} este utilizador a Super Admin?`,
            [
                { text: "Cancelar", style: "cancel" },
                {
                    text: "Confirmar",
                    onPress: async () => {
                        console.log(`Tentativa: Mudar user ${userId} de ${currentStatus} para ${newStatus}`);

                        // 1. Enviar update ao Supabase e pedir o retorno (.select())
                        const { data, error } = await supabase
                            .from('profiles')
                            .update({ is_super_admin: newStatus })
                            .eq('id', userId)
                            .select(); 

                        // 2. Verificar erros técnicos
                        if (error) {
                            console.error("Erro Supabase:", error);
                            return Alert.alert("Erro", "Falha técnica: " + error.message);
                        }

                        // 3. Verificar se o RLS bloqueou (retornou array vazio)
                        if (!data || data.length === 0) {
                            return Alert.alert("Bloqueado", "A base de dados ignorou o comando. Verifica se o RLS está desativado na tabela 'profiles'.");
                        }

                        // 4. Verificar se o valor foi REALMENTE alterado na BD
                        const updatedUser = data[0];
                        if (updatedUser.is_super_admin !== newStatus) {
                            return Alert.alert("Falha Silenciosa", "O comando correu, mas o valor na base de dados não mudou. Tenta de novo.");
                        }

                        // 5. Sucesso confirmado! Atualizar a UI
                        Alert.alert("Sucesso", `Utilizador ${action === "promover" ? "promovido a" : "removido de"} Super Admin.`);
                        
                        setUsers(prev => prev.map(u => 
                            u.id === userId ? { ...u, is_super_admin: newStatus } : u
                        ));
                    }
                }
            ]
        );
    }

    // Renderizar Item da Lista de Salões
    // Renderizar Item da Lista de Salões
    const renderSalonItem = ({ item }: { item: any }) => {
        const manager = users.find(u => u.id === item.dono_id);
        const isSelected = selectedSalons.includes(item.id);
        // Assume true se o campo não existir ainda na BD para evitar erros visuais
        const isVisible = item.is_visible !== false;

        return (
            <TouchableOpacity
                style={[
                    styles.salonItem,
                    isSelected && styles.salonItemSelected,
                    !isVisible && styles.cardInvisible // Estilo novo para ocultos
                ]}
                onPress={() => {
                    if (isSelectionMode) toggleSalonSelection(item.id);
                }}
                activeOpacity={isSelectionMode ? 0.7 : 1}
                disabled={!isSelectionMode}
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

                    {!isVisible && (
                        <Text style={styles.hiddenLabel}>[OCULTO]</Text>
                    )}

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

                {/* Ações Individuais */}
                {!isSelectionMode && (
                    <View style={styles.actionsContainer}>

                        {/* BOTÃO DE VISIBILIDADE (NOVO) */}
                        <TouchableOpacity
                            style={[styles.actionBtn, isVisible ? styles.btnVisible : styles.btnHidden]}
                            onPress={() => toggleVisibility(item.id, isVisible)}
                        >
                            <Ionicons
                                name={isVisible ? "eye" : "eye-off"}
                                size={20}
                                color="white"
                            />
                        </TouchableOpacity>

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
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
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
                    disabled={isSelectionMode}
                >
                    <Text style={[styles.tabText, activeTab === 'create' && styles.activeTabText]}>Novo Salão</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                    style={[styles.tab, activeTab === 'manage' && styles.activeTab]} 
                    onPress={() => { setActiveTab('manage'); fetchSalons(); }}
                >
                    <Text style={[styles.tabText, activeTab === 'manage' && styles.activeTabText]}>Gerir Salões</Text>
                </TouchableOpacity>

                {/* --- NOVA ABA ADMINS --- */}
                <TouchableOpacity 
                    style={[styles.tab, activeTab === 'admins' && styles.activeTab]} 
                    onPress={() => { setActiveTab('admins'); fetchUsers(); }}
                >
                    <Text style={[styles.tabText, activeTab === 'admins' && styles.activeTabText]}>Admins</Text>
                </TouchableOpacity>
            </View>

            {/* --- CONTEÚDO: ABA CRIAR --- */}
            {activeTab === 'create' && (
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
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
                                        <Ionicons name="checkmark-circle" size={24} color="#2E7D32" style={{ marginLeft: 'auto' }} />
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
                <View style={{ flex: 1, backgroundColor: '#f8f9fa' }}>

                    {/* Toolbar de Seleção */}
                    <View style={styles.selectionToolbar}>
                        <Text style={styles.listTitle}>
                            {isSelectionMode ? `${selectedSalons.length} selecionados` : `Total: ${salons.length} salões`}
                        </Text>

                        <View style={{ flexDirection: 'row', gap: 10 }}>
                            {isSelectionMode && (
                                <TouchableOpacity onPress={selectAll}>
                                    <Text style={styles.toolbarActionText}>Todos</Text>
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity onPress={toggleSelectionMode}>
                                <Text style={[styles.toolbarActionText, isSelectionMode ? { color: '#FF3B30' } : { color: '#007AFF' }]}>
                                    {isSelectionMode ? 'Cancelar' : 'Selecionar'}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {fetchingData ? (
                        <ActivityIndicator style={{ marginTop: 50 }} color="#007AFF" />
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

            {/* --- CONTEÚDO: ABA ADMINS (COLAR AQUI) --- */}
            {activeTab === 'admins' && (
                <View style={{flex: 1, backgroundColor: '#f8f9fa'}}>
                    {/* Barra de Pesquisa de Users */}
                    <View style={styles.searchBar}>
                        <Ionicons name="search" size={20} color="#999" />
                        <TextInput 
                            style={styles.searchInput}
                            placeholder="Pesquisar utilizadores..."
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                        />
                    </View>

                    <FlatList
                        data={filteredUsers}
                        keyExtractor={(item) => item.id}
                        contentContainerStyle={{ padding: 20 }}
                        renderItem={({ item }) => (
                            <View style={styles.userItemCard}>
                                <View style={{flexDirection: 'row', alignItems: 'center', flex: 1}}>
                                    {/* Avatar */}
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
                                    
                                    {/* Info do User */}
                                    <View style={{marginLeft: 12, flex: 1}}>
                                        <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
                                            <Text style={styles.userName}>{item.nome || 'Sem nome'}</Text>
                                            {item.is_super_admin && (
                                                <View style={styles.adminBadge}>
                                                    <Text style={styles.adminBadgeText}>ADMIN</Text>
                                                </View>
                                            )}
                                        </View>
                                        <Text style={styles.userEmail}>{item.email}</Text>
                                    </View>
                                </View>

                                {/* Botão de Promover/Despromover */}
                                <TouchableOpacity 
                                    style={[
                                        styles.actionBtn, 
                                        item.is_super_admin ? {backgroundColor: '#FFEBEE'} : {backgroundColor: '#E8F5E9'}
                                    ]}
                                    onPress={() => toggleSuperAdmin(item.id, item.is_super_admin)}
                                >
                                    <Ionicons 
                                        name={item.is_super_admin ? "arrow-down" : "arrow-up"} 
                                        size={20} 
                                        color={item.is_super_admin ? "#D32F2F" : "#2E7D32"} 
                                    />
                                </TouchableOpacity>
                            </View>
                        )}
                    />
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
                                <View style={{ flex: 1 }}>
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
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 10
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
    searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f5f5', marginHorizontal:20, marginVertical: 0, padding: 12, borderRadius: 10, gap: 10 },
    searchInput: { flex: 1, fontSize: 16 },
    userItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#f5f5f5', gap: 15 },
    avatarContainer: { width: 50, height: 50, borderRadius: 25, overflow: 'hidden' },
    avatarImg: { width: '100%', height: '100%', resizeMode: 'cover' },
    avatarPlaceholder: { width: '100%', height: '100%', backgroundColor: '#e1e1e1', justifyContent: 'center', alignItems: 'center' },
    avatarText: { fontSize: 20, fontWeight: 'bold', color: '#666' },
    userName: { fontSize: 16, fontWeight: '600', color: '#333' },
    userEmail: { fontSize: 14, color: '#888' },
    emptyText: { textAlign: 'center', marginTop: 50, color: '#999' },

    cardInvisible: {
        backgroundColor: '#f0f0f0',
        borderColor: '#ddd',
        borderWidth: 1,
        opacity: 0.8
    },
    hiddenLabel: {
        fontSize: 10,
        fontWeight: 'bold',
        color: '#999',
        marginBottom: 4
    },
    btnVisible: {
        backgroundColor: '#4CD964', // Verde
    },
    btnHidden: {
        backgroundColor: '#999', // Cinzento
    },
    userItemCard: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: 'white', padding: 15, borderRadius: 12, marginBottom: 10,
        shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4, elevation: 2
    },
    adminBadge: {
        backgroundColor: '#1a1a1a', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4
    },
    adminBadgeText: {
        color: 'white', fontSize: 10, fontWeight: 'bold'
    }
});