import {
  blockedModeReason,
  defaultProcessMode,
  type ModeInput,
  modeFromSteps,
  type ProcessMode,
  type ProcessSteps as Steps,
  resolveMode,
  stepsFromMode,
} from '@/domain/process-mode';
import { Checkbox } from '@/renderer/components/ui/checkbox';
import { SettingFieldHeader } from '@/renderer/components/settings/setting-field-header';

interface ProcessStepsProps {
  /** What is being run, since a CBZ and a whole library allow different processes. */
  readonly input: ModeInput;
  readonly mode: ProcessMode;
  readonly onMode: (mode: ProcessMode) => void;
  readonly disabled?: boolean;
}

/** Which of the two tools a run uses: join chapters into volumes, convert for a device, or both. */
export function ProcessSteps({
  disabled = false,
  input,
  mode,
  onMode,
}: ProcessStepsProps): React.JSX.Element {
  const resolvedMode = resolveMode(input, mode);
  const steps = stepsFromMode(resolvedMode);
  // A CBZ or library can force a different effective mode. That is not a user change to the
  // checkbox shown here, so only offer an individual reset when the saved mode is visible.
  const canRestoreStep = input !== 'cbz' && resolvedMode === mode;
  // A step is off-limits when turning it off would leave nothing to run, or would ask this kind of
  // input for a process it cannot have. The reason stays visible instead of hiding the control.
  const reasonFor = (toggled: Steps): string | undefined =>
    !toggled.group && !toggled.convert
      ? 'Keep at least one step on.'
      : blockedModeReason(input, modeFromSteps(toggled));
  const groupReason = reasonFor({ group: !steps.group, convert: steps.convert });
  const convertReason = reasonFor({ group: steps.group, convert: !steps.convert });

  return (
    <fieldset className="m-0 min-w-0 space-y-3 border-0 p-0" disabled={disabled}>
      <legend className="text-muted-foreground mb-2 text-xs font-medium">Steps</legend>
      <Step
        changed={canRestoreStep && !steps.group}
        checked={steps.group}
        id="step-group"
        label="Group chapters into volumes"
        onChange={() => {
          onMode(modeFromSteps({ group: !steps.group, convert: steps.convert }));
        }}
        onReset={() => {
          onMode(defaultProcessMode);
        }}
        reason={groupReason}
        tool="mangabind"
      />
      <Step
        changed={canRestoreStep && !steps.convert}
        checked={steps.convert}
        id="step-convert"
        label="Convert for e-reader"
        onChange={() => {
          onMode(modeFromSteps({ group: steps.group, convert: !steps.convert }));
        }}
        onReset={() => {
          onMode(defaultProcessMode);
        }}
        reason={convertReason}
        tool="mangapress"
      />
    </fieldset>
  );
}

function Step({
  changed,
  checked,
  id,
  label,
  onChange,
  onReset,
  reason,
  tool,
}: {
  readonly changed: boolean;
  readonly checked: boolean;
  readonly id: string;
  readonly label: string;
  readonly onChange: () => void;
  readonly onReset: () => void;
  readonly reason: string | undefined;
  readonly tool: string;
}): React.JSX.Element {
  return (
    <div className="flex items-start gap-3">
      <Checkbox
        aria-describedby={reason === undefined ? `${id}-tool` : `${id}-tool ${id}-reason`}
        checked={checked}
        className="mt-0.5"
        disabled={reason !== undefined}
        id={id}
        onCheckedChange={onChange}
      />
      <div className="min-w-0 flex-1 space-y-0.5">
        <SettingFieldHeader
          changed={changed}
          disabled={reason !== undefined}
          id={id}
          label={label}
          onReset={onReset}
        />
        <p className="text-subtle-foreground text-xs" id={`${id}-tool`}>
          {tool}
        </p>
        {reason !== undefined && (
          <p className="text-muted-foreground text-xs" id={`${id}-reason`}>
            {reason}
          </p>
        )}
      </div>
    </div>
  );
}
