package com.netinove.thermalprinter

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.IOException
import java.util.UUID

class NetinoveThermalPrinterModule : Module() {
  private var socket: BluetoothSocket? = null
  private var connectedAddress: String? = null

  override fun definition() = ModuleDefinition {
    Name("NetinoveThermalPrinter")

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

    AsyncFunction("connect") { address: String ->
      checkConnectPermission()
      if (!BLUETOOTH_ADDRESS.matches(address)) {
        throw ThermalPrinterException("ERR_INVALID_ADDRESS", "Endereço Bluetooth inválido")
      }

      if (socket?.isConnected == true && connectedAddress == address.uppercase()) {
        return@AsyncFunction connectionState()
      }

      val bluetooth = enabledAdapter()
      closeSocket()

      try {
        val connection = bluetooth
          .getRemoteDevice(address)
          .createRfcommSocketToServiceRecord(SPP_UUID)
        connection.connect()
        socket = connection
        connectedAddress = address.uppercase()
        connectionState()
      } catch (error: Exception) {
        closeSocket()
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
    private val SPP_UUID: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
    private val BLUETOOTH_ADDRESS = Regex("^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$")
  }
}
