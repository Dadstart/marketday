import { createElement, type CSSProperties } from 'react';

import { colors } from '../theme';

export function DateTimeInput({
  label,
  mode,
  value,
  onChange,
}: {
  label: string;
  mode: 'date' | 'time';
  value: string;
  onChange: (value: string) => void;
}) {
  return createElement(
    'label',
    { style: fieldStyle },
    createElement('span', { style: labelStyle }, label),
    createElement('input', {
      type: mode,
      value,
      'aria-label': label,
      onChange: (event: { currentTarget: { value: string } }) => {
        const next = event.currentTarget.value;
        onChange(mode === 'time' ? next.slice(0, 5) : next);
      },
      style: inputStyle,
    }),
  );
}

const fieldStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const labelStyle: CSSProperties = {
  color: colors.ink,
  fontSize: 14,
  fontWeight: 600,
};

const inputStyle: CSSProperties = {
  backgroundColor: colors.card,
  border: `1px solid ${colors.line}`,
  borderRadius: 12,
  padding: '10px 12px',
  fontSize: 16,
  color: colors.ink,
  fontFamily: 'inherit',
  colorScheme: 'light',
};
