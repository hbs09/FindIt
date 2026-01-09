import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../supabase'; // Confirma se o caminho '../' está certo

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Função para Entrar
  async function signInWithEmail() {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password,
    });

    if (error) {
      Alert.alert("Erro", error.message);
    } else {
      // Sucesso! Vai para a Home
      router.replace('/(tabs)'); 
    }
    setLoading(false);
  }

  // Função para Criar Conta
  async function signUpWithEmail() {
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: email,
      password: password,
    });

    if (error) {
      Alert.alert("Erro", error.message);
    } else {
      Alert.alert("Sucesso", "Conta criada! Verifica o teu email (ou tenta entrar se o email confirm for desativado).");
    }
    setLoading(false);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Bem-vindo</Text>
      
      <TextInput
        style={styles.input}
        placeholder="Email"
        onChangeText={setEmail}
        value={email}
        autoCapitalize="none"
      />
      
      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry={true}
        onChangeText={setPassword}
        value={password}
      />

      <View style={styles.buttonContainer}>
        <TouchableOpacity style={[styles.btn, styles.btnLogin]} onPress={signInWithEmail} disabled={loading}>
          <Text style={styles.btnText}>{loading ? "A carregar..." : "Entrar"}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.btn, styles.btnRegister]} onPress={signUpWithEmail} disabled={loading}>
          <Text style={styles.btnText}>Criar Conta</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#f5f5f5' },
  title: { fontSize: 32, fontWeight: 'bold', marginBottom: 40, textAlign: 'center', color: '#333' },
  input: { backgroundColor: 'white', padding: 15, borderRadius: 8, marginBottom: 15, borderWidth: 1, borderColor: '#ddd' },
  buttonContainer: { marginTop: 10, gap: 10 },
  btn: { padding: 15, borderRadius: 8, alignItems: 'center' },
  btnLogin: { backgroundColor: '#007AFF' },
  btnRegister: { backgroundColor: '#34C759' },
  btnText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
});