import { Ionicons } from '@expo/vector-icons';
import { Session } from '@supabase/supabase-js';
import { decode } from 'base64-arraybuffer';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../supabase';

type Appointment = {
  id: number;
  data_hora: string;
  status: string;
  salons: { nome_salao: string; cidade: string };
  services: { nome: string; preco: number };
};

type Favorite = {
  id: number;
  salons: { id: number; nome_salao: string; cidade: string };
};

export default function ProfileScreen() {
  const router = useRouter();
  
  const [session, setSession] = useState<Session | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  
  // Estados de Perfil
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  
  // Estado de Gerente (NOVO)
  const [isManager, setIsManager] = useState(false);

  // Modos de Edição
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  useFocusEffect(
    useCallback(() => {
      fetchMyData();
    }, [])
  );

  async function fetchMyData() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    setSession(session);
    
    if (!session || !session.user) {
        setLoading(false);
        return;
    }
    
    const user = session.user;

    // 1. Carregar MetaDados (Foto, Nome, Telemóvel)
    if (user.user_metadata?.avatar_url) setAvatarUrl(user.user_metadata.avatar_url);
    if (user.user_metadata?.full_name) setFullName(user.user_metadata.full_name);
    if (user.user_metadata?.phone) setPhone(user.user_metadata.phone);

    // 2. Verificar se é Gerente (NOVA LÓGICA)
    const { data: salonData } = await supabase
        .from('salons')
        .select('id')
        .eq('dono_id', user.id) // Verifica se o ID do user está na coluna dono_id
        .limit(1) // Basta encontrar um
        .single();
    
    if (salonData) {
        setIsManager(true);
    } else {
        setIsManager(false);
    }

    // 3. Marcações
    const { data: appData } = await supabase
      .from('appointments')
      .select(`id, data_hora, status, salons (nome_salao, cidade), services (nome, preco)`)
      .eq('cliente_id', user.id)
      .order('data_hora', { ascending: true });

    if (appData) setAppointments(appData as any);

    // 4. Favoritos
    const { data: favData } = await supabase
      .from('favorites')
      .select(`id, salons (id, nome_salao, cidade)`)
      .eq('user_id', user.id);

    if (favData) setFavorites(favData as any);
    
    setLoading(false);
  }

  // --- GUARDAR DADOS (COM VALIDAÇÕES) ---
  async function saveProfile() {
    const cleanPhone = phone.replace(/\s/g, ''); 

    if (!fullName.trim()) {
        Alert.alert("Erro", "Por favor, preenche o teu nome.");
        return;
    }

    if (cleanPhone.length !== 9 || isNaN(Number(cleanPhone))) {
        Alert.alert("Telemóvel Inválido", "O número deve ter 9 dígitos (ex: 912345678).");
        return;
    }

    const { error } = await supabase.auth.updateUser({
        data: { full_name: fullName, phone: cleanPhone }
    });

    if (error) {
        Alert.alert("Erro", "Não foi possível guardar.");
    } else {
        Alert.alert("Sucesso", "Perfil atualizado! Agora podes fazer marcações.");
        setIsEditing(false); 
        setPhone(cleanPhone); 
    }
  }

  async function uploadAvatar() {
    try {
        setUploading(true);
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true, aspect: [1, 1], quality: 0.5, base64: true,
        });

        if (result.canceled || !result.assets || !result.assets[0].base64) {
            setUploading(false); return;
        }

        const fileName = `${Date.now()}.png`;
        const { error: uploadError } = await supabase.storage
            .from('avatars')
            .upload(fileName, decode(result.assets[0].base64), { contentType: 'image/png' });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName);
        
        await supabase.auth.updateUser({ data: { avatar_url: publicUrl } });
        setAvatarUrl(publicUrl);

    } catch (error) {
        Alert.alert("Erro", "Falha no upload.");
    } finally {
        setUploading(false);
    }
  }

  // --- APAGAR CONTA ---
  async function handleDeleteAccount() {
    Alert.alert(
      "Apagar Conta",
      "Tens a certeza? Esta ação é irreversível e perderás o histórico.",
      [
        { text: "Cancelar", style: "cancel" },
        { 
          text: "Sim, apagar tudo", 
          style: "destructive", 
          onPress: async () => {
            setLoading(true);
            const { error } = await supabase.rpc('apagar_minha_conta');

            if (error) {
              Alert.alert("Erro", "Não foi possível apagar a conta: " + error.message);
              setLoading(false);
            } else {
              await supabase.auth.signOut();
              router.replace('/login');
            }
          }
        }
      ]
    );
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  async function cancelarMarcação(id: number) {
     Alert.alert("Cancelar", "Tens a certeza?", [
        { text: "Não" },
        { text: "Sim", style: 'destructive', onPress: async () => {
            const { error } = await supabase.from('appointments').delete().eq('id', id);
            if (!error) fetchMyData();
        }}
     ]);
  }

  function formatData(isoString: string) {
    const data = new Date(isoString);
    return `${data.getDate()}/${data.getMonth()+1} • ${data.getHours()}:${data.getMinutes().toString().padStart(2, '0')}`;
  }

  function getStatusColor(status: string) {
    if (status === 'confirmado') return '#34C759';
    if (status === 'cancelado') return '#FF3B30';
    return '#FF9500';
  }

  if (loading) return <View style={[styles.container, {justifyContent:'center'}]}><ActivityIndicator size="large" color="#333" /></View>;

  if (!session) {
    return (
        <View style={[styles.container, styles.guestContainer]}>
            <View style={styles.guestIconBox}><Ionicons name="person-circle-outline" size={80} color="#ccc" /></View>
            <Text style={styles.guestTitle}>Perfil de Utilizador</Text>
            <Text style={styles.guestSubtitle}>Faz login para veres as tuas marcações.</Text>
            <TouchableOpacity style={styles.guestBtn} onPress={() => router.replace('/login')}>
                <Text style={styles.guestBtnText}>Entrar ou Criar Conta</Text>
            </TouchableOpacity>
        </View>
    );
  }

  return (
    <View style={styles.container}>
      
      <View style={styles.header}>
        <View style={styles.headerRow}>
            <TouchableOpacity onPress={uploadAvatar} disabled={uploading}>
                {uploading ? <ActivityIndicator /> : avatarUrl ? <Image source={{ uri: avatarUrl }} style={styles.avatar} /> : <View style={styles.placeholderAvatar}><Text style={{fontSize: 24}}>👤</Text></View>}
            </TouchableOpacity>
            
            <View style={{flex: 1, marginLeft: 15}}>
                {isEditing ? (
                    <View style={{gap: 8}}>
                        <TextInput style={styles.input} value={fullName} onChangeText={setFullName} placeholder="Nome Completo" />
                        <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="Telemóvel (ex: 912 345 678)" keyboardType="phone-pad" maxLength={11} />
                        <View style={{flexDirection: 'row', gap: 10}}>
                            <TouchableOpacity style={styles.saveBtn} onPress={saveProfile}><Text style={styles.btnTxt}>Guardar</Text></TouchableOpacity>
                            <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsEditing(false)}><Text style={styles.btnTxt}>Cancelar</Text></TouchableOpacity>
                        </View>
                    </View>
                ) : (
                    <View>
                        <Text style={styles.name}>{fullName || 'Sem Nome'}</Text>
                        <Text style={styles.details}>{phone || 'Sem telemóvel'}</Text>
                        <Text style={styles.email}>{session.user.email}</Text>
                        <TouchableOpacity onPress={() => setIsEditing(true)}>
                            <Text style={styles.editLink}>Editar Perfil</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>

            <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
                <Ionicons name="log-out-outline" size={24} color="#FF3B30" />
            </TouchableOpacity>
        </View>
      </View>

      <ScrollView 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1 }}
      >
        {/* AQUI ESTÁ A NOVA CONDIÇÃO: isManager */}
        {isManager && (
            <TouchableOpacity style={styles.adminBanner} onPress={() => router.push('/manager')}>
                <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
                    <Ionicons name="briefcase" size={20} color="white" />
                    <Text style={styles.adminTitle}>Painel de Gerente</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#ccc" />
            </TouchableOpacity>
        )}

        {favorites.length > 0 && (
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>❤️ Favoritos</Text>
                <FlatList horizontal data={favorites} showsHorizontalScrollIndicator={false} keyExtractor={(item) => item.id.toString()} renderItem={({ item }) => (
                    <TouchableOpacity style={styles.favCard} onPress={() => router.push(`/salon/${item.salons.id}`)}>
                        <Text style={styles.favName} numberOfLines={1}>{item.salons.nome_salao}</Text>
                    </TouchableOpacity>
                )} />
            </View>
        )}

        <View style={styles.section}>
            <Text style={styles.sectionTitle}>📅 Marcações</Text>
            {appointments.length === 0 ? <Text style={styles.emptyText}>Sem marcações.</Text> : appointments.map((item) => (
                <View key={item.id} style={[styles.card, { borderLeftColor: getStatusColor(item.status) }]}>
                    <View style={{flex: 1}}>
                        <Text style={styles.salonName}>{item.salons?.nome_salao}</Text>
                        <Text style={styles.serviceInfo}>{item.services?.nome}</Text>
                        <Text style={styles.dateInfo}>{formatData(item.data_hora)}</Text>
                    </View>
                    <View style={{alignItems: 'flex-end', gap: 5}}>
                        <Text style={[styles.statusBadge, {color: getStatusColor(item.status)}]}>{item.status.toUpperCase()}</Text>
                        {item.status === 'pendente' && <TouchableOpacity onPress={() => cancelarMarcação(item.id)}><Ionicons name="trash-outline" size={20} color="#FF3B30" /></TouchableOpacity>}
                    </View>
                </View>
            ))}
        </View>

        <View style={styles.footerContainer}>
            <TouchableOpacity onPress={handleDeleteAccount} style={{ alignItems: 'center', padding: 10 }}>
                <Text style={{ color: '#FF3B30', fontWeight: 'bold' }}>Apagar Conta</Text>
            </TouchableOpacity>
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9f9f9', padding: 20, paddingTop: 60 },
  guestContainer: { alignItems: 'center', justifyContent: 'center', paddingBottom: 100 },
  guestIconBox: { marginBottom: 20, opacity: 0.5 },
  guestTitle: { fontSize: 24, fontWeight: 'bold', color: '#333', marginBottom: 10 },
  guestSubtitle: { fontSize: 16, color: '#666', marginBottom: 30 },
  guestBtn: { backgroundColor: '#333', paddingVertical: 15, paddingHorizontal: 30, borderRadius: 30 },
  guestBtnText: { color: 'white', fontWeight: 'bold' },
  
  header: { marginBottom: 20, backgroundColor: 'white', padding: 20, borderRadius: 16, shadowColor: '#000', shadowOpacity: 0.05, elevation: 2 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start' },
  avatar: { width: 70, height: 70, borderRadius: 35 },
  placeholderAvatar: { width: 70, height: 70, borderRadius: 35, backgroundColor: '#e1e1e1', alignItems: 'center', justifyContent: 'center' },
  
  name: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  email: { fontSize: 12, color: '#888', marginTop: 2 },
  details: { fontSize: 14, color: '#555', marginTop: 2 },
  editLink: { color: '#007AFF', fontWeight: '600', marginTop: 8 },
  logoutBtn: { padding: 5, marginLeft: 10 },

  input: { backgroundColor: '#f0f0f0', padding: 8, borderRadius: 8, fontSize: 14, marginBottom: 5 },
  saveBtn: { backgroundColor: '#333', padding: 8, borderRadius: 6 },
  cancelBtn: { backgroundColor: '#ccc', padding: 8, borderRadius: 6 },
  btnTxt: { color: 'white', fontSize: 12, fontWeight: 'bold' },

  adminBanner: { backgroundColor: '#333', padding: 15, borderRadius: 12, marginBottom: 25, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  adminTitle: { fontWeight: 'bold', fontSize: 16, color: 'white', marginLeft: 10 },

  section: { marginBottom: 30 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, color: '#333' },
  emptyText: { color: '#999', fontStyle: 'italic' },
  favCard: { backgroundColor: 'white', padding: 15, borderRadius: 12, marginRight: 15, width: 120, shadowOpacity: 0.05, elevation: 2 },
  favName: { fontWeight: 'bold', fontSize: 14, color: '#333' },
  card: { backgroundColor: 'white', padding: 15, borderRadius: 12, marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderLeftWidth: 4, shadowOpacity: 0.05, elevation: 2 },
  salonName: { fontWeight: 'bold', fontSize: 16, color: '#333' },
  serviceInfo: { color: '#666', fontSize: 14, marginTop: 2 },
  dateInfo: { color: '#333', fontWeight: '500', marginTop: 5 },
  statusBadge: { fontSize: 10, fontWeight: 'bold', letterSpacing: 0.5 },

  footerContainer: {
    marginTop: 'auto', 
    marginBottom: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderColor: '#eee',
  }
});