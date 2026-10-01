import { type Dispatch, type SetStateAction, useEffect, useRef, useState } from 'react';

import { type BookFormat } from '@/domain/conversion';
import {
  defaultMangapressSettings,
  type MangapressSettings,
  validateMangapressSettings,
} from '@/domain/output-profile';
import { defaultFormat } from '@/domain/preferences';
import { defaultProcessMode, type ProcessMode } from '@/domain/process-mode';
import type { NetworkInterfaceOption } from '@/shared/opds-contract';
import type { MangaboundBridge } from '@/shared/runtime-info';
import type { SaveSettingsCommand } from '@/shared/settings-contract';

/** What is kept of the choices on screen. */
function settingsToKeep(values: {
  readonly mode: ProcessMode;
  readonly format: BookFormat;
  readonly settings: MangapressSettings;
  readonly singleBook: boolean;
  readonly providerId: string | undefined;
  readonly preferredNetworkInterface: NetworkInterfaceOption | undefined;
}): SaveSettingsCommand {
  return {
    preferences: {
      mode: values.mode,
      format: values.format,
      settings: values.settings,
      singleBook: values.singleBook,
      ...(values.providerId === undefined ? {} : { providerId: values.providerId }),
    },
    ...(values.preferredNetworkInterface === undefined
      ? {}
      : { preferredNetworkInterface: values.preferredNetworkInterface }),
  };
}

/**
 * The choices that are kept between sessions (ADR 0014): the process steps, the format, the
 * conversion options, one book per series, the online source and the network address to share on.
 * They start as the defaults, are replaced once by what was kept (a notice for anything that could
 * not be restored), and every change after that is saved. `notify` is told what the person should
 * know about; it is a dependency of both effects, so pass a stable function.
 */
export function useKeptSettings(
  bridge: MangaboundBridge,
  notify: (message: string) => void,
): {
  readonly mode: ProcessMode;
  readonly setMode: Dispatch<SetStateAction<ProcessMode>>;
  readonly format: BookFormat;
  readonly setFormat: Dispatch<SetStateAction<BookFormat>>;
  readonly settings: MangapressSettings;
  readonly setSettings: Dispatch<SetStateAction<MangapressSettings>>;
  readonly singleBook: boolean;
  readonly setSingleBook: Dispatch<SetStateAction<boolean>>;
  /** No online source is chosen until a person chooses one; it is then kept for the next title. */
  readonly selectedProviderId: string | undefined;
  readonly setSelectedProviderId: Dispatch<SetStateAction<string | undefined>>;
  readonly preferredNetworkInterface: NetworkInterfaceOption | undefined;
  readonly setPreferredNetworkInterface: Dispatch<
    SetStateAction<NetworkInterfaceOption | undefined>
  >;
} {
  const [settings, setSettings] = useState<MangapressSettings>(defaultMangapressSettings);
  const [format, setFormat] = useState<BookFormat>(defaultFormat);
  const [mode, setMode] = useState<ProcessMode>(defaultProcessMode);
  const [singleBook, setSingleBook] = useState(false);
  const [selectedProviderId, setSelectedProviderId] = useState<string>();
  const [preferredNetworkInterface, setPreferredNetworkInterface] =
    useState<NetworkInterfaceOption>();
  // What was kept from the last session is read once; nothing is saved before it has been (ADR 0014).
  const [restored, setRestored] = useState(false);
  // What was last read or written, so only a real change is written: a first launch leaves no file,
  // and a file that could not be read stays until something is changed.
  const lastKept = useRef<string | undefined>(undefined);

  useEffect(() => {
    let current = true;
    void bridge
      .loadSettings()
      .then(
        (result) => (result.ok ? result.value : undefined),
        () => undefined,
      )
      .then((saved) => {
        if (!current) return;
        if (saved === undefined) {
          // Nothing is saved from here on: what is on screen is only the defaults, and saving
          // them would overwrite what was kept.
          notify('The saved settings could not be loaded.');
          return;
        }
        const restoredSingleBook = Boolean(saved.preferences.singleBook);
        const resolvedMode = restoredSingleBook ? 'bind-and-convert' : saved.preferences.mode;
        const resolvedFormat = restoredSingleBook ? 'epub' : saved.preferences.format;
        const resolvedSettings = {
          ...saved.preferences.settings,
          combineIntoOneVolume: false,
        };
        lastKept.current = JSON.stringify(
          settingsToKeep({
            ...saved.preferences,
            mode: resolvedMode,
            format: resolvedFormat,
            singleBook: restoredSingleBook,
            settings: resolvedSettings,
            providerId: saved.preferences.providerId,
            preferredNetworkInterface: saved.preferredNetworkInterface,
          }),
        );
        setSingleBook(restoredSingleBook);
        setMode(resolvedMode);
        setFormat(resolvedFormat);
        setSettings(resolvedSettings);
        setSelectedProviderId(saved.preferences.providerId);
        setPreferredNetworkInterface(saved.preferredNetworkInterface);
        for (const notice of saved.notices) notify(notice);
        setRestored(true);
      });
    return () => {
      current = false;
    };
  }, [bridge, notify]);

  useEffect(() => {
    if (!restored) return;
    // A value that is half typed is not kept: the last valid options stay saved until it is fixed.
    if (validateMangapressSettings(settings, format).length > 0) return;
    const command = settingsToKeep({
      mode,
      format,
      settings,
      singleBook,
      providerId: selectedProviderId,
      preferredNetworkInterface,
    });
    const key = JSON.stringify(command);
    if (key === lastKept.current) return;
    lastKept.current = key;
    // A failed save is tried again with the next change, whatever it is.
    const failedToSave = (message: string): void => {
      lastKept.current = undefined;
      notify(message);
    };
    void bridge.saveSettings(command).then(
      (result) => {
        if (!result.ok) failedToSave(result.error.message);
      },
      () => {
        failedToSave('The settings could not be saved.');
      },
    );
  }, [
    bridge,
    restored,
    mode,
    format,
    settings,
    singleBook,
    selectedProviderId,
    preferredNetworkInterface,
    notify,
  ]);

  return {
    mode,
    setMode,
    format,
    setFormat,
    settings,
    setSettings,
    singleBook,
    setSingleBook,
    selectedProviderId,
    setSelectedProviderId,
    preferredNetworkInterface,
    setPreferredNetworkInterface,
  };
}
