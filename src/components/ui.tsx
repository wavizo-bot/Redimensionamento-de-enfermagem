import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon, type IconName } from './Icons';

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('modal-open');
    ref.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('modal-open');
    };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle ? <p className="modal-sub">{subtitle}</p> : null}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar">
            <Icon name="x" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Help({ children, label = 'Ajuda' }: { children: ReactNode; label?: string }) {
  return (
    <span className="help" tabIndex={0} aria-label={label}>
      <Icon name="help" size={15} />
      <span className="help-bubble" role="tooltip">
        {children}
      </span>
    </span>
  );
}

export function NumberField({
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  suffix,
  className = '',
  ariaLabel,
  placeholder,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  className?: string;
  ariaLabel?: string;
  placeholder?: string;
}) {
  const [text, setText] = useState(() => formatEditable(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(formatEditable(value));
  }, [value]);

  const commit = (raw: string) => {
    const parsed = parseNumber(raw);
    let next = parsed === null ? min : parsed;
    if (min !== undefined) next = Math.max(min, next);
    if (max !== undefined) next = Math.min(max, next);
    onChange(next);
    setText(formatEditable(next));
  };

  return (
    <span className={`number-field ${className}`}>
      <input
        type="text"
        inputMode="decimal"
        value={text}
        aria-label={ariaLabel}
        placeholder={placeholder}
        step={step}
        onFocus={() => {
          focused.current = true;
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => {
          focused.current = false;
          commit(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit((e.target as HTMLInputElement).value);
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      {suffix ? <span className="number-suffix">{suffix}</span> : null}
    </span>
  );
}

export function formatEditable(v: number): string {
  if (!Number.isFinite(v)) return '0';
  return Number.isInteger(v) ? String(v) : String(v).replace('.', ',');
}

export function parseNumber(raw: string): number | null {
  const clean = raw
    .replace(/\s/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.')
    .replace(/[^0-9.\-]/g, '');
  if (!clean || clean === '-' || clean === '.') return null;
  const x = Number(clean);
  return Number.isFinite(x) ? x : null;
}

export function StatusPill({
  tone,
  children,
  icon,
}: {
  tone: 'ok' | 'warn' | 'danger' | 'info' | 'neutral';
  children: ReactNode;
  icon?: IconName;
}) {
  return (
    <span className={`pill pill-${tone}`}>
      {icon ? <Icon name={icon} size={14} /> : null}
      {children}
    </span>
  );
}

export function EmptyState({
  icon = 'file',
  title,
  children,
  action,
}: {
  icon?: IconName;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon name={icon} size={28} />
      </div>
      <h3>{title}</h3>
      {children ? <p>{children}</p> : null}
      {action}
    </div>
  );
}

export function Field({
  label,
  help,
  children,
  hint,
  htmlFor,
}: {
  label: string;
  help?: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
  htmlFor?: string;
}) {
  return (
    <label className="field" htmlFor={htmlFor}>
      <span className="field-label">
        {label}
        {help ? <Help>{help}</Help> : null}
      </span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}
