import {
  blockedModeReason,
  type ModeInput,
  modeFromSteps,
  type ProcessMode,
  type ProcessSteps as Steps,
  resolveMode,
  stepsFromMode,
} from '@/domain/process-mode';
import { Checkbox } from '@/renderer/components/ui/checkbox';
import { Label } from '@/renderer/components/ui/label';

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
  const steps = stepsFromMode(resolveMode(input, mode));
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
        checked={steps.group}
        id="step-group"
        label="Group chapters into volumes"
        onChange={() => {
          onMode(modeFromSteps({ group: !steps.group, convert: steps.convert }));
        }}
        reason={groupReason}
        tool="mangabind"
      />
      <Step
        checked={steps.convert}
        id="step-convert"
        label="Convert for e-reader"
        onChange={() => {
          onMode(modeFromSteps({ group: steps.group, convert: !steps.convert }));
        }}
        reason={convertReason}
        tool="mangapress"
      />
    </fieldset>
  );
}

function Step({
  checked,
  id,
  label,
  onChange,
  reason,
  tool,
}: {
  readonly checked: boolean;
  readonly id: string;
  readonly label: string;
  readonly onChange: () => void;
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
      <div className="min-w-0 space-y-0.5">
        <Label htmlFor={id}>{label}</Label>
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
