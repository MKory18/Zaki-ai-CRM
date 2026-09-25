'use client';

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import clsx from 'clsx';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '4xl';
}

export function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  maxWidth = 'lg',
}: ModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;

  const widthStyles = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '4xl': 'max-w-4xl',
  };

  // Rendered through a portal, into <body>. A modal opened from inside a
  // clickable row used to be a DOM child of that row, so every click inside
  // it bubbled up and opened the row behind it — clicking "السجل" landed you
  // in the order instead of the history.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--sys-sidebar)]/50 backdrop-blur-xs animate-in fade-in duration-200"
      // The portal moves the modal out of the row in the DOM, but a React
      // event still travels up the COMPONENT tree — so a click on a tab
      // inside this modal reached the row's onClick and opened the order
      // behind it. Nothing that happens inside a modal belongs to whatever
      // rendered it.
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="fixed inset-0"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={clsx(
          'relative w-full bg-[var(--sys-card)] rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.1)] overflow-hidden z-10 max-h-[90vh] flex flex-col',
          widthStyles[maxWidth]
        )}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--sys-border)] bg-[var(--sys-surface)]">
          <div>
            <h3 className="text-lg font-semibold text-[var(--sys-heading)]">{title}</h3>
            {subtitle && <p className="text-xs text-[var(--sys-muted-foreground)] mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="إغلاق"
            className="p-1 rounded-lg text-[var(--sys-muted)] hover:text-[var(--sys-heading)] hover:bg-[var(--sys-border)] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>,
    document.body
  );
}
