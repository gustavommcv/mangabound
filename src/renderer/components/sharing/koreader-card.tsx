import { Copy, RadioTower } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/renderer/components/ui/button';
import { Input } from '@/renderer/components/ui/input';
import { Label } from '@/renderer/components/ui/label';
import { NativeSelect } from '@/renderer/components/ui/native-select';
import type { NetworkInterfaceOption, OpdsSharingStatus } from '@/shared/opds-contract';

export interface KoreaderCardProps {
  readonly interfaces: readonly NetworkInterfaceOption[];
  readonly status: OpdsSharingStatus;
  /** Serves the library the books were just saved to; the reader downloads them from here. */
  readonly onStart: (interfaceAddress: string) => void;
  readonly onStop: () => void;
}

/**
 * The shortest path from "books saved" to "books on the e-reader": serve the library on the local
 * network with a random token, then add the address to KOReader's OPDS catalogs. Choosing a
 * different library or Basic authentication stays in the Share panel.
 */
export function KoreaderCard({
  interfaces,
  onStart,
  onStop,
  status,
}: KoreaderCardProps): React.JSX.Element {
  const [chosen, setChosen] = useState('');
  const [copied, setCopied] = useState(false);
  const interfaceAddress = chosen === '' ? (interfaces[0]?.address ?? '') : chosen;
  const address =
    status.active && status.url !== undefined
      ? status.authMode === 'token' && status.token !== undefined
        ? `${status.url}/?token=${status.token}`
        : status.url
      : '';

  return (
    <section
      aria-labelledby="koreader-title"
      className="border-border bg-surface h-fit space-y-3 rounded-xl border p-5"
    >
      <div className="flex items-center gap-2">
        <RadioTower aria-hidden="true" className="text-muted-foreground size-4 shrink-0" />
        <h2 className="text-sm font-medium" id="koreader-title">
          Send to KOReader
        </h2>
        <span className="flex-1" />
        {status.active && (
          <span className="bg-accent/15 text-accent rounded-full px-2.5 py-0.5 text-xs">
            Sharing
          </span>
        )}
      </div>
      <p className="text-muted-foreground text-sm">
        KOReader downloads the books from this computer over your Wi-Fi.
      </p>

      {status.active ? (
        <>
          <div>
            <Label htmlFor="koreader-address">Address</Label>
            <div className="mt-1.5 flex gap-2">
              <Input id="koreader-address" readOnly value={address} />
              <Button
                aria-label="Copy the address"
                onClick={() => {
                  void navigator.clipboard.writeText(address).then(
                    () => {
                      setCopied(true);
                    },
                    () => {
                      setCopied(false);
                    },
                  );
                }}
                variant="outline"
              >
                <Copy /> {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          </div>
          <p className="text-subtle-foreground text-xs">
            In KOReader: Search, then OPDS catalog, then add this address. Keep Mangabound open
            while it syncs.
          </p>
          <Button onClick={onStop} variant="outline">
            Stop sharing
          </Button>
        </>
      ) : interfaces.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No local network address was found. Connect to Wi-Fi to share.
        </p>
      ) : (
        <>
          {interfaces.length > 1 && (
            <div>
              <Label htmlFor="koreader-interface">Network</Label>
              <NativeSelect
                id="koreader-interface"
                onChange={(event) => {
                  setChosen(event.target.value);
                }}
                value={interfaceAddress}
              >
                {interfaces.map((option) => (
                  <option key={option.address} value={option.address}>
                    {option.name} ({option.address})
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}
          <Button
            onClick={() => {
              onStart(interfaceAddress);
            }}
          >
            Start sharing
          </Button>
        </>
      )}
    </section>
  );
}
