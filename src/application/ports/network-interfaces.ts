export interface NetworkInterfaceOption {
  readonly name: string;
  readonly address: string;
}

export interface NetworkInterfacePort {
  list(): readonly NetworkInterfaceOption[];
}
