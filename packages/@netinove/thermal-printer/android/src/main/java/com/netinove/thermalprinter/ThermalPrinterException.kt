package com.netinove.thermalprinter

import expo.modules.kotlin.exception.CodedException

class ThermalPrinterException(
  code: String,
  message: String,
  cause: Throwable? = null
) : CodedException(code, message, cause)
