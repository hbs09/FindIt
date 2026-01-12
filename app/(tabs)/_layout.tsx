import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      
      {/* Ao usar screenOptions={{ headerShown: false }}, 
          estamos a dizer que TODAS as rotas dentro da pasta app/ 
          não devem ter cabeçalho.
      */}
      <Stack screenOptions={{ headerShown: false }}>
        {/* Apenas listamos o que precisa de configuração especial (como modais) */}
        <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
      </Stack>
    </>
  );
}