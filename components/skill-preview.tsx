'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { ArrowUpRight, ChevronDown, FileText } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { CopyButton } from '@/components/copy-button';
import {
  formatTokens,
  skillAnchor,
  skillExcerpt,
  skillHeadingPrefix,
  type Skill,
} from '@/lib/catalog';

export type SkillPreviews = {
  preview: ReactNode;
  full: ReactNode;
  prerequisites: ReactNode;
};

export function SkillPreview({
  skill,
  skillCount,
  fileName,
  previews,
  linkedHash,
  linkRevision,
}: {
  skill: Skill;
  skillCount: number;
  fileName: string;
  previews: SkillPreviews;
  linkedHash: string;
  linkRevision: number;
}) {
  const [view, setView] = useState('preview');
  const [expanded, setExpanded] = useState(false);
  const multiple = skillCount > 1;
  const anchor = skillAnchor(skill.name);
  const headingPrefix = skillHeadingPrefix(skill.name, skillCount);
  useEffect(() => {
    if (linkedHash.startsWith(headingPrefix)) {
      setExpanded(true);
      setView('preview');
    }
  }, [headingPrefix, linkedHash, linkRevision]);
  const excerpt = skillExcerpt(view === 'raw' ? skill.raw : skill.markdown);
  return (
    <section id={anchor} className="skill-entry" aria-label={skill.name}>
      {multiple && (
        <div className="skill-entry-heading">
          <h2>{skill.name}</h2>
          <span>About {formatTokens(skill.tokenEstimate.full)} tokens</span>
          <p>{skill.description}</p>
        </div>
      )}
      <div className="skill-file-bar">
        <span>
          <FileText size={15} />
          {fileName}
        </span>
        <div className="skill-bar-actions">
          <a
            href={multiple ? `#${anchor}` : '#skill'}
            className="section-permalink"
          >
            Permalink
          </a>
          <Tabs value={view} onValueChange={(value) => setView(String(value))}>
            <TabsList className="view-switch">
              <TabsTrigger value="preview">Preview</TabsTrigger>
              <TabsTrigger value="raw">Raw</TabsTrigger>
            </TabsList>
          </Tabs>
          <CopyButton text={skill.raw} label="Copy Skill" />
          <a
            className="skill-source-link"
            aria-label="View Skill on GitHub"
            title="View Skill on GitHub"
            href={skill.sourceUrl}
          >
            <ArrowUpRight size={17} />
          </a>
        </div>
      </div>
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        {!expanded && (
          <div id={multiple ? `${anchor}-excerpt` : 'skill-excerpt'}>
            {view === 'preview' ? (
              previews.preview
            ) : (
              <pre className="raw-skill">{excerpt.text}</pre>
            )}
          </div>
        )}
        <CollapsibleContent id={multiple ? `${anchor}-full` : 'skill-full'}>
          {view === 'preview' ? (
            previews.full
          ) : (
            <pre className="raw-skill">{skill.raw}</pre>
          )}
        </CollapsibleContent>
        {excerpt.truncated && (
          <div className="skill-preview-footer">
            <span>
              {expanded
                ? `All ${excerpt.lineCount} lines`
                : `50 of ${excerpt.lineCount} lines`}
            </span>
            <CollapsibleTrigger
              className="skill-expand-button"
              onClick={() => {
                if (expanded)
                  document
                    .getElementById(anchor)
                    ?.scrollIntoView({ block: 'start' });
              }}
            >
              {expanded ? 'Show less' : `Show all ${excerpt.lineCount} lines`}{' '}
              <ChevronDown size={15} />
            </CollapsibleTrigger>
          </div>
        )}
      </Collapsible>
    </section>
  );
}
