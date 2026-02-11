import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useNavigation, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  FlatList,
  Image,
  Keyboard,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import { supabase } from '../../supabase';

type Salao = {
  id: number;
  nome_salao: string;
  cidade: string;
  latitude: number;
  longitude: number;
  imagem: string | null;
  categoria: string;
};

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const HEIGHT_FULL = SCREEN_HEIGHT * 0.8;
const HEIGHT_MEDIUM = SCREEN_HEIGHT * 0.45;
const HEIGHT_CLOSED = 0;
const BTN_SIZE = 50;
const ITEM_HEIGHT = 100;
const MAP_PADDING = { top: 120, right: 20, bottom: 20, left: 20 };

// Estilo do mapa (Clean)
const mapStyle = [
  { "featureType": "poi", "elementType": "labels.text", "stylers": [{ "visibility": "off" }] },
  { "featureType": "poi.business", "stylers": [{ "visibility": "off" }] },
  { "featureType": "road", "elementType": "labels.icon", "stylers": [{ "visibility": "off" }] },
  { "featureType": "transit", "stylers": [{ "visibility": "off" }] }
];

// --- FUNÇÃO AUXILIAR PARA ÍCONES ---
function getCategoryIcon(categoria: string): keyof typeof Ionicons.glyphMap {
  switch (categoria) {
    case 'Barbearia': return 'man';
    case 'Unhas': return 'hand-left';
    case 'Estética': return 'rose';
    case 'Cabeleireiro': default: return 'cut';
  }
}

// --- COMPONENTE DE MARCADOR ---
const SalonMarker = React.memo(({ salao, onPress, coordinate }: { salao: Salao, onPress: () => void, coordinate: any }) => {
  
  const hasImage = !!salao.imagem;
  return (
    <Marker

      coordinate={coordinate}
      onPress={(e) => {
        e.stopPropagation(); 
        onPress();
      }}
      // tracksViewChanges: false melhora muito a performance no Android
      tracksViewChanges={false} 
    >
       <View style={styles.customMarker}>
          <View style={[
              styles.markerImageContainer, 
              !hasImage && styles.markerNoImageContainer
          ]}>
             {hasImage ? (
                <Image source={{ uri: salao.imagem! }} style={styles.markerImage} />
             ) : (
                <Ionicons name={getCategoryIcon(salao.categoria)} size={20} color="white" />
             )}
          </View>
          <View style={[styles.markerArrow, !hasImage && styles.markerArrowNoImage]} />
       </View>
    </Marker>
  );
});

