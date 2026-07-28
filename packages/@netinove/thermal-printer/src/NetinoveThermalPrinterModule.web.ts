import { registerWebModule, NativeModule } from 'expo';

// NetinoveThermalPrinterModule is not available on the web platform.
class NetinoveThermalPrinterModule extends NativeModule<Record<string, never>> {}

export default registerWebModule(NetinoveThermalPrinterModule, 'NetinoveThermalPrinterModule');
