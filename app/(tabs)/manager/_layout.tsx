import { Stack } from 'expo-router';

export default function ManagerLayout() {
    return (
        <Stack
            screenOptions={{
                // Esconde o cabeçalho padrão do sistema em TODAS as páginas desta pasta
                // porque nós já criámos cabeçalhos bonitos dentro de cada ficheiro.
                headerShown: false,
                // Define a animação de transição (opcional, mas fica bem)
                animation: 'slide_from_right',
                // Cor de fundo base durante as transições
                contentStyle: { backgroundColor: '#F8F9FA' },
            }}
        >
            {/* Aqui podes definir configurações específicas para cada ecrã se precisares,
        mas o 'screenOptions' acima já trata de tudo genericamente.
      */}
            <Stack.Screen name="index" />
            <Stack.Screen name="agenda" />
            <Stack.Screen name="galeria" />
            <Stack.Screen name="servicos" />
            <Stack.Screen name="equipa" />
            <Stack.Screen name="definicoes" />
        </Stack>
    );
}