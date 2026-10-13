import type { ReactNode } from 'react';

interface Props {
  checked: boolean;
  onChange: (v: boolean) => void;
  children?: ReactNode;
  disabled?: boolean;
  id?: string;
}

export function Checkbox({ checked, onChange, children, disabled, id }: Props) {
  return (
    <label className={`flex items-center gap-2 text-[13px] ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
      <input id={id} type="checkbox" className="h-4 w-4 accent-[#2f5bea]" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}
