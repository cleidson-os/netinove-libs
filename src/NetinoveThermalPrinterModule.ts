import { NativeModule, requireNativeModule } from 'expo';

declare class NetinoveThermalPrinterModule extends NativeModule<{}> {
  setValueAsync(value: string): Promise<void>;
}

export default requireNativeModule<NetinoveThermalPrinterModule>('NetinoveThermalPrinter');
