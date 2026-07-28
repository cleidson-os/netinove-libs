import '@netinove/thermal-printer';
import { SafeAreaView, StyleSheet, Text } from 'react-native';

export default function App() {
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>@netinove/thermal-printer</Text>
      <Text style={styles.description}>Expo Module carregado com sucesso.</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
  },
  description: {
    marginTop: 12,
    fontSize: 16,
    color: '#555',
  },
});
