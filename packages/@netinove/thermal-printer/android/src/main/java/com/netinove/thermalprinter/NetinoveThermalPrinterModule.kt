package com.netinove.thermalprinter

import android.Manifest
import android.app.Activity
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import com.facebook.react.bridge.BaseActivityEventListener
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import java.io.IOException
import java.util.UUID

class NetinoveThermalPrinterModule : Module() {
  private var socket: BluetoothSocket? = null
  private var connectedAddress: String? = null
  private var scanActive = false
  private var scanReceiverRegistered = false
  private val discoveredAddresses = mutableSetOf<String>()
  private val mainHandler = Handler(Looper.getMainLooper())
  private val scanTimeout = Runnable { finishScan("timeout", cancelDiscovery = true) }
  private val scanReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      when (intent.action) {
        BluetoothDevice.ACTION_FOUND -> {
          val device = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
          } else {
            @Suppress("DEPRECATION")
            intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
          }
          if (device != null) emitDevice(device)
        }
        BluetoothAdapter.ACTION_DISCOVERY_FINISHED -> finishScan("completed")
      }
    }
  }
  private var enableBluetoothPromise: Promise? = null
  private val activityEventListener = object : BaseActivityEventListener() {
    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
      if (requestCode != REQUEST_ENABLE_BLUETOOTH) return
      val promise = enableBluetoothPromise ?: return
      enableBluetoothPromise = null
      appContext.reactContext?.removeActivityEventListener(this)
      promise.resolve(resultCode == Activity.RESULT_OK || adapterOrNull()?.isEnabled == true)
    }
  }

  override fun definition() = ModuleDefinition {
    Name("NetinoveThermalPrinter")
    Events("onDeviceFound", "onScanFinished")

    AsyncFunction("getBluetoothState") {
      val bluetooth = adapterOrNull()
      when {
        bluetooth == null -> "unsupported"
        else -> {
          checkConnectPermission()
          if (bluetooth.isEnabled) "enabled" else "disabled"
        }
      }
    }

    AsyncFunction("turnOnBluetooth") { promise: Promise ->
      checkConnectPermission()
      val bluetooth = adapterOrNull()
        ?: throw ThermalPrinterException("ERR_BT_UNAVAILABLE", "Dispositivo sem Bluetooth")
      if (bluetooth.isEnabled) {
        promise.resolve(true)
        return@AsyncFunction
      }
      if (enableBluetoothPromise != null) {
        throw ThermalPrinterException("ERR_BT_ENABLE_IN_PROGRESS", "Uma solicitação de ativação já está em andamento")
      }
      val activity = appContext.currentActivity
        ?: throw ThermalPrinterException("ERR_CONTEXT_UNAVAILABLE", "Activity Android indisponível")
      enableBluetoothPromise = promise
      appContext.reactContext?.addActivityEventListener(activityEventListener)
      try {
        activity.startActivityForResult(Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE), REQUEST_ENABLE_BLUETOOTH)
      } catch (error: Exception) {
        enableBluetoothPromise = null
        appContext.reactContext?.removeActivityEventListener(activityEventListener)
        throw ThermalPrinterException("ERR_BT_UNAVAILABLE", "Não foi possível solicitar a ativação do Bluetooth", error)
      }
    }

    AsyncFunction("getBondedPrinters") {
      checkConnectPermission()
      val bluetooth = enabledAdapter()

      bluetooth.bondedDevices
        .sortedWith(compareBy(String.CASE_INSENSITIVE_ORDER) { it.name ?: it.address })
        .map { device ->
          mapOf(
            "address" to device.address,
            "name" to (device.name ?: "Dispositivo sem nome"),
            "bonded" to true
          )
        }
    }

    AsyncFunction("startScan") { timeoutMs: Int ->
      checkScanPermission()
      if (scanActive) {
        throw ThermalPrinterException("ERR_SCAN_IN_PROGRESS", "Uma busca já está em andamento")
      }
      val bluetooth = enabledAdapter()

      scanActive = true
      discoveredAddresses.clear()
      try {
        registerScanReceiver()
      } catch (error: Exception) {
        scanActive = false
        throw ThermalPrinterException(
          "ERR_SCAN_FAILED",
          "Não foi possível preparar a busca Bluetooth",
          error
        )
      }

      val started = try {
        bluetooth.startDiscovery()
      } catch (error: Exception) {
        finishScanWithoutEvent(cancelDiscovery = false)
        throw ThermalPrinterException(
          "ERR_SCAN_FAILED",
          error.message ?: "Não foi possível iniciar a busca Bluetooth",
          error
        )
      }
      if (!started) {
        finishScanWithoutEvent(cancelDiscovery = false)
        throw ThermalPrinterException(
          "ERR_SCAN_FAILED",
          "Não foi possível iniciar a busca Bluetooth"
        )
      }

      bluetooth.bondedDevices
        .sortedWith(compareBy(String.CASE_INSENSITIVE_ORDER) { it.name ?: it.address })
        .forEach(::emitDevice)
      mainHandler.postDelayed(scanTimeout, timeoutMs.coerceIn(1_000, 60_000).toLong())
    }

    AsyncFunction("stopScan") {
      if (scanActive) finishScan("cancelled", cancelDiscovery = true)
    }

    AsyncFunction("connect") { address: String ->
      checkConnectPermission()
      if (!BLUETOOTH_ADDRESS.matches(address)) {
        throw ThermalPrinterException("ERR_INVALID_ADDRESS", "Endereço Bluetooth inválido")
      }

      if (socket?.isConnected == true && connectedAddress == address.uppercase()) {
        return@AsyncFunction connectionState()
      }

      val bluetooth = enabledAdapter()
      if (scanActive) finishScan("cancelled", cancelDiscovery = true)
      closeSocket()

      try {
        val device = bluetooth.getRemoteDevice(address)
        ensureBonded(device)
        val connection = device.createRfcommSocketToServiceRecord(SPP_UUID)
        connection.connect()
        socket = connection
        connectedAddress = address.uppercase()
        connectionState()
      } catch (error: Exception) {
        closeSocket()
        if (error is ThermalPrinterException) throw error
        throw ThermalPrinterException(
          "ERR_CONNECTION_FAILED",
          error.message ?: "Falha ao conectar à impressora",
          error
        )
      }
    }

    Function("getConnectionState") {
      connectionState()
    }

    AsyncFunction("write") { values: List<Int>, chunkSize: Int, chunkDelayMs: Int ->
      checkConnectPermission()
      val connection = socket?.takeIf { it.isConnected }
        ?: throw ThermalPrinterException("ERR_NOT_CONNECTED", "Nenhuma impressora conectada")
      if (values.isEmpty()) {
        throw ThermalPrinterException("ERR_EMPTY_DATA", "Nenhum dado foi fornecido para escrita")
      }
      val bytes = values.map { value ->
        if (value !in 0..255) {
          throw ThermalPrinterException(
            "ERR_INVALID_BYTE",
            "Cada byte deve estar entre 0 e 255"
          )
        }
        value.toByte()
      }.toByteArray()
      val safeChunkSize = chunkSize.coerceIn(32, 4096)
      val safeDelay = chunkDelayMs.coerceIn(0, 500).toLong()

      try {
        val output = connection.outputStream
        bytes.asList().chunked(safeChunkSize).forEach { chunk ->
          output.write(chunk.toByteArray())
          output.flush()
          if (safeDelay > 0) Thread.sleep(safeDelay)
        }
      } catch (error: Exception) {
        closeSocket()
        throw ThermalPrinterException(
          "ERR_WRITE_FAILED",
          error.message ?: "Falha ao enviar dados para a impressora",
          error
        )
      }
    }

    AsyncFunction("disconnect") {
      closeSocket()
    }

    OnDestroy {
      enableBluetoothPromise?.resolve(false)
      enableBluetoothPromise = null
      appContext.reactContext?.removeActivityEventListener(activityEventListener)
      finishScanWithoutEvent(cancelDiscovery = true)
      closeSocket()
    }
  }

  private fun context(): Context = appContext.reactContext
    ?: throw ThermalPrinterException("ERR_CONTEXT_UNAVAILABLE", "Contexto Android indisponível")

  private fun adapterOrNull(): BluetoothAdapter? {
    val manager = context().getSystemService(BluetoothManager::class.java)
    return manager.adapter
  }

  private fun enabledAdapter(): BluetoothAdapter {
    val bluetooth = adapterOrNull()
      ?: throw ThermalPrinterException("ERR_BT_UNAVAILABLE", "Dispositivo sem Bluetooth")
    if (!bluetooth.isEnabled) {
      throw ThermalPrinterException("ERR_BT_DISABLED", "Bluetooth desabilitado")
    }
    return bluetooth
  }

  private fun checkConnectPermission() {
    if (
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
      context().checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED
    ) {
      throw ThermalPrinterException(
        "ERR_PERMISSION_DENIED",
        "Permissão Bluetooth não concedida"
      )
    }
  }

  private fun checkScanPermission() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      if (
        context().checkSelfPermission(Manifest.permission.BLUETOOTH_SCAN) != PackageManager.PERMISSION_GRANTED ||
        context().checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED
      ) {
        throw ThermalPrinterException(
          "ERR_PERMISSION_DENIED",
          "Permissões Bluetooth para busca não concedidas"
        )
      }
    } else if (
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.M &&
      context().checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED
    ) {
      throw ThermalPrinterException(
        "ERR_PERMISSION_DENIED",
        "Permissão de localização para busca Bluetooth não concedida"
      )
    }
  }

  private fun ensureBonded(device: BluetoothDevice) {
    if (device.bondState == BluetoothDevice.BOND_BONDED) return

    if (device.bondState == BluetoothDevice.BOND_NONE) {
      val started = try {
        device.createBond()
      } catch (error: Exception) {
        throw ThermalPrinterException(
          "ERR_PAIRING_FAILED",
          error.message ?: "Não foi possível iniciar o pareamento",
          error
        )
      }
      if (!started) {
        throw ThermalPrinterException(
          "ERR_PAIRING_FAILED",
          "O Android recusou o início do pareamento"
        )
      }
    }

    val deadline = SystemClock.elapsedRealtime() + PAIRING_TIMEOUT_MS
    var observedBonding = device.bondState == BluetoothDevice.BOND_BONDING
    while (SystemClock.elapsedRealtime() < deadline) {
      when (device.bondState) {
        BluetoothDevice.BOND_BONDED -> return
        BluetoothDevice.BOND_BONDING -> observedBonding = true
        BluetoothDevice.BOND_NONE -> if (observedBonding) {
          throw ThermalPrinterException(
            "ERR_PAIRING_FAILED",
            "O pareamento foi cancelado ou recusado"
          )
        }
      }
      Thread.sleep(PAIRING_POLL_INTERVAL_MS)
    }

    throw ThermalPrinterException(
      "ERR_PAIRING_TIMEOUT",
      "O pareamento não foi concluído dentro do tempo limite"
    )
  }

  private fun registerScanReceiver() {
    val filter = IntentFilter().apply {
      addAction(BluetoothDevice.ACTION_FOUND)
      addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED)
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      context().registerReceiver(scanReceiver, filter, Context.RECEIVER_EXPORTED)
    } else {
      @Suppress("UnspecifiedRegisterReceiverFlag")
      context().registerReceiver(scanReceiver, filter)
    }
    scanReceiverRegistered = true
  }

  private fun emitDevice(device: BluetoothDevice) {
    val address = device.address.uppercase()
    if (!scanActive || !discoveredAddresses.add(address)) return
    sendEvent(
      "onDeviceFound",
      mapOf(
        "address" to address,
        "name" to (device.name ?: "Dispositivo sem nome"),
        "bonded" to (device.bondState == BluetoothDevice.BOND_BONDED)
      )
    )
  }

  private fun finishScan(reason: String, cancelDiscovery: Boolean = false) {
    if (!scanActive) return
    finishScanWithoutEvent(cancelDiscovery)
    sendEvent("onScanFinished", mapOf("reason" to reason))
  }

  private fun finishScanWithoutEvent(cancelDiscovery: Boolean) {
    if (!scanActive && !scanReceiverRegistered) return
    scanActive = false
    mainHandler.removeCallbacks(scanTimeout)
    if (cancelDiscovery) {
      try {
        adapterOrNull()?.cancelDiscovery()
      } catch (_: SecurityException) {
        // Permissions may have been revoked while scanning.
      }
    }
    if (scanReceiverRegistered) {
      try {
        context().unregisterReceiver(scanReceiver)
      } catch (_: IllegalArgumentException) {
        // The receiver was already removed by Android.
      }
      scanReceiverRegistered = false
    }
    discoveredAddresses.clear()
  }

  private fun connectionState() = mapOf(
    "connected" to (socket?.isConnected == true),
    "address" to connectedAddress
  )

  private fun closeSocket() {
    try {
      socket?.close()
    } catch (_: IOException) {
      // The connection is already unusable; there is nothing else to release.
    }
    socket = null
    connectedAddress = null
  }

  companion object {
    private const val REQUEST_ENABLE_BLUETOOTH = 41_082
    private const val PAIRING_TIMEOUT_MS = 30_000L
    private const val PAIRING_POLL_INTERVAL_MS = 250L
    private val SPP_UUID: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
    private val BLUETOOTH_ADDRESS = Regex("^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$")
  }
}
