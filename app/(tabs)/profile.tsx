import { Ionicons } from '@expo/vector-icons';
import { Session } from '@supabase/supabase-js';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { supabase } from '../../supabase';

// @ts-ignore
import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system/legacy';

export default function ProfileScreen() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [session, setSession] = useState<Session | null>(null);
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
    const [fullName, setFullName] = useState('');
    const [isManager, setIsManager] = useState(false);

    useEffect(() => {
        getProfile();
    }, []);

    async function getProfile() {
        try {
            setLoading(true);
            const { data: { session }, error } = await supabase.auth.getSession();
            
            if (error || !session) {
                // Se não houver sessão, o _layout.tsx vai tratar de mandar para o login
                return;
            }

            setSession(session);
            
            // Dados do Auth (Metadata)
            setFullName(session.user.user_metadata?.full_name || 'Utilizador');
            setAvatarUrl(session.user.user_metadata?.avatar_url || null);

            // Verificar se é Gerente (se tem um salão associado)
            const { data: salon } = await supabase
                .from('salons')
                .select('id')
                .eq('dono_id', session.user.id)
                .single();
            
            if (salon) setIsManager(true);

        } catch (error) {
            console.log(error);
        } finally {
            setLoading(false);
        }
    }

    async function handleSignOut() {
        Alert.alert("Sair", "Tens a certeza que queres sair?", [
            { text: "Cancelar", style: "cancel" },
            { 
                text: "Sair", 
                style: 'destructive',
                onPress: async () => {
                    // Isto vai disparar o evento no _layout.tsx e redirecionar para o Login
                    await supabase.auth.signOut();
                }
            }
        ]);
    }

    async function pickImage() {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.5,
            base64: true,
        });

        if (!result.canceled) {
            uploadAvatar(result.assets[0].uri);
        }
    }

    async function uploadAvatar(uri: string) {
        try {
            setUploading(true);
            const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
            const filePath = `${session?.user.id}/${Date.now()}.jpg`;

            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(filePath, decode(base64), { contentType: 'image/jpeg', upsert: true });

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filePath);

            // Atualizar metadata do utilizador
            const { error: updateError } = await supabase.auth.updateUser({
                data: { avatar_url: publicUrl }
            });

            if (updateError) throw updateError;

            setAvatarUrl(publicUrl);
            Alert.alert("Sucesso", "Foto de perfil atualizada!");

        } catch (error) {
            Alert.alert("Erro", "Falha ao atualizar foto.");
            console.log(error);
        } finally {
            setUploading(false);
        }
    }

    if (loading) {
        return <View style={styles.center}><ActivityIndicator color="#007AFF" /></View>;
    }

    return (
        <ScrollView style={styles.container} contentContainerStyle={{paddingBottom: 40}}>
            
            {/* CABEÇALHO DE PERFIL */}
            <View style={styles.header}>
                <View style={styles.avatarContainer}>
                    {avatarUrl ? (
                        <Image source={{ uri: avatarUrl }} style={styles.avatar} />
                    ) : (
                        <View style={[styles.avatar, styles.avatarPlaceholder]}>
                            <Text style={styles.avatarInitials}>{fullName.charAt(0)}</Text>
                        </View>
                    )}
                    <TouchableOpacity style={styles.editBadge} onPress={pickImage} disabled={uploading}>
                        {uploading ? <ActivityIndicator size="small" color="white" /> : <Ionicons name="camera" size={14} color="white" />}
                    </TouchableOpacity>
                </View>
                
                <Text style={styles.name}>{fullName}</Text>
                <Text style={styles.email}>{session?.user.email}</Text>
            </View>

            {/* SECÇÃO GERAL */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Minha Conta</Text>
                
                <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/history')}>
                    <View style={styles.menuIconBox}><Ionicons name="calendar-outline" size={20} color="#007AFF" /></View>
                    <Text style={styles.menuText}>Histórico de Marcações</Text>
                    <Ionicons name="chevron-forward" size={20} color="#ccc" />
                </TouchableOpacity>

                <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/favorites')}>
                    <View style={styles.menuIconBox}><Ionicons name="heart-outline" size={20} color="#FF3B30" /></View>
                    <Text style={styles.menuText}>Favoritos</Text>
                    <Ionicons name="chevron-forward" size={20} color="#ccc" />
                </TouchableOpacity>
            </View>

            {/* SECÇÃO GESTÃO (Só aparece se for Dono) */}
            {isManager && (
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Gestão Profissional</Text>
                    <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/manager')}>
                        <View style={[styles.menuIconBox, {backgroundColor: '#333'}]}><Ionicons name="briefcase-outline" size={20} color="white" /></View>
                        <Text style={styles.menuText}>Gerir o meu Salão</Text>
                        <Ionicons name="chevron-forward" size={20} color="#ccc" />
                    </TouchableOpacity>
                </View>
            )}

            {/* SECÇÃO APP */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Aplicação</Text>
                
                <View style={styles.menuItem}>
                    <View style={[styles.menuIconBox, {backgroundColor: '#eee'}]}><Ionicons name="moon-outline" size={20} color="#666" /></View>
                    <Text style={styles.menuText}>Modo Escuro (Brevemente)</Text>
                    <Switch value={false} disabled />
                </View>
                
                <TouchableOpacity style={styles.menuItem} onPress={handleSignOut}>
                    <View style={[styles.menuIconBox, {backgroundColor: '#ffebee'}]}><Ionicons name="log-out-outline" size={20} color="#d32f2f" /></View>
                    <Text style={[styles.menuText, {color: '#d32f2f'}]}>Terminar Sessão</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.footer}>
                <Text style={styles.version}>FindIt App • v1.0.0</Text>
            </View>
            
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8f9fa' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    
    header: { alignItems: 'center', paddingVertical: 40, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#eee' },
    avatarContainer: { position: 'relative', marginBottom: 15 },
    avatar: { width: 100, height: 100, borderRadius: 50, borderWidth: 3, borderColor: 'white', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 5 },
    avatarPlaceholder: { backgroundColor: '#333', justifyContent: 'center', alignItems: 'center' },
    avatarInitials: { fontSize: 36, fontWeight: 'bold', color: 'white' },
    editBadge: { position: 'absolute', bottom: 0, right: 0, backgroundColor: '#007AFF', padding: 8, borderRadius: 20, borderWidth: 3, borderColor: 'white' },
    
    name: { fontSize: 22, fontWeight: 'bold', color: '#333' },
    email: { fontSize: 14, color: '#666', marginTop: 2 },

    section: { marginTop: 20, backgroundColor: 'white', paddingVertical: 10, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#eee' },
    sectionTitle: { fontSize: 12, fontWeight: 'bold', color: '#999', textTransform: 'uppercase', paddingHorizontal: 20, marginBottom: 10, marginTop: 10 },
    
    menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 20 },
    menuIconBox: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#f0f9ff', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
    menuText: { flex: 1, fontSize: 16, color: '#333', fontWeight: '500' },
    
    footer: { padding: 30, alignItems: 'center' },
    version: { color: '#ccc', fontSize: 12 }
});