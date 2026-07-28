package com.netinove.thermalprinter

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class NetinoveThermalPrinterModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("NetinoveThermalPrinter")

    AsyncFunction("setValueAsync") { value: String ->
    }
  }
}
