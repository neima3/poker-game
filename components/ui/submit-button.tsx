'use client';

import { useFormStatus } from 'react-dom';
import { Button } from './button';
import type { ComponentProps } from 'react';

interface SubmitButtonProps extends ComponentProps<typeof Button> {
  pendingText?: string;
}

export function SubmitButton({ children, pendingText = 'Loading...', ...props }: SubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button {...props} type="submit" disabled={pending || props.disabled} aria-disabled={pending}>
      {pending ? pendingText : children}
    </Button>
  );
}
