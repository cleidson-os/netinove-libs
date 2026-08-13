import {
  addScanDeviceListener,
  addScanFinishedListener,
  connect,
  disconnect,
  getBluetoothState,
  requestBluetoothScanPermissions,
  startScan,
  stopScan,
  writeText,
  write,
  encodePlainText,
  type BluetoothPrinter,
} from '@netinove/thermal-printer';
import { useEffect, useState } from 'react';
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
  const [status, setStatus] = useState('Pronto para buscar dispositivos próximos.');
  const [text, setText] = useState('Teste de impressao Bluetooth\nValor: R$ 10,00');
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    const deviceSubscription = addScanDeviceListener((device) => {
      setPrinters((current) => {
        const found = current.some((item) => item.address === device.address);
        return found
          ? current.map((item) =>
              item.address === device.address ? { ...item, ...device } : item
            )
          : [...current, device];
      });
    });
    const finishedSubscription = addScanFinishedListener(({ reason }) => {
      setScanning(false);
      setStatus(
        reason === 'timeout'
          ? 'Busca encerrada por tempo limite.'
          : reason === 'cancelled'
            ? 'Busca cancelada.'
            : 'Busca concluída.'
      );
    });

    return () => {
      deviceSubscription.remove();
      finishedSubscription.remove();
      void stopScan().catch(() => undefined);
    };
  }, []);

  async function loadPrinters() {
    try {
      const granted = await requestBluetoothScanPermissions();
      if (!granted) {
        setStatus('Permissão Bluetooth não concedida.');
        return;
      }

      const bluetoothState = await getBluetoothState();
      if (bluetoothState !== 'enabled') {
        setStatus(
          bluetoothState === 'disabled'
            ? 'Ative o Bluetooth do dispositivo.'
            : 'Este dispositivo não possui Bluetooth.'
        );
        return;
      }

      setPrinters([]);
      setScanning(true);
      setStatus('Buscando dispositivos próximos...');
      await startScan();
    } catch (error) {
      setScanning(false);
      setStatus(errorMessage(error));
    }
  }

  async function handleStopScan() {
    try {
      await stopScan();
    } catch (error) {
      setScanning(false);
      setStatus(errorMessage(error));
    }
  }

  async function handleConnect(printer: BluetoothPrinter) {
    setLoading(true);
    setStatus(
      printer.bonded
        ? `Conectando a ${printer.name}...`
        : `Conectando a ${printer.name}...`
    );
    try {
      const connection = await connect(printer.address);
      setConnectedAddress(connection.address ?? undefined);
      setPrinters((current) =>
        current.map((item) =>
          item.address === printer.address ? { ...item, bonded: true } : item
        )
      );
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
      const bytes = encodePlainText(text, 3);
      const pontoDoCorte = 50;

      await write(bytes.slice(0, pontoDoCorte), {
        chunkSize: 512,
        chunkDelayMs: 30,
      });
      // await writeText(text, { trailingLines: 3 });
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

        <Pressable
          disabled={loading || scanning}
          onPress={loadPrinters}
          style={[styles.primaryButton, (loading || scanning) && styles.disabledButton]}
        >
          {scanning ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryButtonText}>Buscar dispositivos próximos</Text>
          )}
        </Pressable>

        {scanning && (
          <Pressable onPress={handleStopScan} style={styles.stopScanButton}>
            <Text style={styles.primaryButtonText}>Parar busca</Text>
          </Pressable>
        )}

        <View style={styles.list}>
          {printers.map((printer) => {
            const connected = connectedAddress === printer.address;
            return (
              <View key={printer.address} style={styles.device}>
                <View style={styles.deviceInfo}>
                  <Text style={styles.deviceName}>{printer.name}</Text>
                  <Text style={styles.deviceAddress}>{printer.address}</Text>
                  <Text style={styles.deviceAddress}>
                    {printer.bonded ? 'Pareado' : 'Não pareado'}
                  </Text>
                  {printer.rssi !== undefined && (
                    <Text style={styles.deviceDiagnostic}>
                      RSSI: {printer.rssi} dBm · anúncios: {printer.discoveryCount ?? 1} ·{' '}
                      {printer.connectable === undefined
                        ? 'conexão desconhecida'
                        : printer.connectable
                          ? 'conectável'
                          : 'não conectável'}
                    </Text>
                  )}
                  {printer.advertisedName && printer.advertisedName !== printer.name && (
                    <Text style={styles.deviceDiagnostic}>
                      Nome anunciado: {printer.advertisedName}
                    </Text>
                  )}
                  <Text style={styles.deviceDiagnostic}>
                    Serviços: {printer.serviceUUIDs?.length ? printer.serviceUUIDs.join(', ') : 'nenhum anunciado'}
                  </Text>
                  {printer.manufacturerData && (
                    <Text selectable style={styles.deviceDiagnostic}>
                      Fabricante: {printer.manufacturerData}
                    </Text>
                  )}
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
  deviceDiagnostic: { marginTop: 4, color: '#566573', fontSize: 12 },
  deviceButton: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 6, backgroundColor: '#1769aa' },
  disconnectButton: { backgroundColor: '#a93226' },
  stopScanButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#6c7a89',
  },
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
