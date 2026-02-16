import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
    Keyboard,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View
} from 'react-native';

const PRIMARY_COLOR = '#111';

export default function EvaluationScreen() {
    const router = useRouter();
    const [rating, setRating] = useState(0);
    const [comment, setComment] = useState('');

    const handleSkip = () => {
        // Simplesmente fecha o modal (equivale a saltar)
        router.back();
    };

    const handleSubmit = () => {
        // Aqui adicionarias a lógica para guardar a avaliação na base de dados
        console.log("Avaliação enviada:", { rating, comment });
        router.back();
    };

    return (
        // TouchableWithoutFeedback para fechar o teclado ao clicar fora do input
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.container}>
                
                {/* Indicador visual de modal (opcional, comum no iOS) */}
                <View style={styles.dragIndicator} />

                <View style={styles.content}>
                    <Text style={styles.title}>Avaliar Experiência</Text>
                    <Text style={styles.subtitle}>Como foi o teu atendimento?</Text>

                    {/* Estrelas */}
                    <View style={styles.starsContainer}>
                        {[1, 2, 3, 4, 5].map((star) => (
                            <TouchableOpacity 
                                key={star} 
                                onPress={() => setRating(star)}
                                activeOpacity={0.7}
                            >
                                <Ionicons 
                                    name={rating >= star ? "star" : "star-outline"} 
                                    size={40} 
                                    color={rating >= star ? "#FFD700" : "#CCC"} 
                                />
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* Caixa de Comentário */}
                    <TextInput
                        style={styles.input}
                        placeholder="Deixa um comentário (opcional)"
                        placeholderTextColor="#999"
                        multiline
                        numberOfLines={4}
                        value={comment}
                        onChangeText={setComment}
                    />
                </View>

                <View style={styles.footer}>
                    <TouchableOpacity 
                        style={[styles.btn, { opacity: rating === 0 ? 0.5 : 1 }]} 
                        onPress={handleSubmit}
                        disabled={rating === 0}
                    >
                        <Text style={styles.btnText}>Enviar Avaliação</Text>
                    </TouchableOpacity>

                    <TouchableOpacity 
                        style={styles.skipBtn} 
                        onPress={handleSkip}
                    >
                        <Text style={styles.skipBtnText}>Saltar</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </TouchableWithoutFeedback>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'white',
        padding: 24,
    },
    dragIndicator: {
        width: 40,
        height: 5,
        backgroundColor: '#E0E0E0',
        borderRadius: 3,
        alignSelf: 'center',
        marginBottom: 20,
    },
    content: {
        flex: 1,
        alignItems: 'center',
        paddingTop: 20,
    },
    title: {
        fontSize: 24,
        fontWeight: '800',
        color: '#1A1A1A',
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
        color: '#666',
        marginBottom: 30,
    },
    starsContainer: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 40,
    },
    input: {
        width: '100%',
        backgroundColor: '#F5F5F5',
        borderRadius: 12,
        padding: 16,
        fontSize: 16,
        color: '#333',
        textAlignVertical: 'top', // Para o texto começar em cima no Android
        minHeight: 120,
    },
    footer: {
        width: '100%',
        gap: 12,
        paddingBottom: 20,
    },
    btn: {
        backgroundColor: PRIMARY_COLOR,
        paddingVertical: 16,
        borderRadius: 16,
        width: '100%',
        alignItems: 'center',
    },
    btnText: {
        color: 'white',
        fontWeight: '700',
        fontSize: 16,
    },
    skipBtn: {
        paddingVertical: 12,
        width: '100%',
        alignItems: 'center',
    },
    skipBtnText: {
        color: '#888',
        fontWeight: '600',
        fontSize: 15,
    },
});