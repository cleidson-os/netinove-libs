import {
  connect,
  disconnect,
  getBluetoothState,
  getBondedPrinters,
  requestBluetoothPermissions,
  writeText,
  type BluetoothPrinter,
} from '@netinove/thermal-printer';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function App() {
  const [printers, setPrinters] = useState<BluetoothPrinter[]>([]);
  const [connectedAddress, setConnectedAddress] = useState<string>();
  const [status, setStatus] = useState('Pronto para buscar dispositivos pareados.');
  const [text, setText] = useState('Teste de impressao Bluetooth\nValor: R$ 10,00');
  const [loading, setLoading] = useState(false);

  async function loadPrinters() {
    setLoading(true);
    try {
      const granted = await requestBluetoothPermissions();
      if (!granted) {
        setStatus('Permissão Bluetooth não concedida.');
        return;
      }

      const bluetoothState = await getBluetoothState();
      if (bluetoothState !== 'enabled') {
        setStatus(
          bluetoothState === 'disabled'
            ? 'Ative o Bluetooth do Android.'
            : 'Este dispositivo não possui Bluetooth.'
        );
        return;
      }

      const bondedPrinters = await getBondedPrinters();
      setPrinters(bondedPrinters);
      setStatus(
        bondedPrinters.length > 0
          ? `${bondedPrinters.length} dispositivo(s) pareado(s).`
          : 'Nenhum dispositivo pareado nas configurações do Android.'
      );
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function handleConnect(printer: BluetoothPrinter) {
    setLoading(true);
    setStatus(`Conectando a ${printer.name}...`);
    try {
      const connection = await connect(printer.address);
      setConnectedAddress(connection.address ?? undefined);
      setStatus(`${printer.name} conectada.`);
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function handleDisconnect() {
    setLoading(true);
    try {
      await disconnect();
      setConnectedAddress(undefined);
      setStatus('Impressora desconectada.');
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function handlePrint() {
    if (!connectedAddress) {
      setStatus('Conecte uma impressora antes de enviar o texto.');
      return;
    }

    setLoading(true);
    setStatus('Enviando texto...');
    try {
      await writeText(text, { trailingLines: 3 });
      setStatus('Texto enviado com sucesso.');
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>@netinove/thermal-printer</Text>
        <Text style={styles.status}>{status}</Text>

        <Pressable disabled={loading} onPress={loadPrinters} style={styles.primaryButton}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryButtonText}>Buscar dispositivos pareados</Text>
          )}
        </Pressable>

        <View style={styles.list}>
          {printers.map((printer) => {
            const connected = connectedAddress === printer.address;
            return (
              <View key={printer.address} style={styles.device}>
                <View style={styles.deviceInfo}>
                  <Text style={styles.deviceName}>{printer.name}</Text>
                  <Text style={styles.deviceAddress}>{printer.address}</Text>
                </View>
                <Pressable
                  disabled={loading}
                  onPress={() => (connected ? handleDisconnect() : handleConnect(printer))}
                  style={[styles.deviceButton, connected && styles.disconnectButton]}
                >
                  <Text style={styles.deviceButtonText}>
                    {connected ? 'Desconectar' : 'Conectar'}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>

        <TextInput
          editable={!loading}
          multiline
          onChangeText={setText}
          placeholder="Texto para impressão"
          style={styles.textInput}
          textAlignVertical="top"
          value={text}
        />

        <Pressable
          disabled={loading || !connectedAddress || text.length === 0}
          onPress={handlePrint}
          style={[
            styles.primaryButton,
            (loading || !connectedAddress || text.length === 0) && styles.disabledButton,
          ]}
        >
          <Text style={styles.primaryButtonText}>Imprimir texto</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f4f6f8' },
  container: { padding: 24, gap: 16 },
  title: { fontSize: 24, fontWeight: '700', color: '#17202a' },
  status: { padding: 16, borderRadius: 8, backgroundColor: '#fff', color: '#34495e' },
  primaryButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#1769aa',
  },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  list: { gap: 12 },
  device: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  deviceInfo: { flex: 1 },
  deviceName: { fontSize: 16, fontWeight: '600', color: '#17202a' },
  deviceAddress: { marginTop: 4, color: '#6c7a89' },
  deviceButton: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 6, backgroundColor: '#1769aa' },
  disconnectButton: { backgroundColor: '#a93226' },
  deviceButtonText: { color: '#fff', fontWeight: '600' },
  textInput: {
    minHeight: 140,
    padding: 16,
    borderWidth: 1,
    borderColor: '#d5d8dc',
    borderRadius: 8,
    backgroundColor: '#fff',
    color: '#17202a',
  },
  disabledButton: { opacity: 0.45 },
});
