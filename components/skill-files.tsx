'use client';

import { FileText, Folder, ChevronRight, ArrowUpRight } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  skillFileTree,
  type SkillFile,
  type SkillDirectory,
} from '@/lib/catalog';

function FileEntries({ entries }: { entries: SkillDirectory[] }) {
  return (
    <ul>
      {entries.map((entry) => (
        <li key={entry.path}>
          {entry.file ? (
            <a
              href={entry.file.sourceUrl}
              title={entry.path}
              className="skill-file-link"
            >
              <FileText size={15} />
              <span>{entry.name}</span>
              <ArrowUpRight size={13} />
            </a>
          ) : (
            <Collapsible>
              <CollapsibleTrigger className="skill-directory-trigger">
                <ChevronRight size={14} className="folder-chevron" />
                <Folder size={15} />
                <span>{entry.name}</span>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <FileEntries entries={entry.children} />
              </CollapsibleContent>
            </Collapsible>
          )}
        </li>
      ))}
    </ul>
  );
}

export function SkillFiles({
  files,
  directoryUrl,
}: {
  files: SkillFile[];
  directoryUrl: string;
}) {
  return (
    <section id="files" className="skill-files">
      <div className="section-link-heading">
        <h2>
          Skill files <span>{files.length}</span>
        </h2>
        <a href={directoryUrl}>
          Browse on GitHub <ArrowUpRight size={14} />
        </a>
      </div>
      <p>
        Expand folders to explore bundled references, scripts, and assets. Files
        open at this page’s source snapshot.
      </p>
      <nav aria-label="Skill file directory">
        <FileEntries entries={skillFileTree(files)} />
      </nav>
    </section>
  );
}
