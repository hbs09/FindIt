import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function SuccessScreen() {
  const router = useRouter();
  
  // Valor inicial da escala (0 = invisível)
  const scaleValue = useRef(new Animated.Value(0)).current;
  const opacityValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Sequência de Animação
    Animated.sequence([
      // 1. Aparece suavemente
      Animated.timing(opacityValue, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      // 2. O Ícone "Salta" (Efeito Elástico)
      Animated.spring(scaleValue, {
        toValue: 1,
        friction: 4,  // Quanto menor, mais elástico
        tension: 50,  // Velocidade
        useNativeDriver: true,
      })
    ]).start();
  }, []);

  return (
    <View style={styles.container}>
      
      {/* Círculo Animado com o Visto */}
      <Animated.View 
        style={[
          styles.iconContainer, 
          { 
            transform: [{ scale: scaleValue }],
            opacity: opacityValue
          }
        ]}
      >
        <Ionicons name="checkmark" size={80} color="white" />
      </Animated.View>

      <Text style={styles.title}>Pedido Enviado!</Text>
      <Text style={styles.subtitle}>
        O salão recebeu o teu pedido.{'\n'}
        Vais receber uma confirmação em breve.
      </Text>

      <TouchableOpacity 
        style={styles.btn} 
        onPress={() => router.replace('/(tabs)')}
      >
        <Text style={styles.btnText}>Voltar ao Início</Text>
        <Ionicons name="arrow-forward" size={20} color="white" />
      </TouchableOpacity>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#fff', 
    alignItems: 'center', 
    justifyContent: 'center', 
    padding: 20 
  },
  iconContainer: {
    width: 120,
    height: 120,
    backgroundColor: '#34C759', // Verde Sucesso
    borderRadius: 60, // Círculo perfeito
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 30,
    // Sombra para dar destaque (efeito 3D)
    shadowColor: "#34C759",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 10,
  },
  title: { fontSize: 28, fontWeight: 'bold', color: '#333', marginBottom: 10 },
  subtitle: { fontSize: 16, color: '#666', textAlign: 'center', lineHeight: 24, marginBottom: 50 },
  
  btn: {
    backgroundColor: '#1a1a1a', // Botão preto para contraste
    paddingVertical: 15, paddingHorizontal: 30, borderRadius: 30,
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  btnText: { color: 'white', fontSize: 18, fontWeight: 'bold' }
});