export default function MapScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const mapRef = useRef<MapView>(null);
  const flatListRef = useRef<FlatList>(null);
  
  const isNavigatingRef = useRef(false);

  const [saloes, setSaloes] = useState<Salao[]>([]);
  const [saloesVisiveis, setSaloesVisiveis] = useState<Salao[]>([]);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [cidadePesquisa, setCidadePesquisa] = useState('');
  
  const [sheetState, setSheetState] = useState<'closed' | 'collapsed' | 'expanded'>('closed');
  const [showSearchAreaBtn, setShowSearchAreaBtn] = useState(false);
  
  const [currentRegion, setCurrentRegion] = useState<Region | null>(null);
  const [lastSearchRegion, setLastSearchRegion] = useState<Region | null>(null);
  const [loading, setLoading] = useState(false);

  const animatedHeight = useRef(new Animated.Value(HEIGHT_CLOSED)).current;

  // --- NAVEGAÇÃO E ANIMAÇÕES ---
  useEffect(() => {
    const shouldHideTabBar = sheetState !== 'closed';
    navigation.setOptions({ tabBarStyle: { display: shouldHideTabBar ? 'none' : 'flex' } });
  }, [sheetState, navigation]);

  useEffect(() => {
    let targetHeight = HEIGHT_CLOSED;
    if (sheetState === 'collapsed') targetHeight = HEIGHT_MEDIUM;
    else if (sheetState === 'expanded') targetHeight = HEIGHT_FULL;

    Animated.timing(animatedHeight, {
      toValue: targetHeight,
      duration: 300,
      useNativeDriver: false,
      easing: Easing.out(Easing.poly(4)), 
    }).start();
  }, [sheetState]);

  const estadoAtualRef = useRef(sheetState);
  useEffect(() => { estadoAtualRef.current = sheetState; }, [sheetState]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderRelease: (e, gestureState) => {
        const dy = gestureState.dy; 
        const vy = gestureState.vy;
        const estadoAtual = estadoAtualRef.current; 

        if (dy > 60 || vy > 0.6) {
          if (estadoAtual === 'expanded') setSheetState('collapsed');
          else if (estadoAtual === 'collapsed') {
             setSheetState('closed');
             Keyboard.dismiss();
          }
        } else if (dy < -60 || vy < -0.6) {
          if (estadoAtual === 'collapsed') setSheetState('expanded');
        }
      },
    })
  ).current;

  // --- INICIALIZAÇÃO ---
  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        let currentLocation = await Location.getCurrentPositionAsync({});
        setLocation(currentLocation);
        
        const region = {
            latitude: currentLocation.coords.latitude,
            longitude: currentLocation.coords.longitude,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
        };
        
        setTimeout(() => {
            if (mapRef.current) {
                mapRef.current.animateToRegion(region, 800);
            }
        }, 500);
        
        setCurrentRegion(region);
        setLastSearchRegion(region);
        fetchSalonsInRegion(region); 
      } else {
        fetchSalonsInRegion({
            latitude: 38.7223, longitude: -9.1393,
            latitudeDelta: 0.1, longitudeDelta: 0.1
        });
      }
    })();
  }, []);

  // --- BUSCA ---
 async function fetchSalonsInRegion(region?: Region, cityTerm?: string) {
    if (loading) return;
    setLoading(true);
    setShowSearchAreaBtn(false);

    try {
        let query = supabase
          .from('salons')
          .select('id, nome_salao, cidade, latitude, longitude, imagem, categoria')
          .eq('is_visible', true) // <--- ADICIONADO: Filtra apenas os visíveis
          .not('latitude', 'is', null)
          .not('longitude', 'is', null);

        if (cityTerm && cityTerm.trim().length > 0) {
            query = query.ilike('cidade', `%${cityTerm.trim()}%`);
        } else if (region) {
            const latBuffer = region.latitudeDelta * 0.5;
            const lonBuffer = region.longitudeDelta * 0.5;

            const minLat = region.latitude - region.latitudeDelta / 2 - latBuffer;
            const maxLat = region.latitude + region.latitudeDelta / 2 + latBuffer;
            const minLon = region.longitude - region.longitudeDelta / 2 - lonBuffer;
            const maxLon = region.longitude + region.longitudeDelta / 2 + lonBuffer;
            
            query = query
                .gte('latitude', minLat).lte('latitude', maxLat)
                .gte('longitude', minLon).lte('longitude', maxLon);
        }

        const { data, error } = await query;

        if (error) throw error;

        if (data) {
          const resultadosValidos = (data as Salao[]).filter(s => 
              s.latitude && s.longitude && !isNaN(Number(s.latitude)) && !isNaN(Number(s.longitude))
          );

          setSaloes(resultadosValidos);
          setSaloesVisiveis(resultadosValidos);
          
          if (cityTerm && resultadosValidos.length > 0) {
              setSheetState('collapsed');
              const targetRegion = {
                  latitude: resultadosValidos[0].latitude,
                  longitude: resultadosValidos[0].longitude,
                  latitudeDelta: 0.08,
                  longitudeDelta: 0.08,
              };
              if (mapRef.current) mapRef.current.animateToRegion(targetRegion, 1000);
              setLastSearchRegion(targetRegion);
              setCurrentRegion(targetRegion);
          } else if (region) {
              setLastSearchRegion(region);
          }
        }
    } catch (err: any) {
        console.error("Erro busca mapa:", err);
        Alert.alert("Erro", "Não foi possível carregar os salões.");
    } finally {
        setLoading(false);
    }
  }

  function handleCitySearch() {
      Keyboard.dismiss();
      fetchSalonsInRegion(undefined, cidadePesquisa);
  }

  // --- MUDANÇA IMPORTANTE AQUI (Deteção de Zoom) ---
  function handleRegionChangeComplete(region: Region) {
      setCurrentRegion(region);

      const minLat = region.latitude - region.latitudeDelta / 2;
      const maxLat = region.latitude + region.latitudeDelta / 2;
      const minLon = region.longitude - region.longitudeDelta / 2;
      const maxLon = region.longitude + region.longitudeDelta / 2;

      const visiveis = saloes.filter(s => 
          s.latitude >= minLat && s.latitude <= maxLat &&
          s.longitude >= minLon && s.longitude <= maxLon
      );
      setSaloesVisiveis(visiveis);

      if (lastSearchRegion) {
          // Diferença de posição (Centro)
          const latDiff = Math.abs(region.latitude - lastSearchRegion.latitude);
          const lonDiff = Math.abs(region.longitude - lastSearchRegion.longitude);
          
          // Diferença de Zoom (Delta)
          const latDeltaDiff = Math.abs(region.latitudeDelta - lastSearchRegion.latitudeDelta);
          const lonDeltaDiff = Math.abs(region.longitudeDelta - lastSearchRegion.longitudeDelta);

          // Verifica se mudou a posição OU o zoom (mais de 10% de alteração)
          if (
              latDiff > region.latitudeDelta * 0.1 || 
              lonDiff > region.longitudeDelta * 0.1 ||
              latDeltaDiff > lastSearchRegion.latitudeDelta * 0.1 || 
              lonDeltaDiff > lastSearchRegion.longitudeDelta * 0.1
          ) {
              setShowSearchAreaBtn(true);
          }
      }
  }

  function centerOnUser() {
      if (location) {
          const region = {
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
              latitudeDelta: 0.05,
              longitudeDelta: 0.05,
          };
          if (mapRef.current) mapRef.current.animateToRegion(region, 1000);
          setCurrentRegion(region);
          setCidadePesquisa('');
          fetchSalonsInRegion(region);
      }
  }

  function handleMarkerPress(salao: Salao) {
      if (isNavigatingRef.current) return;
      isNavigatingRef.current = true;
      router.push(`/salon/${salao.id}`);
      setTimeout(() => { isNavigatingRef.current = false; }, 1000);
  }

  const markers = useMemo(() => {
  return saloes.map((salao) => {
      const lat = Number(salao.latitude);
      const lon = Number(salao.longitude);
      if (isNaN(lat) || isNaN(lon)) return null;
      // diferente para ios ou android
      if (Platform.OS === 'android') {
          return (
              <Marker 
                  key={`${salao.id}`} 
                  coordinate={{ latitude: lat, longitude: lon }} 
                  onPress={() => handleMarkerPress(salao)}
                  // Define cores diferentes por categoria para parecer o Google Maps
                  pinColor={'red'}
              />
          );
      } else {
          return (
            <SalonMarker 
                key={`${salao.id}`} 
                coordinate={{ latitude: lat, longitude: lon }} 
                salao={salao} 
                onPress={() => handleMarkerPress(salao)} 
            />
        );
      }
  });
}, [saloes]);

  return (
    <View style={styles.container}>
      
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : PROVIDER_DEFAULT}
        customMapStyle={mapStyle}
        initialRegion={{
          latitude: 38.7253, longitude: -9.1500,
          latitudeDelta: 0.1, longitudeDelta: 0.1,
        }}
        showsUserLocation={true}
        showsMyLocationButton={false}
        showsCompass={false}
        mapPadding={MAP_PADDING}
        onRegionChangeComplete={handleRegionChangeComplete}
        onPress={() => {
            if(sheetState !== 'closed') {
                setSheetState('closed');
                Keyboard.dismiss();
            }
        }}
      >
        {markers}
      </MapView>

      <View style={styles.topSearchContainer}>
        <View style={styles.searchBar}>
            <Ionicons name="search" size={20} color="#666" style={{marginRight: 8}} />
            <TextInput 
              style={styles.input}
              placeholder="Pesquisar cidade..."
              placeholderTextColor="#999"
              value={cidadePesquisa}
              onChangeText={setCidadePesquisa}
              onSubmitEditing={handleCitySearch}
              returnKeyType="search"
            />
            {cidadePesquisa.length > 0 && !loading && (
                <TouchableOpacity onPress={() => { setCidadePesquisa(''); centerOnUser(); }}>
                   <Ionicons name="close-circle" size={18} color="#ccc" />
                </TouchableOpacity>
            )}
        </View>
      </View>

      {/* BOTÃO "PESQUISAR NESTA ÁREA" */}
      {showSearchAreaBtn && !loading && (
          <View style={styles.searchAreaContainer}>
              <TouchableOpacity 
                style={styles.searchAreaBtn} 
                activeOpacity={0.8}
                onPress={() => {
                    setCidadePesquisa('');
                    if (currentRegion) fetchSalonsInRegion(currentRegion);
                }}
              >
                  <Ionicons name="refresh" size={16} color="white" style={{marginRight: 6}} />
                  <Text style={styles.searchAreaText}>Pesquisar nesta área</Text>
              </TouchableOpacity>
          </View>
      )}

      {loading && (
           <View style={styles.searchAreaContainer}>
               <View style={styles.searchAreaBtn}>
                   <ActivityIndicator size="small" color="white" style={{marginRight: 6}} />
                   <Text style={styles.searchAreaText}>A carregar...</Text>
               </View>
           </View>
      )}

      <View style={styles.controlsContainer}>
          <TouchableOpacity style={styles.circleBtn} onPress={centerOnUser}>
              <Ionicons name="locate" size={24} color="#1a1a1a" />
          </TouchableOpacity>

          {sheetState === 'closed' && saloesVisiveis.length > 0 && (
            <TouchableOpacity 
                style={styles.listPillBtn} 
                onPress={() => setSheetState('collapsed')} 
            >
                <Ionicons name="list" size={18} color="white" />
                <Text style={styles.listPillText}>Lista</Text>
            </TouchableOpacity>
          )}
      </View>

      <Animated.View style={[ styles.bottomSheet, { height: animatedHeight } ]}>
            <View style={styles.sheetHeader} {...panResponder.panHandlers}>
                <View style={styles.handleIndicator} />
                <Text style={styles.sheetTitle}>
                    {saloesVisiveis.length} {saloesVisiveis.length === 1 ? 'resultado' : 'resultados'} nesta área
                </Text>
            </View>

            <FlatList
              ref={flatListRef}
              data={saloesVisiveis}
              keyExtractor={(item) => item.id.toString()}
              contentContainerStyle={{padding: 20, paddingBottom: 50}} 
              showsVerticalScrollIndicator={false}
              getItemLayout={(data, index) => ({length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index})}
              renderItem={({ item }) => (
                <TouchableOpacity 
                  style={styles.card} 
                  onPress={() => handleMarkerPress(item)} 
                  activeOpacity={0.9}
                >
                  <Image 
                    source={{ uri: item.imagem || 'https://via.placeholder.com/150' }} 
                    style={styles.cardImage} 
                  />

                  <View style={styles.cardContent}>
                    <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start'}}>
                        <Text style={styles.cardTitle} numberOfLines={1}>{item.nome_salao}</Text>
                        <Ionicons name="chevron-forward" size={18} color="#ccc" />
                    </View>
                    <View style={styles.badgeRow}>
                         <View style={styles.categoryBadge}>
                             <Text style={styles.categoryBadgeText}>{item.categoria}</Text>
                         </View>
                    </View>
                    <View style={styles.locationRow}>
                        <Ionicons name="location-sharp" size={14} color="#888" />
                        <Text style={styles.cardLocation} numberOfLines={1}>{item.cidade}</Text>
                    </View>
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
  
  // Custom Marker
  customMarker: { alignItems: 'center', justifyContent: 'center', width: 50, height: 60 },
  markerImageContainer: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#1a1a1a', borderWidth: 2, borderColor: 'white',
    justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, elevation: 5,
  },
  markerNoImageContainer: { backgroundColor: '#333', borderColor: '#ccc' },
  markerImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  markerArrow: {
    width: 0, height: 0, backgroundColor: 'transparent', borderStyle: 'solid',
    borderLeftWidth: 6, borderRightWidth: 6, borderBottomWidth: 0, borderTopWidth: 8,
    borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: '#1a1a1a',
    marginTop: -2,
  },
  markerArrowNoImage: { borderTopColor: '#333' },

  // UI
  topSearchContainer: {
    position: 'absolute', top: Platform.OS === 'ios' ? 60 : 50,
    width: '100%', paddingHorizontal: 20, zIndex: 10,
  },
  searchBar: {
    flexDirection: 'row', backgroundColor: 'white', borderRadius: 25,
    paddingHorizontal: 16, height: BTN_SIZE, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 5,
  },
  input: { flex: 1, fontSize: 15, color: '#1a1a1a', marginRight: 10 },
  searchAreaContainer: { position: 'absolute', top: 115, width: '100%', alignItems: 'center', zIndex: 9 },
  searchAreaBtn: {
      flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a', 
      paddingHorizontal: 20, paddingVertical: 10, borderRadius: 25,
      shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 6
  },
  searchAreaText: { fontWeight: '600', color: 'white', fontSize: 13 },
  controlsContainer: {
      position: 'absolute', right: 20, bottom: 120, alignItems: 'flex-end', gap: 15, zIndex: 10,
  },
  circleBtn: {
      width: BTN_SIZE, height: BTN_SIZE, borderRadius: BTN_SIZE/2, backgroundColor: 'white',
      justifyContent: 'center', alignItems: 'center',
      shadowColor: '#000', shadowOffset: {width:0, height:2}, shadowOpacity:0.15, shadowRadius:5, elevation:4
  },
  listPillBtn: {
      flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a',
      paddingVertical: 12, paddingHorizontal: 20, borderRadius: 30, gap: 8,
      shadowColor: '#000', shadowOffset: {width:0, height:4}, shadowOpacity:0.3, shadowRadius:5, elevation:6
  },
  listPillText: { color: 'white', fontWeight: '600', fontSize: 14 },
  bottomSheet: {
    position: 'absolute', bottom: 0, width: '100%', backgroundColor: '#F8F9FA',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: -5 }, shadowOpacity: 0.1, elevation: 20,
    zIndex: 20, overflow: 'hidden',
  },
  sheetHeader: {
    alignItems: 'center', paddingVertical: 15, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  handleIndicator: { width: 40, height: 5, backgroundColor: '#e0e0e0', borderRadius: 3, marginBottom: 8 },
  sheetTitle: { fontWeight: '600', fontSize: 13, color: '#999' },
  card: {
    flexDirection: 'row', backgroundColor: 'white', borderRadius: 16,
    marginBottom: 12, padding: 12, height: 100, 
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
    borderWidth: 1, borderColor: 'transparent'
  },
  cardImage: { width: 80, height: '100%', borderRadius: 12, backgroundColor: '#f0f0f0' },
  cardContent: { flex: 1, marginLeft: 12, justifyContent: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#1a1a1a', marginBottom: 4 },
  badgeRow: { flexDirection: 'row', marginBottom: 6 },
  categoryBadge: { backgroundColor: '#F5F5F5', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }, 
  categoryBadgeText: { fontSize: 11, color: '#333', fontWeight: '600' }, 
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardLocation: { fontSize: 13, color: '#666' },
  
  miniMarker: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 30, // Largura reduzida
    height: 40,
  },
  miniMarkerInner: {
    width: 24, // Tamanho do círculo do pin
    height: 24,
    borderRadius: 12,
    backgroundColor: '#E74C3C', // Cor vermelha estilo Google Maps
    borderWidth: 1.5,
    borderColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
  },
  miniMarkerArrow: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderBottomWidth: 0,
    borderTopWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#E74C3C',
    marginTop: -1,
  },
});