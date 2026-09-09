'use client';

import { useRef, type ReactNode } from 'react';
import { CopyButton } from '@/components/copy-button';

export function CodeBlock({ children }: { children: ReactNode }) {
  const code = useRef<HTMLPreElement>(null);
  return (
    <div className="code-block">
      <div className="code-block-actions">
        <CopyButton
          getText={() => code.current?.textContent || ''}
          label="Copy code"
        />
      </div>
      <pre ref={code}>
        {children}
      </pre>
    </div>
  );
}
