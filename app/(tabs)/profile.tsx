import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../supabase';

export default function ProfileScreen() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [profile, setProfile] = useState<any>(null);
    const [isManager, setIsManager] = useState(false);

    // --- ESTADOS PARA EDIÇÃO DE NOME ---
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [newName, setNewName] = useState('');
    const [savingName, setSavingName] = useState(false);

    // --- 1. ESTADO DE SUPER ADMIN (Vem da Base de Dados) ---
    const [isSuperAdmin, setIsSuperAdmin] = useState(false);

    useEffect(() => {
        getProfile();
    }, []);

    async function getProfile() {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            setProfile({
                email: user.email,
                name: user.user_metadata?.full_name || 'Utilizador',
                avatar_url: user.user_metadata?.avatar_url,
                id: user.id
            });

            // --- 2. VERIFICAR SE É SUPER ADMIN NA TABELA PROFILES ---
            const { data: profileData } = await supabase
                .from('profiles')
                .select('is_super_admin')
                .eq('id', user.id)
                .single();

            if (profileData && profileData.is_super_admin === true) {
                setIsSuperAdmin(true);
            } else {
                setIsSuperAdmin(false);
            }

            // --- VERIFICAR SE É GERENTE DE ALGUM SALÃO ---
            const { count } = await supabase
                .from('salons')
                .select('*', { count: 'exact', head: true })
                .eq('dono_id', user.id);
            
            if (count && count > 0) setIsManager(true);

        } catch (error) {
            console.log(error);
        } finally {
            setLoading(false);
        }
    }

    async function pickImage() {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.5,
            });

            if (!result.canceled && result.assets && result.assets.length > 0) {
                uploadAvatar(result.assets[0].uri);
            }
        } catch (error) {
            Alert.alert("Erro", "Não foi possível abrir a galeria.");
        }
    }

    async function uploadAvatar(uri: string) {
        setUploading(true);
        try {
            const response = await fetch(uri);
            const arrayBuffer = await response.arrayBuffer();
            const fileExt = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
            const fileName = `${Date.now()}.${fileExt}`;
            const filePath = `${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(filePath, arrayBuffer, {
                    contentType: `image/${fileExt}`,
                    upsert: true
                });

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('avatars')
                .getPublicUrl(filePath);

            const { error: updateError } = await supabase.auth.updateUser({
                data: { avatar_url: publicUrl }
            });

            if (updateError) throw updateError;

            setProfile((prev: any) => ({ ...prev, avatar_url: publicUrl }));
            Alert.alert("Sucesso", "Foto de perfil atualizada!");

        } catch (error) {
            console.log(error);
            Alert.alert("Erro", "Falha ao carregar a imagem.");
        } finally {
            setUploading(false);
        }
    }

    // --- FUNÇÃO PARA ABRIR MODAL DE EDIÇÃO ---
    function openEditName() {
        setNewName(profile?.name || '');
        setEditModalVisible(true);
    }

    // --- FUNÇÃO PARA GUARDAR O NOVO NOME ---
    async function saveName() {
        if (!newName.trim()) {
            return Alert.alert("Atenção", "O nome não pode estar vazio.");
        }
        
        setSavingName(true);
        try {
            // Atualiza no Supabase Auth (User Metadata)
            const { error } = await supabase.auth.updateUser({
                data: { full_name: newName.trim() }
            });

            if (error) throw error;

            // Atualiza estado local
            setProfile((prev: any) => ({ ...prev, name: newName.trim() }));
            setEditModalVisible(false);
            Alert.alert("Sucesso", "Nome atualizado!");

        } catch (error: any) {
            Alert.alert("Erro", error.message);
        } finally {
            setSavingName(false);
        }
    }

    async function handleLogout() {
        Alert.alert("Sair", "Tens a certeza que queres sair?", [
            { text: "Cancelar", style: "cancel" },
            { 
                text: "Sair", 
                style: "destructive", 
                onPress: async () => {
                    await supabase.auth.signOut();
                    router.replace('/login');
                } 
            }
        ]);
    }

    if (loading) return <View style={styles.center}><ActivityIndicator color="#333" /></View>;

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
                
                <View style={styles.header}>
                    <TouchableOpacity 
                        style={styles.avatarContainer} 
                        onPress={pickImage}
                        disabled={uploading}
                    >
                        {uploading ? (
                            <ActivityIndicator color="#333" />
                        ) : profile?.avatar_url ? (
                            <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} />
                        ) : (
                            <Text style={styles.avatarText}>
                                {profile?.name?.charAt(0).toUpperCase() || 'U'}
                            </Text>
                        )}

                        <View style={styles.cameraIconBadge}>
                            <Ionicons name="camera" size={14} color="white" />
                        </View>
                    </TouchableOpacity>

                    {/* --- NOME COM ÍCONE DE EDIÇÃO (POSICIONAMENTO ABSOLUTO) --- */}
                    <View style={styles.nameRow}>
                        <Text style={styles.name}>{profile?.name}</Text>
                        
                        <TouchableOpacity onPress={openEditName} style={styles.editIconBtn}>
                            <Ionicons name="pencil" size={14} color="#007AFF" />
                        </TouchableOpacity>
                    </View>
                    
                    <Text style={styles.email}>{profile?.email}</Text>
                </View>

                {/* --- BOTÃO SECRETO PARA ADMIN (Agora depende da BD) --- */}
                {isSuperAdmin && (
                    <TouchableOpacity 
                        style={styles.adminButton}
                        onPress={() => router.push('/super-admin')}
                    >
                        <Ionicons name="shield-checkmark" size={20} color="white" />
                        <Text style={{ color: 'white', fontWeight: 'bold' }}>Super Admin</Text>
                    </TouchableOpacity>
                )}

                <View style={styles.menuSection}>
                    <Text style={styles.sectionTitle}>Conta</Text>
                    
                    <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/history')}>
                        <View style={styles.menuIconBg}><Ionicons name="time-outline" size={20} color="#333" /></View>
                        <Text style={styles.menuText}>Marcações</Text>
                        <Ionicons name="chevron-forward" size={20} color="#ccc" />
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/favorites')}>
                        <View style={styles.menuIconBg}><Ionicons name="heart-outline" size={20} color="#333" /></View>
                        <Text style={styles.menuText}>Favoritos</Text>
                        <Ionicons name="chevron-forward" size={20} color="#ccc" />
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/notifications')}>
                        <View style={styles.menuIconBg}><Ionicons name="notifications-outline" size={20} color="#333" /></View>
                        <Text style={styles.menuText}>Notificações</Text>
                        <Ionicons name="chevron-forward" size={20} color="#ccc" />
                    </TouchableOpacity>
                </View>

                {isManager && (
                    <View style={styles.menuSection}>
                        <Text style={styles.sectionTitle}>Profissional</Text>
                        <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/manager')}>
                            <View style={[styles.menuIconBg, {backgroundColor:'#333'}]}><Ionicons name="briefcase-outline" size={20} color="white" /></View>
                            <Text style={styles.menuText}>Gerir Negócio</Text>
                            <Ionicons name="chevron-forward" size={20} color="#ccc" />
                        </TouchableOpacity>
                    </View>
                )}

                <View style={styles.menuSection}>
                    <TouchableOpacity style={styles.menuItem} onPress={handleLogout}>
                        <View style={[styles.menuIconBg, {backgroundColor:'#FFEBEE'}]}><Ionicons name="log-out-outline" size={20} color="#D32F2F" /></View>
                        <Text style={[styles.menuText, {color: '#D32F2F'}]}>Terminar Sessão</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.footer}>
                    <Text style={styles.versionText}>FindIt v1.0.0</Text>
                </View>

                {/* --- MODAL DE EDIÇÃO DE NOME --- */}
                <Modal
                    animationType="fade"
                    transparent={true}
                    visible={editModalVisible}
                    onRequestClose={() => setEditModalVisible(false)}
                >
                    <KeyboardAvoidingView 
                        behavior={Platform.OS === "ios" ? "padding" : "height"}
                        style={styles.modalOverlay}
                    >
                        <View style={styles.modalContent}>
                            <Text style={styles.modalTitle}>Editar Nome</Text>
                            <Text style={styles.modalSubtitle}>Como queres ser chamado?</Text>

                            <TextInput
                                style={styles.input}
                                value={newName}
                                onChangeText={setNewName}
                                placeholder="O teu nome"
                                autoFocus={true}
                            />

                            <View style={styles.modalButtons}>
                                <TouchableOpacity 
                                    style={[styles.modalBtn, styles.modalBtnCancel]} 
                                    onPress={() => setEditModalVisible(false)}
                                >
                                    <Text style={styles.modalBtnTextCancel}>Cancelar</Text>
                                </TouchableOpacity>

                                <TouchableOpacity 
                                    style={[styles.modalBtn, styles.modalBtnSave]} 
                                    onPress={saveName}
                                    disabled={savingName}
                                >
                                    {savingName ? (
                                        <ActivityIndicator color="white" size="small" />
                                    ) : (
                                        <Text style={styles.modalBtnTextSave}>Guardar</Text>
                                    )}
                                </TouchableOpacity>
                            </View>
                        </View>
                    </KeyboardAvoidingView>
                </Modal>

            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8f9fa' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    
    header: { alignItems: 'center', paddingVertical: 40 },
    
    avatarContainer: {
        width: 100, height: 100, borderRadius: 50, backgroundColor: '#e1e1e1',
        justifyContent: 'center', alignItems: 'center', marginBottom: 15,
        borderWidth: 3, borderColor: 'white',
        shadowColor: '#000', shadowOffset: {width:0, height:5}, shadowOpacity:0.1, shadowRadius:5, elevation:5,
        position: 'relative'
    },
    avatarImage: {
        width: '100%', height: '100%', borderRadius: 50, resizeMode: 'cover'
    },
    avatarText: { fontSize: 40, fontWeight: 'bold', color: '#666' },
    
    cameraIconBadge: {
        position: 'absolute', bottom: 0, right: 0,
        backgroundColor: '#1a1a1a', width: 30, height: 30, borderRadius: 15,
        justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'white'
    },

    // --- ESTILOS DE NOME COM ÍCONE ABSOLUTO ---
    nameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative', 
        marginBottom: 4,
        marginTop: 10,
        // Garante que a linha tem tamanho mínimo para o ícone não cortar se o nome for curto
        minWidth: 100 
    },
    editIconBtn: {
        position: 'absolute',
        right: -32, // Empurra o ícone para fora do texto
        padding: 6,
        backgroundColor: '#E3F2FD',
        borderRadius: 15,
        top: 2, // Ajuste fino vertical
    },

    name: { 
        fontSize: 24, 
        fontWeight: 'bold', 
        color: '#333',
        textAlign: 'center' 
    },
    
    email: { fontSize: 14, color: '#888', marginTop: 4 },

    adminButton: {
        backgroundColor: '#FF3B30', 
        padding: 15, 
        borderRadius: 10, 
        marginHorizontal: 20,
        marginBottom: 20,
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 10
    },

    menuSection: {
        backgroundColor: 'white', marginHorizontal: 20, marginBottom: 15, borderRadius: 20, 
        paddingVertical: 8, paddingHorizontal: 5, 
        shadowColor: '#000', shadowOffset: {width:0, height:2}, shadowOpacity:0.03, shadowRadius:4, elevation:2
    },
    sectionTitle: {
        marginLeft: 15, marginTop: 10, marginBottom: 5, fontSize: 12, fontWeight: 'bold', color: '#ccc', textTransform: 'uppercase'
    },
    menuItem: {
        flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 15,
        borderBottomWidth: 1, borderBottomColor: '#f9f9f9'
    },
    menuIconBg: {
        width: 36, height: 36, borderRadius: 12, backgroundColor: '#f5f5f5',
        justifyContent: 'center', alignItems: 'center', marginRight: 15
    },
    menuText: { flex: 1, fontSize: 15, fontWeight: '500', color: '#333' },

    footer: { alignItems: 'center', marginTop: 10 },
    versionText: { color: '#ccc', fontSize: 12 },

    // ESTILOS DO MODAL
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20
    },
    modalContent: {
        backgroundColor: 'white',
        width: '85%',
        borderRadius: 20,
        padding: 20,
        alignItems: 'center',
        shadowColor: '#000', shadowOffset:{width:0, height:4}, shadowOpacity:0.2, shadowRadius:5, elevation:5
    },
    modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 5, color: '#333' },
    modalSubtitle: { fontSize: 14, color: '#888', marginBottom: 20 },
    input: {
        width: '100%',
        backgroundColor: '#F5F5F5',
        borderRadius: 12,
        padding: 15,
        fontSize: 16,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: '#EEE'
    },
    modalButtons: { flexDirection: 'row', gap: 10, width: '100%' },
    modalBtn: {
        flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center'
    },
    modalBtnCancel: { backgroundColor: '#F5F5F5' },
    modalBtnSave: { backgroundColor: '#1a1a1a' },
    modalBtnTextCancel: { color: '#666', fontWeight: '600' },
    modalBtnTextSave: { color: 'white', fontWeight: 'bold' }
});