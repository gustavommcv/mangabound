import { RadioTower } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/renderer/components/ui/button';
import { Input } from '@/renderer/components/ui/input';
import { Label } from '@/renderer/components/ui/label';
import { NativeSelect } from '@/renderer/components/ui/native-select';
import type {
  NetworkInterfaceOption,
  OpdsAuthConfig,
  OpdsSharingStatus,
} from '@/shared/opds-contract';
import type { SelectedLibrary } from '@/shared/workflow-contract';

export interface SharePanelProps {
  readonly library?: SelectedLibrary;
  readonly interfaces: readonly NetworkInterfaceOption[];
  readonly status: OpdsSharingStatus;
  readonly onChooseLibrary: () => void;
  readonly onStart: (interfaceAddress: string, auth: OpdsAuthConfig) => void;
  readonly onStop: () => void;
}

export function SharePanel({
  library,
  interfaces,
  status,
  onChooseLibrary,
  onStart,
  onStop,
}: SharePanelProps): React.JSX.Element {
  const [interfaceAddress, setInterfaceAddress] = useState('');
  const [authMode, setAuthMode] = useState<'token' | 'basic'>('token');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const selectedInterfaceAddress =
    interfaceAddress === '' ? (interfaces[0]?.address ?? '') : interfaceAddress;
  const canStart =
    library !== undefined &&
    selectedInterfaceAddress !== '' &&
    (authMode === 'token' || (username.trim() !== '' && password !== ''));
  const shareUrl =
    status.active && status.url !== undefined
      ? status.authMode === 'token' && status.token !== undefined
        ? `${status.url}/?token=${status.token}`
        : status.url
      : undefined;

  return (
    <section
      aria-labelledby="share-title"
      className="border-border bg-surface shadow-card rounded-xl border p-5"
    >
      <div className="flex items-center gap-2">
        <RadioTower aria-hidden="true" className="text-accent size-4 shrink-0" />
        <h2 className="text-sm font-semibold" id="share-title">
          Share via OPDS
        </h2>
      </div>
      <p className="text-muted-foreground mt-1 text-xs">
        Serve a newest-first catalog on your network so KOReader, or any OPDS reader, can browse and
        download what you&apos;ve converted.
      </p>

      {status.active ? (
        <div className="mt-4 space-y-3">
          <div>
            <Label className="sr-only" htmlFor="share-url">
              Catalog URL
            </Label>
            <Input id="share-url" readOnly value={shareUrl ?? ''} />
          </div>
          <p className="text-muted-foreground text-xs">
            Add this address as a catalog in your OPDS reader.
          </p>
          <Button onClick={onStop} size="sm" variant="outline">
            Stop sharing
          </Button>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-3">
            <Button onClick={onChooseLibrary} size="sm" variant="outline">
              {library === undefined ? 'Choose a library to share' : 'Change shared library'}
            </Button>
            {library !== undefined && (
              <span className="text-muted-foreground truncate text-xs">{library.displayPath}</span>
            )}
          </div>

          {interfaces.length === 0 ? (
            <p className="text-muted-foreground text-xs">No network interfaces were detected.</p>
          ) : (
            <div>
              <Label htmlFor="share-interface">Network interface</Label>
              <NativeSelect
                id="share-interface"
                onChange={(event) => {
                  setInterfaceAddress(event.target.value);
                }}
                value={selectedInterfaceAddress}
              >
                {interfaces.map((option) => (
                  <option key={option.address} value={option.address}>
                    {option.name} ({option.address})
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}

          <div>
            <Label htmlFor="share-auth-mode">Authentication</Label>
            <NativeSelect
              id="share-auth-mode"
              onChange={(event) => {
                setAuthMode(event.target.value === 'basic' ? 'basic' : 'token');
              }}
              value={authMode}
            >
              <option value="token">Random token in the URL</option>
              <option value="basic">Username and password</option>
            </NativeSelect>
          </div>

          {authMode === 'basic' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="share-username">Username</Label>
                <Input
                  id="share-username"
                  onChange={(event) => {
                    setUsername(event.target.value);
                  }}
                  value={username}
                />
              </div>
              <div>
                <Label htmlFor="share-password">Password</Label>
                <Input
                  id="share-password"
                  onChange={(event) => {
                    setPassword(event.target.value);
                  }}
                  type="password"
                  value={password}
                />
              </div>
            </div>
          )}

          <Button
            disabled={!canStart}
            onClick={() => {
              onStart(
                selectedInterfaceAddress,
                authMode === 'token' ? { mode: 'token' } : { mode: 'basic', username, password },
              );
            }}
            size="sm"
          >
            Start sharing
          </Button>
        </div>
      )}
    </section>
  );
}
