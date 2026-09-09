'use client';

import { ChevronDown } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  formatTokens,
  type PluginSummary,
  type TokenizerInfo,
} from '@/lib/catalog';

export function TokenEstimate({
  estimate,
  tokenizer,
}: {
  estimate: PluginSummary['tokenEstimate'];
  tokenizer: TokenizerInfo;
}) {
  return (
    <section
      id="tokens"
      className="token-estimate"
      aria-label="Token estimates"
    >
      <Collapsible>
        <div className="token-estimate-row">
          <h2>Token estimates</h2>
          <dl className="token-estimate-values">
            <div data-token-kind="skill">
              <dt>Skill instructions</dt>
              <dd>About {formatTokens(estimate.skillFull)} tokens</dd>
            </div>
            <div data-token-kind="tools">
              <dt>Tool definitions</dt>
              <dd>About {formatTokens(estimate.toolsTotal)} tokens</dd>
            </div>
          </dl>
          <CollapsibleTrigger
            className="token-method-trigger"
            aria-label={`Token counting details (${tokenizer.label})`}
          >
            How it’s counted <ChevronDown size={14} />
          </CollapsibleTrigger>
        </div>
        <p className="token-estimate-note">
          Estimated text size—not usage or cost.
        </p>
        <CollapsibleContent className="token-method-content">
          <p>
            Counted with <a href={tokenizer.sourceUrl}>{tokenizer.modelId}</a>{' '}
            at <code>{tokenizer.revision.slice(0, 7)}</code>, without added
            special tokens.
          </p>
          <ul>
            <li>
              <strong>Skill:</strong> complete SKILL.md, including front matter.
            </li>
            <li>
              <strong>Tools:</strong> summed JSON from “Copy definition” (name,
              description, inputSchema).
            </li>
            <li>
              <strong>Discovery metadata:</strong> ≈{' '}
              {formatTokens(estimate.skillMetadata)} tokens for the Skill’s name
              and description; counted separately.
            </li>
          </ul>
          <p>
            Excludes bundled files, cookbooks, client wrappers, history, tool
            results, and media. Content estimates are not always-loaded context
            or billed usage.
          </p>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
