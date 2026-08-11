import CoreBluetooth
import ExpoModulesCore

private final class PendingWrite {
  let chunks: [Data]
  let delay: TimeInterval
  let promise: Promise
  let type: CBCharacteristicWriteType
  var index = 0

  init(chunks: [Data], delay: TimeInterval, promise: Promise, type: CBCharacteristicWriteType) {
    self.chunks = chunks
    self.delay = delay
    self.promise = promise
    self.type = type
  }
}

private final class BluetoothDelegate: NSObject, CBCentralManagerDelegate, CBPeripheralDelegate {
  weak var owner: NetinoveThermalPrinterModule?

  init(owner: NetinoveThermalPrinterModule) {
    self.owner = owner
  }

  func centralManagerDidUpdateState(_ central: CBCentralManager) {
    owner?.centralManagerDidUpdateState(central)
  }

  func centralManager(_ central: CBCentralManager, willRestoreState dict: [String: Any]) {
    owner?.centralManager(central, willRestoreState: dict)
  }

  func centralManager(
    _ central: CBCentralManager,
    didDiscover peripheral: CBPeripheral,
    advertisementData: [String: Any],
    rssi RSSI: NSNumber
  ) {
    owner?.centralManager(
      central,
      didDiscover: peripheral,
      advertisementData: advertisementData,
      rssi: RSSI
    )
  }

  func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
    owner?.centralManager(central, didConnect: peripheral)
  }

  func centralManager(
    _ central: CBCentralManager,
    didFailToConnect peripheral: CBPeripheral,
    error: Error?
  ) {
    owner?.centralManager(central, didFailToConnect: peripheral, error: error)
  }

  func centralManager(
    _ central: CBCentralManager,
    didDisconnectPeripheral peripheral: CBPeripheral,
    error: Error?
  ) {
    owner?.centralManager(central, didDisconnectPeripheral: peripheral, error: error)
  }

  func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
    owner?.peripheral(peripheral, didDiscoverServices: error)
  }

  func peripheral(
    _ peripheral: CBPeripheral,
    didDiscoverCharacteristicsFor service: CBService,
    error: Error?
  ) {
    owner?.peripheral(peripheral, didDiscoverCharacteristicsFor: service, error: error)
  }

  func peripheral(
    _ peripheral: CBPeripheral,
    didWriteValueFor characteristic: CBCharacteristic,
    error: Error?
  ) {
    owner?.peripheral(peripheral, didWriteValueFor: characteristic, error: error)
  }

  func peripheralIsReady(toSendWriteWithoutResponse peripheral: CBPeripheral) {
    owner?.peripheralIsReady(toSendWriteWithoutResponse: peripheral)
  }
}

public final class NetinoveThermalPrinterModule: Module {
  private lazy var bluetoothDelegate = BluetoothDelegate(owner: self)
  private var centralManager: CBCentralManager?
  private var discoveredPeripherals: [UUID: CBPeripheral] = [:]
  private var discoveryCounts: [UUID: Int] = [:]
  private var connectedPeripheral: CBPeripheral?
  private var writeCharacteristic: CBCharacteristic?
  private var scanActive = false
  private var scanTimeoutWorkItem: DispatchWorkItem?
  private var permissionPromises: [Promise] = []
  private var statePromises: [Promise] = []
  private var connectPromise: Promise?
  private var requestedServiceUUID: CBUUID?
  private var requestedCharacteristicUUID: CBUUID?
  private var pendingServiceIds = Set<CBUUID>()
  private var writableCharacteristics: [CBCharacteristic] = []
  private var pendingWrite: PendingWrite?

