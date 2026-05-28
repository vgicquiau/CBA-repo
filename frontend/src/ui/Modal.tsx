import React from 'react';

interface Props {
  open: boolean;
  title: string;
  body: string;
  warning?: string | null;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ open, title, body, warning, confirmLabel, cancelLabel, danger, onConfirm, onCancel }: Props) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="serif" style={{ fontSize: 22, lineHeight: 1.2, marginBottom: 10 }}>{title}</div>
        <div style={{ fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.5 }}>{body}</div>
        {warning && <div className="modal-warning">{warning}</div>}
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onCancel} style={{ flex: '0 0 auto' }}>{cancelLabel}</button>
          <button
            className={danger ? 'btn btn-clay' : 'btn btn-primary'}
            onClick={onConfirm}
            style={{ flex: 1 }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
