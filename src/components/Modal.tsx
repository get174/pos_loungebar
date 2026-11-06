import { X } from 'lucide-react';
import { ReactNode, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  isOpen: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  size?: 'sm' | 'md' | 'lg';
}

export function Modal({ isOpen, title, children, onClose, size = 'md' }: ModalProps) {
  const titleId=useId();
  const content=useRef<HTMLDivElement>(null);
  const close=useRef(onClose);
  close.current=onClose;
  useEffect(()=>{
    if(!isOpen)return;
    const previous=document.activeElement as HTMLElement | null;
    const focusable=()=>Array.from(content.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]') || []);
    focusable()[0]?.focus();
    const keydown=(event: KeyboardEvent)=>{
      const dialogs=document.querySelectorAll('[aria-modal="true"]');
      if(dialogs[dialogs.length-1]!==content.current)return;
      if(event.key==='Escape'){event.preventDefault();close.current();}
      if(event.key==='Tab'){
        const elements=focusable();const first=elements[0],last=elements[elements.length-1];
        if(event.shiftKey && document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus();}
      }
    };
    document.addEventListener('keydown',keydown);
    return ()=>{document.removeEventListener('keydown',keydown);previous?.focus();};
  },[isOpen]);
  if (!isOpen) return null;

  const sizeClass = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-2xl',
  }[size];

  return createPortal(
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        ref={content} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className={`bg-slate-800 rounded-2xl shadow-2xl border border-slate-700 w-full max-h-[90vh] overflow-y-auto ${sizeClass}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <h2 id={titleId} className="text-xl font-bold text-white">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="p-2 hover:bg-slate-700 rounded-lg transition"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>, document.body
  );
}
