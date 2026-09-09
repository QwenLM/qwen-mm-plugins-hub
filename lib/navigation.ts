export type PluginSection =
  | 'overview'
  | 'skill'
  | 'tools'
  | 'install'
  | 'files'
  | 'tokens';
export type PluginTab = 'skill' | 'tools' | 'install';

export function sectionFromHash(hash: string): PluginSection {
  const section = hash.replace(/^#/, '');
  if (section.startsWith('skill-section-')) return 'skill';
  if (section.startsWith('tool-')) return 'tools';
  return ['skill', 'tools', 'install', 'files', 'tokens'].includes(section)
    ? (section as PluginSection)
    : 'overview';
}

export function tabForSection(
  section: PluginSection,
  current: PluginTab,
): PluginTab {
  if (section === 'tokens') return current;
  return section === 'tools' || section === 'install' ? section : 'skill';
}
