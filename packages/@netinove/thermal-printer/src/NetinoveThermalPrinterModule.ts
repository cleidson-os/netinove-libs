import { NativeModule, requireNativeModule } from 'expo';

declare class NetinoveThermalPrinterModule extends NativeModule<Record<string, never>> {}

export default requireNativeModule<NetinoveThermalPrinterModule>('NetinoveThermalPrinter');
