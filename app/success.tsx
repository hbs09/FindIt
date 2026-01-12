import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function SuccessScreen() {
    const router = useRouter();

    return (
        <View style={styles.container}>
            <Ionicons name="checkmark-circle" size={100} color="#4CD964" />
            <Text style={styles.title}>Agendado!</Text>
            <Text style={styles.subtitle}>O teu pedido foi enviado para o salão. Podes ver o estado no histórico.</Text>
            
            <TouchableOpacity 
                style={styles.btn} 
                onPress={() => {
                    // 1. Fecha todos os modais (limpa as "bordas curvas" e volta à base)
                    router.dismissAll();
                    // 2. Navega limpo para o Histórico de Agendamentos
                    router.push('/history');
                }}
            >
                <Text style={styles.btnText}>Ir para os meus Agendamentos</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30, backgroundColor: 'white' },
    title: { fontSize: 32, fontWeight: 'bold', marginTop: 20, marginBottom: 10 },
    subtitle: { fontSize: 16, color: '#666', textAlign: 'center', marginBottom: 40 },
    btn: { backgroundColor: '#333', paddingVertical: 15, paddingHorizontal: 30, borderRadius: 30, width: '100%', alignItems: 'center' },
    btnText: { color: 'white', fontWeight: 'bold', fontSize: 16 }
});