  public func definition() -> ModuleDefinition {
    Name("NetinoveThermalPrinter")
    Events("onDeviceFound", "onScanFinished")

    AsyncFunction("requestBluetoothPermissions") { (promise: Promise) in
      self.onMain {
        switch CBManager.authorization {
        case .allowedAlways:
          promise.resolve(true)
        case .denied, .restricted:
          promise.resolve(false)
        case .notDetermined:
          self.permissionPromises.append(promise)
          self.ensureCentralManager()
        @unknown default:
          promise.resolve(false)
        }
      }
    }

    AsyncFunction("getBluetoothState") { (promise: Promise) in
      self.onMain {
        self.ensureCentralManager()
        guard let manager = self.centralManager, manager.state != .unknown else {
          self.statePromises.append(promise)
          return
        }
        promise.resolve(self.bluetoothState(manager.state))
      }
    }

    AsyncFunction("turnOnBluetooth") { (promise: Promise) in
      self.onMain {
        self.ensureCentralManager()
        promise.resolve(self.centralManager?.state == .poweredOn)
      }
    }

    AsyncFunction("getBondedPrinters") { (promise: Promise) in
      promise.reject(
        "ERR_PLATFORM_UNSUPPORTED",
        "iOS does not expose a list of paired BLE peripherals; use startScan()"
      )
    }

    AsyncFunction("startScan") { (timeoutMs: Int, promise: Promise) in
      self.onMain {
        self.ensureCentralManager()
        guard let manager = self.centralManager else {
          promise.reject("ERR_BT_UNAVAILABLE", "Bluetooth is unavailable")
          return
        }
        guard CBManager.authorization == .allowedAlways else {
          promise.reject("ERR_PERMISSION_DENIED", "Bluetooth permission was not granted")
          return
        }
        guard manager.state == .poweredOn else {
          promise.reject(self.stateErrorCode(manager.state), self.stateErrorMessage(manager.state))
          return
        }
        guard !self.scanActive else {
          promise.reject("ERR_SCAN_IN_PROGRESS", "A Bluetooth scan is already in progress")
          return
        }

        let disconnectedPeripheralIds = self.discoveredPeripherals.compactMap { identifier, peripheral in
          peripheral.state == .disconnected ? identifier : nil
        }
        disconnectedPeripheralIds.forEach { identifier in
          self.discoveredPeripherals[identifier]?.delegate = nil
          self.discoveredPeripherals.removeValue(forKey: identifier)
        }
        self.scanActive = true
        self.discoveryCounts.removeAll()
        manager.scanForPeripherals(withServices: [CBUUID](), options: [
          CBCentralManagerScanOptionAllowDuplicatesKey: true
        ])

        let timeout = max(1_000, min(timeoutMs, 60_000))
        let workItem = DispatchWorkItem { [weak self] in
          self?.finishScan(reason: "timeout")
        }
        self.scanTimeoutWorkItem = workItem
        DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(timeout), execute: workItem)
        promise.resolve()
      }
    }

    AsyncFunction("stopScan") { (promise: Promise) in
      self.onMain {
        if self.scanActive {
          self.finishScan(reason: "cancelled")
        }
        promise.resolve()
      }
    }

    AsyncFunction("connect") { (address: String, options: [String: String], promise: Promise) in
      self.onMain {
        self.connect(address: address, options: options, promise: promise)
      }
    }

    Function("getConnectionState") {
      self.connectionState()
    }

    AsyncFunction("write") { (values: [Int], chunkSize: Int, chunkDelayMs: Int, promise: Promise) in
      self.onMain {
        self.write(values: values, chunkSize: chunkSize, chunkDelayMs: chunkDelayMs, promise: promise)
      }
    }

    AsyncFunction("disconnect") { (promise: Promise) in
      self.onMain {
        self.disconnect(rejectPending: true)
        promise.resolve()
      }
    }

