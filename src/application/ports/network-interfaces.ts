export interface NetworkInterfaceOption {
  readonly name: string;
  readonly address: string;
}

export interface NetworkInterfacePort {
  list(): readonly NetworkInterfaceOption[];
  /**
   * Whether sharing may be started on `address`: one of this device's own addresses that the
   * list offers, or the loopback address, which no other device can reach. A wildcard such as
   * `0.0.0.0`, or a name, is not an address the person chose.
   */
  canShareOn(address: string): boolean;
}
