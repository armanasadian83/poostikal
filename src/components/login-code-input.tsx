'use client';

import {
  forwardRef,
  useImperativeHandle,
  useRef,
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
} from 'react';

export interface LoginCodeInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: boolean;
  describedBy?: string;
}

export interface LoginCodeInputHandle {
  focus: () => void;
}

const CELL_COUNT = 6;
const CELL_LABELS = ['اول', 'دوم', 'سوم', 'چهارم', 'پنجم', 'ششم'];

function normalizeDigits(value: string): string {
  return value
    .replace(/[۰-۹٠-٩]/g, (digit) =>
      String(digit.charCodeAt(0) - (digit >= '۰' ? 0x06f0 : 0x0660)),
    )
    .replace(/[^0-9]/g, '');
}

export const LoginCodeInput = forwardRef<LoginCodeInputHandle, LoginCodeInputProps>(
  function LoginCodeInput({ value, onChange, disabled = false, error = false, describedBy }, ref) {
    const inputs = useRef<(HTMLInputElement | null)[]>([]);
    const code = normalizeDigits(value).slice(0, CELL_COUNT);

    useImperativeHandle(ref, () => ({
      focus() {
        const first = inputs.current[0];
        first?.focus();
        first?.select();
      },
    }), []);

    function focusCell(index: number) {
      const input = inputs.current[Math.max(0, Math.min(CELL_COUNT - 1, index))];
      input?.focus();
      input?.select();
    }

    function insertDigits(index: number, text: string) {
      const digits = normalizeDigits(text).slice(0, CELL_COUNT);
      if (!digits || disabled) return;

      if (digits.length === CELL_COUNT) {
        onChange(digits);
        focusCell(CELL_COUNT - 1);
        return;
      }

      const start = Math.min(index, code.length);
      const next = `${code.slice(0, start)}${digits}${code.slice(start + digits.length)}`
        .slice(0, CELL_COUNT);
      onChange(next);
      focusCell(Math.min(start + digits.length, CELL_COUNT - 1));
    }

    function changeCell(index: number, event: ChangeEvent<HTMLInputElement>) {
      const raw = event.currentTarget.value;
      if (raw === '') {
        onChange(`${code.slice(0, index)}${code.slice(index + 1)}`);
        return;
      }
      insertDigits(index, raw);
    }

    function pasteDigits(index: number, event: ClipboardEvent<HTMLInputElement>) {
      event.preventDefault();
      insertDigits(index, event.clipboardData.getData('text'));
    }

    function keyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
      if (disabled || event.altKey || event.ctrlKey || event.metaKey) return;

      if (event.key === 'Backspace') {
        event.preventDefault();
        const target = code[index] ? index : Math.min(index - 1, code.length - 1);
        if (target >= 0) onChange(`${code.slice(0, target)}${code.slice(target + 1)}`);
        focusCell(Math.max(0, target - (code[index] ? 1 : 0)));
      } else if (event.key === 'Delete') {
        event.preventDefault();
        onChange(`${code.slice(0, index)}${code.slice(index + 1)}`);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        focusCell(index - 1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        focusCell(index + 1);
      } else if (event.key === 'Home') {
        event.preventDefault();
        focusCell(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        focusCell(CELL_COUNT - 1);
      } else if (event.key.length === 1 && normalizeDigits(event.key)) {
        event.currentTarget.select();
      }
    }

    return (
      <div
        className={`login-code-input${error ? ' has-error' : ''}`}
        dir="ltr"
        role="group"
        aria-label="کد تأیید شش‌رقمی"
        aria-disabled={disabled || undefined}
      >
        {CELL_LABELS.map((label, index) => (
          <input
            key={label}
            ref={(input) => { inputs.current[index] = input; }}
            className="login-code-cell"
            type="text"
            inputMode="numeric"
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            maxLength={index === 0 ? CELL_COUNT : 1}
            value={code[index] ?? ''}
            disabled={disabled}
            dir="ltr"
            aria-label={`رقم ${label} کد تأیید`}
            aria-invalid={error || undefined}
            aria-describedby={describedBy}
            enterKeyHint="done"
            autoCapitalize="off"
            spellCheck={false}
            onFocus={(event) => event.currentTarget.select()}
            onClick={(event) => event.currentTarget.select()}
            onChange={(event) => changeCell(index, event)}
            onPaste={(event) => pasteDigits(index, event)}
            onKeyDown={(event) => keyDown(index, event)}
          />
        ))}
      </div>
    );
  },
);
