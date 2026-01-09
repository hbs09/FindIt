import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, FlatList, Image, Keyboard, PanResponder, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'; // <--- ADICIONEI IMAGE
import MapView, { Callout, Marker } from 'react-native-maps';
import { supabase } from '../../supabase';

// 1. ATUALIZÁMOS O TIPO PARA INCLUIR IMAGEM
type Salao = {
  id: number;
  nome_salao: string;
  cidade: string;
  latitude: number;
  longitude: number;
  imagem: string | null; // <--- NOVO
};

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const HEIGHT_FULL = SCREEN_HEIGHT * 0.8;
const HEIGHT_MEDIUM = SCREEN_HEIGHT * 0.35;
const HEIGHT_CLOSED = 0;

export default function MapScreen() {
  const router = useRouter();
  const mapRef = useRef<MapView>(null);
  
  const [saloes, setSaloes] = useState<Salao[]>([]);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [cidadePesquisa, setCidadePesquisa] = useState('');
  
  const [sheetState, setSheetState] = useState<'closed' | 'collapsed' | 'expanded'>('closed');
  
  const animatedHeight = useRef(new Animated.Value(HEIGHT_CLOSED)).current;

  // Animação suave
  useEffect(() => {
    let targetHeight = HEIGHT_CLOSED;
    if (sheetState === 'collapsed') targetHeight = HEIGHT_MEDIUM;
    else if (sheetState === 'expanded') targetHeight = HEIGHT_FULL;

    Animated.timing(animatedHeight, {
      toValue: targetHeight,
      duration: 300,
      useNativeDriver: false,
      easing: Easing.out(Easing.quad),
    }).start();
  }, [sheetState]);

  const estadoAtualRef = useRef(sheetState);
  useEffect(() => { estadoAtualRef.current = sheetState; }, [sheetState]);

  // Gestos
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      
      onPanResponderRelease: (e, gestureState) => {
        const dy = gestureState.dy; 
        const vy = gestureState.vy;
        const estadoAtual = estadoAtualRef.current; 

        if (dy > 30 || vy > 0.5) {
          if (estadoAtual === 'expanded') setSheetState('collapsed');
          else if (estadoAtual === 'collapsed') setSheetState('closed');
        } 
        else if (dy < -30 || vy < -0.5) {
          if (estadoAtual === 'collapsed') setSheetState('expanded');
        }
        else if (Math.abs(dy) < 10) {
           if (estadoAtual === 'collapsed') setSheetState('expanded');
           else if (estadoAtual === 'expanded') setSheetState('collapsed');
        }
      },
    })
  ).current;

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        let currentLocation = await Location.getCurrentPositionAsync({});
        setLocation(currentLocation);
      }
      buscarSaloes(false); 
    })();
  }, []);

  async function buscarSaloes(eUmaPesquisaDoUser = true) {
    Keyboard.dismiss();
    
    // 2. PEDIMOS A IMAGEM AO SUPABASE
    let query = supabase
      .from('salons')
      .select('id, nome_salao, cidade, latitude, longitude, imagem') // <--- AQUI
      .not('latitude', 'is', null);

    if (cidadePesquisa.trim().length > 0) {
      query = query.ilike('cidade', `%${cidadePesquisa}%`);
    }

    const { data, error } = await query;

    if (!error && data) {
      setSaloes(data as Salao[]);
      if (data.length > 0) {
        if (eUmaPesquisaDoUser && cidadePesquisa.length > 0) {
          setSheetState('collapsed');
          mapRef.current?.animateToRegion({
            latitude: data[0].latitude,
            longitude: data[0].longitude,
            latitudeDelta: 0.1,
            longitudeDelta: 0.1,
          });
        } else {
           setSheetState('closed');
        }
      } else {
        setSheetState('closed');
      }
    }
  }

  return (
    <View style={styles.container}>
      
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={{
          latitude: 38.7253, longitude: -9.1500,
          latitudeDelta: 0.1, longitudeDelta: 0.1,
        }}
        showsUserLocation={true}
        onPress={() => {
            if (sheetState === 'expanded') setSheetState('collapsed');
        }}
      >
        {saloes.map((salao) => (
          <Marker
            key={salao.id}
            coordinate={{ latitude: salao.latitude, longitude: salao.longitude }}
          >
            <Callout onPress={() => router.push(`/salon/${salao.id}`)}>
               <View style={{padding: 5}}>
                 <Text style={{fontWeight:'bold'}}>{salao.nome_salao}</Text>
               </View>
            </Callout>
          </Marker>
        ))}
      </MapView>

      <View style={styles.topSearchContainer}>
        <View style={styles.searchBar}>
            <TextInput 
              style={styles.input}
              placeholder="Pesquisar cidade..."
              value={cidadePesquisa}
              onChangeText={setCidadePesquisa}
              onSubmitEditing={() => buscarSaloes(true)}
            />
            <TouchableOpacity onPress={() => {
                setCidadePesquisa('');
                setSheetState('closed');
                buscarSaloes(false);
            }}>
               <Ionicons name={cidadePesquisa ? "close" : "search"} size={20} color="#666" />
            </TouchableOpacity>
        </View>
      </View>

      {sheetState === 'closed' && saloes.length > 0 && (
        <View style={styles.floatingBtnContainer}>
            <TouchableOpacity 
              style={styles.floatingBtn} 
              onPress={() => setSheetState('collapsed')} 
            >
              <Text style={styles.floatingBtnText}>{saloes.length} Salões encontrados</Text>
              <Ionicons name="chevron-up" size={20} color="white" />
            </TouchableOpacity>
        </View>
      )}

      <Animated.View style={[
          styles.bottomSheet, 
          { height: animatedHeight } 
      ]}>
            
            <View 
                style={styles.sheetHeader} 
                {...panResponder.panHandlers} 
            >
                <View style={styles.handleIndicator} />
                <Text style={styles.sheetTitle}>
                    {saloes.length} cabeleireiros
                </Text>
            </View>

            <FlatList
              data={saloes}
              keyExtractor={(item) => item.id.toString()}
              contentContainerStyle={{paddingBottom: 40}}
              renderItem={({ item }) => (
                <TouchableOpacity 
                  style={styles.listItem} 
                  onPress={() => router.push(`/salon/${item.id}`)}
                >
                  {/* 3. AQUI ESTÁ A IMAGEM NO LUGAR DO EMOJI */}
                  <Image 
                    source={{ uri: item.imagem || 'https://via.placeholder.com/100' }} 
                    style={styles.listImage} 
                  />

                  <View style={{flex: 1}}>
                    <Text style={styles.listName}>{item.nome_salao}</Text>
                    <Text style={styles.listCity}>{item.cidade}</Text>
                  </View>
                  <View style={styles.arrowBtn}>
                    <Ionicons name="chevron-forward" size={16} color="#ccc" />
                  </View>
                </TouchableOpacity>
              )}
            />
      </Animated.View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  map: { width: '100%', height: '100%' },

  topSearchContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    width: '100%',
    paddingHorizontal: 20,
    zIndex: 10,
  },
  searchBar: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, elevation: 4,
  },
  input: { flex: 1, fontSize: 16, marginRight: 10 },

  floatingBtnContainer: {
    position: 'absolute', bottom: 30, width: '100%', alignItems: 'center', zIndex: 15,
  },
  floatingBtn: {
    backgroundColor: '#1a1a1a', 
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 25, borderRadius: 30,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, elevation: 6,
    gap: 8
  },
  floatingBtnText: { color: 'white', fontWeight: '600', fontSize: 15 },

  bottomSheet: {
    position: 'absolute', bottom: 0, width: '100%',
    backgroundColor: 'white',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: -5 }, shadowOpacity: 0.1, elevation: 20,
    zIndex: 20,
    overflow: 'hidden',
  },
  
  sheetHeader: {
    alignItems: 'center',
    paddingVertical: 12, 
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#f7f7f7',
  },
  handleIndicator: {
    width: 40, height: 4, 
    backgroundColor: '#e0e0e0', 
    borderRadius: 2, marginBottom: 10,
  },
  sheetTitle: { 
    fontWeight: '700', fontSize: 16, color: '#1a1a1a' 
  },
  
  listItem: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 24,
    borderBottomWidth: 1, borderBottomColor: '#f7f7f7', gap: 16,
  },
  // ESTILO NOVO PARA A IMAGEM
  listImage: {
    width: 50, height: 50, borderRadius: 8, backgroundColor: '#e1e1e1',
  },
  listName: { fontSize: 16, fontWeight: '600', color: '#1a1a1a' },
  listCity: { fontSize: 13, color: '#888', marginTop: 2 },
  arrowBtn: {
    width: 24, height: 24, alignItems: 'center', justifyContent: 'center',
  }
});