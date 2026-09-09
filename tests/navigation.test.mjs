import test from 'node:test';
import assert from 'node:assert/strict';
import { sectionFromHash, tabForSection } from '../lib/navigation.ts';

test('overview and browser-back restore the Skill panel from any tab', () => {
  for (const current of ['skill', 'tools', 'install']) {
    assert.equal(sectionFromHash(''), 'overview');
    assert.equal(tabForSection(sectionFromHash(''), current), 'skill');
  }
});

test('sidebar links, tabs and tool deep links resolve to the same section', () => {
  for (const [hash, section, tab] of [
    ['#skill', 'skill', 'skill'],
    ['#skill-section-requirements', 'skill', 'skill'],
    ['#files', 'files', 'skill'],
    ['#tools', 'tools', 'tools'],
    ['#tool_read_image', 'overview', 'skill'],
    ['#tool-read_image', 'tools', 'tools'],
    ['#install', 'install', 'install'],
  ]) {
    assert.equal(sectionFromHash(hash), section);
    assert.equal(tabForSection(section, 'install'), tab);
  }
});

test('token estimates do not switch the open document panel', () => {
  assert.equal(sectionFromHash('#tokens'), 'tokens');
  for (const current of ['skill', 'tools', 'install'])
    assert.equal(tabForSection('tokens', current), current);
});
