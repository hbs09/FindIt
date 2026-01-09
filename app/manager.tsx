import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../supabase';

type Appointment = {
  id: number;
  data_hora: string;
  cliente_nome: string;
  salons: { nome_salao: string };
  services: { nome: string; preco: number };
};

export default function ManagerScreen() {
  const router = useRouter();
  
  // Estado da Lista
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  // Estado das Estatísticas
  const [stats, setStats] = useState({
    revenue: 0,
    clients: 0,
    pending: 0
  });

  useEffect(() => {
    fetchDashboardData();
  }, []);

  async function fetchDashboardData() {
    setLoading(true);
    
    try {
        // 1. Obter o User Logado
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // 2. Descobrir qual é o salão deste gerente (CORRIGIDO: dono_id)
        const { data: mySalon } = await supabase
            .from('salons')
            .select('id')
            .eq('dono_id', user.id) // <--- AQUI ESTAVA O ERRO, AGORA ESTÁ CERTO
            .single();

        const salonId = mySalon?.id;

        // Se não tiver salão, o código continua mas sem filtrar por ID (pode ser ajustado conforme a regra de negócio)
        
        // --- CÁLCULO DAS ESTATÍSTICAS (ESTE MÊS) ---
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();

        // Query para Faturação e Clientes (Confirmados este mês)
        let queryStats = supabase
            .from('appointments')
            .select('id, services(preco)')
            .eq('status', 'confirmado')
            .gte('data_hora', startOfMonth)
            .lte('data_hora', endOfMonth);

        if (salonId) queryStats = queryStats.eq('salon_id', salonId);

        const { data: statsData } = await queryStats;

        let totalRevenue = 0;
        let totalClients = 0;

        if (statsData) {
            totalClients = statsData.length;
            totalRevenue = statsData.reduce((acc, curr) => {
                // @ts-ignore
                return acc + (curr.services?.preco || 0);
            }, 0);
        }

        // --- LISTA DE PENDENTES ---
        let queryPending = supabase
            .from('appointments')
            .select(`
                id, 
                data_hora, 
                cliente_nome,
                salons (nome_salao), 
                services (nome, preco)
            `)
            .eq('status', 'pendente')
            .order('data_hora', { ascending: true });

        if (salonId) queryPending = queryPending.eq('salon_id', salonId);

        const { data: pendingData, error } = await queryPending;

        if (error) throw error;

        setAppointments(pendingData as any);
        setStats({
            revenue: totalRevenue,
            clients: totalClients,
            pending: pendingData?.length || 0
        });

    } catch (error: any) {
        Alert.alert("Erro", error.message);
    } finally {
        setLoading(false);
    }
  }

  async function handleDecision(id: number, decision: 'confirmado' | 'cancelado') {
    const { error } = await supabase
      .from('appointments')
      .update({ status: decision })
      .eq('id', id);

    if (error) {
      Alert.alert("Erro", "Falha ao atualizar.");
      return;
    }

    const acao = decision === 'confirmado' ? 'Confirmada' : 'Rejeitada';
    Alert.alert("Sucesso", `Marcação ${acao}!`);
    fetchDashboardData(); // Recarrega tudo (stats e lista)
  }

  function formatData(isoString: string) {
    const data = new Date(isoString);
    return `${data.getDate()}/${data.getMonth()+1} às ${data.getHours()}:${data.getMinutes().toString().padStart(2, '0')}`;
  }

  return (
    <View style={styles.container}>
      
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.title}>Painel de Gestão</Text>
      </View>

      {/* DASHBOARD CARDS */}
      <View style={styles.statsContainer}>
        {/* Card Faturação */}
        <View style={[styles.statCard, { backgroundColor: '#e8f8ed' }]}> 
            <View style={styles.iconCircle}>
                <Text style={{fontSize: 20}}>💰</Text>
            </View>
            <View>
                <Text style={styles.statLabel}>Faturação (Mês)</Text>
                <Text style={[styles.statValue, {color: '#2e8b57'}]}>{stats.revenue}€</Text>
            </View>
        </View>

        <View style={styles.rowStats}>
            {/* Card Clientes */}
            <View style={[styles.statCardSmall, { backgroundColor: '#e6f4ff' }]}>
                <Text style={{fontSize: 24, marginBottom: 5}}>👥</Text>
                <Text style={styles.statValueSmall}>{stats.clients}</Text>
                <Text style={styles.statLabelSmall}>Clientes (Mês)</Text>
            </View>

            {/* Card Pendentes */}
            <View style={[styles.statCardSmall, { backgroundColor: '#fff5e6' }]}>
                <Text style={{fontSize: 24, marginBottom: 5}}>⏳</Text>
                <Text style={styles.statValueSmall}>{stats.pending}</Text>
                <Text style={styles.statLabelSmall}>Pendentes</Text>
            </View>
        </View>
      </View>

      <Text style={styles.subtitle}>Pedidos Pendentes</Text>

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
  container: { flex: 1, backgroundColor: '#f8f9fa', padding: 20, paddingTop: 60 },
  
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  backBtn: { marginRight: 15, padding: 5 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#333' },
  
  // DASHBOARD STYLES
  statsContainer: { marginBottom: 25 },
  statCard: {
    padding: 20, borderRadius: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 15,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, elevation: 2
  },
  iconCircle: { 
    width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(255,255,255,0.8)', 
    alignItems: 'center', justifyContent: 'center', marginRight: 15 
  },
  statLabel: { fontSize: 14, color: '#666', fontWeight: '600' },
  statValue: { fontSize: 28, fontWeight: 'bold' },

  rowStats: { flexDirection: 'row', gap: 15 },
  statCardSmall: {
    flex: 1, padding: 15, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, elevation: 2
  },
  statValueSmall: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  statLabelSmall: { fontSize: 12, color: '#666', marginTop: 2 },

  subtitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 15 },

  emptyState: { alignItems: 'center', marginTop: 50, opacity: 0.6 },

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