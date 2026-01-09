import { useEffect, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../supabase';

type Appointment = {
  id: number;
  data_hora: string;
  cliente_nome: string;
  status: string;
  services: { nome: string };
};

export default function AdminDashboard() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAppointments();
  }, []);

  async function fetchAppointments() {
    setLoading(true);
    const { data, error } = await supabase
      .from('appointments')
      .select('*, services(nome)') 
      .order('data_hora', { ascending: true }); // Ordena por data (mais recente primeiro)

    if (error) Alert.alert("Erro", error.message);
    else if (data) setAppointments(data as any);
    
    setLoading(false);
  }

  // --- NOVA FUNÇÃO: Mudar o estado ---
  async function updateStatus(id: number, novoStatus: 'confirmado' | 'cancelado') {
    // 1. Atualiza no Supabase
    const { error } = await supabase
      .from('appointments')
      .update({ status: novoStatus })
      .eq('id', id);

    if (error) {
      Alert.alert("Erro ao atualizar", error.message);
    } else {
      // 2. Atualiza a lista no ecrã sem precisar de recarregar tudo
      setAppointments(prevLista => 
        prevLista.map(item => 
          item.id === id ? { ...item, status: novoStatus } : item
        )
      );
    }
  }

  function formatData(isoString: string) {
    const data = new Date(isoString);
    return `${data.getDate()}/${data.getMonth()+1} às ${data.getHours()}:${data.getMinutes().toString().padStart(2, '0')}`;
  }

  // Função para escolher a cor do cartão baseada no estado
  function getStatusColor(status: string) {
    if (status === 'confirmado') return '#34C759'; // Verde
    if (status === 'cancelado') return '#FF3B30'; // Vermelho
    return '#FF9500'; // Laranja (Pendente)
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Agenda do Salão ✂️</Text>
      
      <FlatList
        data={appointments}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <View style={[styles.card, { borderLeftColor: getStatusColor(item.status) }]}>
            
            <View style={styles.header}>
              <Text style={styles.time}>{formatData(item.data_hora)}</Text>
              <Text style={{color: getStatusColor(item.status), fontWeight: 'bold'}}>
                {item.status.toUpperCase()}
              </Text>
            </View>
            
            <Text style={styles.clientName}>👤 {item.cliente_nome}</Text>
            <Text style={styles.serviceName}>💇 {item.services?.nome}</Text>

            {/* SÓ MOSTRA OS BOTÕES SE ESTIVER PENDENTE */}
            {item.status === 'pendente' && (
              <View style={styles.actions}>
                <TouchableOpacity 
                  style={[styles.btn, styles.btnReject]} 
                  onPress={() => updateStatus(item.id, 'cancelado')}
                >
                  <Text style={styles.btnText}>❌ Recusar</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.btn, styles.btnAccept]} 
                  onPress={() => updateStatus(item.id, 'confirmado')}
                >
                  <Text style={styles.btnText}>✅ Aceitar</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f5f5f5', paddingTop: 50 },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 20, color: '#333' },
  card: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 12,
    marginBottom: 10,
    borderLeftWidth: 5, // A barra colorida do lado esquerdo
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, elevation: 2,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  time: { fontWeight: 'bold', fontSize: 16, color: '#333' },
  clientName: { fontSize: 16, marginTop: 5, color: '#444' },
  serviceName: { fontSize: 14, color: '#666', marginTop: 2 },
  
  // Estilos dos botões
  actions: { flexDirection: 'row', gap: 10, marginTop: 15, borderTopWidth: 1, borderColor: '#eee', paddingTop: 10 },
  btn: { flex: 1, padding: 10, borderRadius: 8, alignItems: 'center' },
  btnAccept: { backgroundColor: '#e8f8ed' }, // Verde clarinho
  btnReject: { backgroundColor: '#fee8e7' }, // Vermelho clarinho
  btnText: { fontWeight: 'bold', fontSize: 14, color: '#333' }
});