    OnDestroy {
      self.onMain {
        self.finishScanWithoutEvent()
        self.disconnect(rejectPending: true)
        self.permissionPromises.forEach {
          $0.reject("ERR_CONTEXT_UNAVAILABLE", "Module was destroyed")
        }
        self.statePromises.forEach {
          $0.reject("ERR_CONTEXT_UNAVAILABLE", "Module was destroyed")
        }
        self.permissionPromises.removeAll()
        self.statePromises.removeAll()
        self.centralManager = nil
      }
    }
  }

  private func onMain(_ work: @escaping () -> Void) {
    if Thread.isMainThread {
      work()
    } else {
      DispatchQueue.main.async(execute: work)
    }
  }

  private func ensureCentralManager() {
    if centralManager == nil {
      centralManager = CBCentralManager(
        delegate: bluetoothDelegate,
        queue: DispatchQueue.main,
        options: [
          // iOS does not expose an API that changes the radio state. This asks the system to show
          // its standard Bluetooth power alert when an operation creates the central manager.
          CBCentralManagerOptionShowPowerAlertKey: true,
          CBCentralManagerOptionRestoreIdentifierKey: "netinove-thermal-printer-ble"
        ]
      )
    }
  }

  private func bluetoothState(_ state: CBManagerState) -> String {
    switch state {
    case .poweredOn:
      return "enabled"
    case .poweredOff, .unauthorized:
      return "disabled"
    case .unsupported, .resetting, .unknown:
      return "unsupported"
    @unknown default:
      return "unsupported"
    }
  }

  private func stateErrorCode(_ state: CBManagerState) -> String {
    if state == .unauthorized { return "ERR_PERMISSION_DENIED" }
    if state == .poweredOff { return "ERR_BT_DISABLED" }
    return "ERR_BT_UNAVAILABLE"
  }

  private func stateErrorMessage(_ state: CBManagerState) -> String {
    if state == .unauthorized { return "Bluetooth permission was not granted" }
    if state == .poweredOff { return "Bluetooth is disabled" }
    return "Bluetooth is unavailable"
  }

  private func finishScan(reason: String) {
    guard scanActive else { return }
    finishScanWithoutEvent()
    sendEvent("onScanFinished", ["reason": reason])
  }

  private func finishScanWithoutEvent() {
    scanTimeoutWorkItem?.cancel()
    scanTimeoutWorkItem = nil
    if scanActive {
      centralManager?.stopScan()
      scanActive = false
    }
  }

  private func connect(address: String, options: [String: String], promise: Promise) {
    ensureCentralManager()
    guard let manager = centralManager else {
      promise.reject("ERR_BT_UNAVAILABLE", "Bluetooth is unavailable")
      return
    }
    guard manager.state == .poweredOn else {
      promise.reject(stateErrorCode(manager.state), stateErrorMessage(manager.state))
      return
    }
    guard let identifier = UUID(uuidString: address) else {
      promise.reject("ERR_INVALID_ADDRESS", "Invalid BLE peripheral identifier")
      return
    }

    let service = options["serviceUUID"].map(CBUUID.init(string:))
    let characteristic = options["characteristicUUID"].map(CBUUID.init(string:))
    guard (service == nil) == (characteristic == nil) else {
      promise.reject(
        "ERR_INVALID_ADDRESS",
        "serviceUUID and characteristicUUID must be provided together"
      )
      return
    }

    if connectedPeripheral?.identifier == identifier,
       connectedPeripheral?.state == .connected,
       writeCharacteristic != nil {
      promise.resolve(connectionState())
      return
    }

    finishScan(reason: "cancelled")
    disconnect(rejectPending: true)

    let peripheral = discoveredPeripherals[identifier]
      ?? manager.retrievePeripherals(withIdentifiers: [identifier]).first
    guard let peripheral else {
      promise.reject("ERR_CONNECTION_FAILED", "BLE peripheral was not found; scan again")
      return
    }

    connectedPeripheral = peripheral
    peripheral.delegate = bluetoothDelegate
    connectPromise = promise
    requestedServiceUUID = service
    requestedCharacteristicUUID = characteristic
    writableCharacteristics.removeAll()
    pendingServiceIds.removeAll()
    manager.connect(peripheral)
  }

  private func write(
    values: [Int],
    chunkSize: Int,
    chunkDelayMs: Int,
    promise: Promise
  ) {
    guard pendingWrite == nil else {
      promise.reject("ERR_WRITE_FAILED", "A write is already in progress")
      return
    }
    guard let peripheral = connectedPeripheral,
          peripheral.state == .connected,
          let characteristic = writeCharacteristic else {
      promise.reject("ERR_NOT_CONNECTED", "No printer is connected")
      return
    }
    guard !values.isEmpty else {
      promise.reject("ERR_EMPTY_DATA", "No data was provided for writing")
      return
    }
    guard values.allSatisfy({ (0...255).contains($0) }) else {
      promise.reject("ERR_INVALID_BYTE", "Each byte must be between 0 and 255")
      return
    }

    let writeType: CBCharacteristicWriteType = characteristic.properties.contains(.writeWithoutResponse)
      ? .withoutResponse
      : .withResponse
    let nativeMaximum = peripheral.maximumWriteValueLength(for: writeType)
    let requestedMaximum = max(32, min(chunkSize, 4_096))
    let effectiveChunkSize = max(1, min(nativeMaximum, requestedMaximum))
    let bytes = values.map { UInt8($0) }
    let chunks = stride(from: 0, to: bytes.count, by: effectiveChunkSize).map { offset in
      Data(bytes[offset..<min(offset + effectiveChunkSize, bytes.count)])
    }

    pendingWrite = PendingWrite(
      chunks: chunks,
      delay: Double(max(0, min(chunkDelayMs, 500))) / 1_000,
      promise: promise,
      type: writeType
    )
    sendNextChunk()
  }

  private func sendNextChunk() {
    guard let pending = pendingWrite,
          let peripheral = connectedPeripheral,
          let characteristic = writeCharacteristic else {
      failWrite("Printer disconnected while writing")
      return
    }
    guard pending.index < pending.chunks.count else {
      pending.promise.resolve()
      pendingWrite = nil
      return
    }
    if pending.type == .withoutResponse && !peripheral.canSendWriteWithoutResponse {
      return
    }

    let chunk = pending.chunks[pending.index]
    pending.index += 1
    peripheral.writeValue(chunk, for: characteristic, type: pending.type)

    if pending.type == .withoutResponse {
      scheduleNextChunk(after: pending.delay)
    }
  }

  private func scheduleNextChunk(after delay: TimeInterval) {
    if delay > 0 {
      DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
        self?.sendNextChunk()
      }
    } else {
      DispatchQueue.main.async { [weak self] in
        self?.sendNextChunk()
      }
    }
  }

  private func failWrite(_ message: String) {
    pendingWrite?.promise.reject("ERR_WRITE_FAILED", message)
    pendingWrite = nil
  }

  private func disconnect(rejectPending: Bool) {
    if rejectPending {
      connectPromise?.reject("ERR_CONNECTION_FAILED", "Connection was cancelled")
      failWrite("Connection was closed")
    }
    connectPromise = nil
    if let peripheral = connectedPeripheral {
      centralManager?.cancelPeripheralConnection(peripheral)
      peripheral.delegate = nil
    }
    connectedPeripheral = nil
    writeCharacteristic = nil
    requestedServiceUUID = nil
    requestedCharacteristicUUID = nil
    pendingServiceIds.removeAll()
    writableCharacteristics.removeAll()
  }

  private func connectionState() -> [String: Any?] {
    let connected = connectedPeripheral?.state == .connected && writeCharacteristic != nil
    return [
      "connected": connected,
      "address": connected ? connectedPeripheral?.identifier.uuidString : nil
    ]
  }

  private func failConnection(code: String, message: String) {
    connectPromise?.reject(code, message)
    connectPromise = nil
    if let peripheral = connectedPeripheral {
      centralManager?.cancelPeripheralConnection(peripheral)
      peripheral.delegate = nil
    }
    connectedPeripheral = nil
    writeCharacteristic = nil
    pendingServiceIds.removeAll()
    writableCharacteristics.removeAll()
  }

  private func completeCharacteristicDiscovery() {
    guard pendingServiceIds.isEmpty else { return }

    let selected: CBCharacteristic?
    if let requestedCharacteristicUUID {
      selected = writableCharacteristics.first { $0.uuid == requestedCharacteristicUUID }
    } else {
      selected = writableCharacteristics.first { $0.properties.contains(.writeWithoutResponse) }
        ?? writableCharacteristics.first { $0.properties.contains(.write) }
    }

    guard let selected else {
      failConnection(
        code: "ERR_CHARACTERISTIC_NOT_FOUND",
        message: "No writable BLE characteristic was found"
      )
      return
    }
    writeCharacteristic = selected
    connectPromise?.resolve(connectionState())
    connectPromise = nil
  }

  fileprivate func centralManagerDidUpdateState(_ central: CBCentralManager) {
    let state = bluetoothState(central.state)
    statePromises.forEach { $0.resolve(state) }
    statePromises.removeAll()

    if CBManager.authorization != .notDetermined {
      let granted = CBManager.authorization == .allowedAlways
      permissionPromises.forEach { $0.resolve(granted) }
      permissionPromises.removeAll()
    }

    if central.state != .poweredOn {
      finishScan(reason: "cancelled")
      if connectedPeripheral != nil || connectPromise != nil {
        failConnection(code: stateErrorCode(central.state), message: stateErrorMessage(central.state))
      }
      if pendingWrite != nil {
        failWrite(stateErrorMessage(central.state))
      }
    }
  }

  fileprivate func centralManager(_ central: CBCentralManager, willRestoreState dict: [String: Any]) {
    guard let peripherals = dict[CBCentralManagerRestoredStatePeripheralsKey] as? [CBPeripheral] else {
      return
    }
    peripherals.forEach { peripheral in
      discoveredPeripherals[peripheral.identifier] = peripheral
      peripheral.delegate = bluetoothDelegate
    }
  }

  fileprivate func centralManager(
    _ central: CBCentralManager,
    didDiscover peripheral: CBPeripheral,
    advertisementData: [String: Any],
    rssi RSSI: NSNumber
  ) {
    discoveredPeripherals[peripheral.identifier] = peripheral
    let discoveryCount = (discoveryCounts[peripheral.identifier] ?? 0) + 1
    discoveryCounts[peripheral.identifier] = discoveryCount
    let advertisedName = advertisementData[CBAdvertisementDataLocalNameKey] as? String
    let serviceUUIDs = (advertisementData[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID])?
      .map(\.uuidString) ?? []
    let manufacturerData = (advertisementData[CBAdvertisementDataManufacturerDataKey] as? Data)?
      .map { String(format: "%02X", $0) }
      .joined()
    let connectable = (advertisementData[CBAdvertisementDataIsConnectable] as? NSNumber)?.boolValue
    var event: [String: Any] = [
      "address": peripheral.identifier.uuidString,
      "name": advertisedName ?? peripheral.name ?? "Unnamed device",
      "bonded": false,
      "rssi": RSSI.intValue,
      "discoveryCount": discoveryCount
    ]
    if let advertisedName { event["advertisedName"] = advertisedName }
    if !serviceUUIDs.isEmpty { event["serviceUUIDs"] = serviceUUIDs }
    if let manufacturerData { event["manufacturerData"] = manufacturerData }
    if let connectable { event["connectable"] = connectable }
    sendEvent("onDeviceFound", event)
  }

  fileprivate func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
    peripheral.delegate = bluetoothDelegate
    peripheral.discoverServices(requestedServiceUUID.map { [$0] })
  }

  fileprivate func centralManager(
    _ central: CBCentralManager,
    didFailToConnect peripheral: CBPeripheral,
    error: Error?
  ) {
    failConnection(
      code: "ERR_CONNECTION_FAILED",
      message: error?.localizedDescription ?? "Failed to connect to the BLE peripheral"
    )
  }

  fileprivate func centralManager(
    _ central: CBCentralManager,
    didDisconnectPeripheral peripheral: CBPeripheral,
    error: Error?
  ) {
    guard connectedPeripheral?.identifier == peripheral.identifier else { return }
    if connectPromise != nil {
      failConnection(
        code: "ERR_CONNECTION_FAILED",
        message: error?.localizedDescription ?? "BLE peripheral disconnected"
      )
    } else {
      failWrite(error?.localizedDescription ?? "BLE peripheral disconnected")
      connectedPeripheral = nil
      writeCharacteristic = nil
    }
  }

  fileprivate func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
    if let error {
      failConnection(code: "ERR_SERVICE_NOT_FOUND", message: error.localizedDescription)
      return
    }
    guard let services = peripheral.services, !services.isEmpty else {
      failConnection(code: "ERR_SERVICE_NOT_FOUND", message: "No BLE services were found")
      return
    }
    if let requestedServiceUUID, !services.contains(where: { $0.uuid == requestedServiceUUID }) {
      failConnection(code: "ERR_SERVICE_NOT_FOUND", message: "Requested BLE service was not found")
      return
    }

    let selectedServices = requestedServiceUUID == nil
      ? services
      : services.filter { $0.uuid == requestedServiceUUID }
    pendingServiceIds = Set(selectedServices.map(\.uuid))
    writableCharacteristics.removeAll()
    selectedServices.forEach { service in
      peripheral.discoverCharacteristics(requestedCharacteristicUUID.map { [$0] }, for: service)
    }
  }

  fileprivate func peripheral(
    _ peripheral: CBPeripheral,
    didDiscoverCharacteristicsFor service: CBService,
    error: Error?
  ) {
    if let error {
      failConnection(code: "ERR_CHARACTERISTIC_NOT_FOUND", message: error.localizedDescription)
      return
    }
    service.characteristics?.forEach { characteristic in
      if characteristic.properties.contains(.writeWithoutResponse)
        || characteristic.properties.contains(.write) {
        writableCharacteristics.append(characteristic)
      }
    }
    pendingServiceIds.remove(service.uuid)
    completeCharacteristicDiscovery()
  }

  fileprivate func peripheral(
    _ peripheral: CBPeripheral,
    didWriteValueFor characteristic: CBCharacteristic,
    error: Error?
  ) {
    guard pendingWrite?.type == .withResponse else { return }
    if let error {
      failWrite(error.localizedDescription)
      return
    }
    scheduleNextChunk(after: pendingWrite?.delay ?? 0)
  }

  fileprivate func peripheralIsReady(toSendWriteWithoutResponse peripheral: CBPeripheral) {
    sendNextChunk()
  }
}
