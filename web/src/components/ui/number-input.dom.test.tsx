// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NumberInput } from './number-input';

afterEach(cleanup);

function Harness({
  initial,
  onValue,
}: {
  initial: number | null;
  onValue: (v: number | null) => void;
}) {
  const [value, setValue] = useState<number | null>(initial);
  return (
    <NumberInput
      label="Peso"
      value={value}
      onChange={(next) => {
        setValue(next);
        onValue(next);
      }}
    />
  );
}

const input = () => screen.getByLabelText('Peso') as HTMLInputElement;
const type = (text: string) => {
  fireEvent.focus(input());
  fireEvent.change(input(), { target: { value: text } });
};

describe('NumberInput', () => {
  it('REGRESIÓN: no modifica en silencio lo que escribió la persona al salir del campo', () => {
    // Antes recortaba al límite: escribir 10 kg terminaba guardando 25 kg sin avisar.
    const onValue = vi.fn();
    render(<Harness initial={80} onValue={onValue} />);
    type('10');
    fireEvent.blur(input());
    expect(onValue).toHaveBeenLastCalledWith(10);
    expect(onValue).not.toHaveBeenCalledWith(25);
    expect(input().value).toBe('10');
  });

  it('acepta coma decimal y da formato al salir', () => {
    const onValue = vi.fn();
    render(<Harness initial={null} onValue={onValue} />);
    type('79,5');
    expect(onValue).toHaveBeenLastCalledWith(79.5);
    fireEvent.blur(input());
    expect(input().value).toBe('79,5');
  });

  it('permite textos a medias mientras se escribe', () => {
    const onValue = vi.fn();
    render(<Harness initial={null} onValue={onValue} />);
    type('1,');
    expect(input().value).toBe('1,');
    expect(onValue).toHaveBeenLastCalledWith(1);
  });

  it('rechaza letras sin emitir cambios', () => {
    const onValue = vi.fn();
    render(<Harness initial={70} onValue={onValue} />);
    type('abc');
    expect(onValue).not.toHaveBeenCalled();
    expect(input().value).toBe('70');
  });

  it('vaciar el campo emite null', () => {
    const onValue = vi.fn();
    render(<Harness initial={70} onValue={onValue} />);
    type('');
    expect(onValue).toHaveBeenLastCalledWith(null);
  });

  it('si el valor cambia desde afuera y no se está escribiendo, el campo lo sigue', () => {
    const { rerender } = render(<NumberInput label="Peso" value={70} onChange={() => undefined} />);
    expect(input().value).toBe('70');
    rerender(<NumberInput label="Peso" value={71.5} onChange={() => undefined} />);
    expect(input().value).toBe('71,5');
  });
});
