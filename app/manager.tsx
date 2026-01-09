import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../supabase';

type Appointment = {
  id: number;
  data_hora: string;
  cliente_nome: string; // O email ou nome do cliente
  salons: { nome_salao: string };
  services: { nome: string; preco: number };
};

export default function ManagerScreen() {
  const router = useRouter();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPendingAppointments();
  }, []);

  async function fetchPendingAppointments() {
    setLoading(true);
    // Buscar apenas os PENDENTES
    const { data, error } = await supabase
      .from('appointments')
      .select(`
        id, 
        data_hora, 
        cliente_nome,
        salons (nome_salao), 
        services (nome, preco)
      `)
      .eq('status', 'pendente') // <--- O filtro importante
      .order('data_hora', { ascending: true });

    if (error) {
      Alert.alert("Erro", error.message);
    } else {
      setAppointments(data as any);
    }
    setLoading(false);
  }

  async function handleDecision(id: number, decision: 'confirmado' | 'cancelado') {
    // 1. Atualizar na Base de Dados
    const { error } = await supabase
      .from('appointments')
      .update({ status: decision })
      .eq('id', id);

    if (error) {
      Alert.alert("Erro", "Falha ao atualizar.");
      return;
    }

    // 2. Feedback visual e atualizar lista
    const acao = decision === 'confirmado' ? 'Confirmada' : 'Rejeitada';
    Alert.alert("Sucesso", `Marcação ${acao}!`);
    fetchPendingAppointments(); // Recarrega a lista
  }

  function formatData(isoString: string) {
    const data = new Date(isoString);
    return `${data.getDate()}/${data.getMonth()+1} às ${data.getHours()}:${data.getMinutes().toString().padStart(2, '0')}`;
  }

  return (
    <View style={styles.container}>
      
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.title}>Painel de Gestão</Text>
      </View>

      <Text style={styles.subtitle}>Pedidos Pendentes ({appointments.length})</Text>

      {loading && <ActivityIndicator size="large" color="#000" style={{marginTop: 20}} />}

      {!loading && appointments.length === 0 && (
        <View style={styles.emptyState}>
            <Text style={{fontSize: 40}}>✅</Text>
            <Text style={{color: 'gray', marginTop: 10}}>Tudo limpo! Sem pedidos pendentes.</Text>
        </View>
      )}

      <FlatList
        data={appointments}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={{ paddingBottom: 50 }}
        renderItem={({ item }) => (
          <View style={styles.card}>
            {/* Informação do Pedido */}
            <View style={styles.cardHeader}>
                <Text style={styles.salonName}>{item.salons?.nome_salao}</Text>
                <Text style={styles.date}>{formatData(item.data_hora)}</Text>
            </View>
            
            <Text style={styles.clientInfo}>👤 {item.cliente_nome}</Text>
            <Text style={styles.serviceInfo}>✂️ {item.services?.nome} ({item.services?.preco}€)</Text>

            {/* Botões de Ação */}
            <View style={styles.actionRow}>
                <TouchableOpacity 
                    style={[styles.btn, styles.btnReject]} 
                    onPress={() => handleDecision(item.id, 'cancelado')}
                >
                    <Ionicons name="close" size={20} color="#FF3B30" />
                    <Text style={[styles.btnText, {color: '#FF3B30'}]}>Rejeitar</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                    style={[styles.btn, styles.btnAccept]} 
                    onPress={() => handleDecision(item.id, 'confirmado')}
                >
                    <Ionicons name="checkmark" size={20} color="#34C759" />
                    <Text style={[styles.btnText, {color: '#34C759'}]}>Aceitar</Text>
                </TouchableOpacity>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f7', padding: 20, paddingTop: 60 },
  
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  backBtn: { marginRight: 15, padding: 5 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#333' },
  subtitle: { fontSize: 16, color: '#666', marginBottom: 15, marginLeft: 5 },

  emptyState: { alignItems: 'center', marginTop: 100, opacity: 0.6 },

  card: {
    backgroundColor: 'white', padding: 20, borderRadius: 16, marginBottom: 15,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, elevation: 3
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  salonName: { fontWeight: 'bold', fontSize: 16, color: '#333' },
  date: { fontWeight: 'bold', color: '#007AFF' },
  
  clientInfo: { color: '#555', marginBottom: 5 },
  serviceInfo: { color: '#555', marginBottom: 15, fontWeight: '500' },

  actionRow: { flexDirection: 'row', gap: 15, borderTopWidth: 1, borderTopColor: '#f0f0f0', paddingTop: 15 },
  btn: { 
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', 
    padding: 12, borderRadius: 10, borderWidth: 1 
  },
  btnReject: { borderColor: '#ffe5e5', backgroundColor: '#fff5f5' },
  btnAccept: { borderColor: '#e5ffe5', backgroundColor: '#f0fff0' },
  btnText: { fontWeight: 'bold', marginLeft: 5 }
});