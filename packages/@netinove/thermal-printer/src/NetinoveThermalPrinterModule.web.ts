import { registerWebModule, NativeModule } from 'expo';

import type { NetinoveThermalPrinterEvents } from './NetinoveThermalPrinter.types';

// NetinoveThermalPrinterModule is not available on the web platform.
class NetinoveThermalPrinterModule extends NativeModule<NetinoveThermalPrinterEvents> {}

export default registerWebModule(NetinoveThermalPrinterModule, 'NetinoveThermalPrinterModule');
