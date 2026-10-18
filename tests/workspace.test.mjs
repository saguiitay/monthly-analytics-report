import assert from 'node:assert/strict';
import test from 'node:test';
import { createDemo } from '../app/lib/demo.ts';
import {
  WORKSPACE_KEY, delta, exportData, percent, readWorkspace, reportMarkdown,
  saveWorkspace, validateProject, validateProjectBatch,
} from '../app/lib/workspace.ts';

const project = { id: 'site-one', name: 'Example', url: 'https://example.com', propertyId: '123456789' };

test('workspace persists only allowlisted project settings, never credential-like extra fields', () => {
  let stored;
  saveWorkspace({ setItem(key, value) { assert.equal(key, WORKSPACE_KEY); stored = value; } }, [
    { ...project, private_key: 'DO_NOT_SAVE', credentials: { token: 'DO_NOT_SAVE' } },
  ]);
  assert.equal(stored.includes('DO_NOT_SAVE'), false);
  assert.deepEqual(readWorkspace({ getItem: () => stored }), [project]);
  assert.deepEqual(readWorkspace({ getItem: () => null }), []);
});

test('workspace rejects corrupt, unsupported and duplicate saved projects', () => {
  for (const raw of ['invalid', '{}', JSON.stringify({ version: 2, projects: [] }),
    JSON.stringify({ version: 1, projects: [project, project] }),
    JSON.stringify({ version: 1, projects: [{ ...project, url: 'javascript:alert(1)' }] })]) {
    assert.throws(() => readWorkspace({ getItem: () => raw }));
  }
  assert.throws(() => readWorkspace({ getItem() { throw new Error('Storage denied'); } }));
  assert.throws(() => saveWorkspace({ setItem() { throw new Error('Quota exceeded'); } }, [project]));
});

test('project validation rejects non-reporting IDs and unsafe site links', () => {
  assert.equal(validateProject(project), null);
  for (const invalid of [
    { propertyId: 'G-ABCDEF' }, { propertyId: '0' }, { propertyId: '1'.repeat(21) },
    { name: 'Bad\nname' }, { url: 'https://user:password@example.com' },
    { url: 'https://example.com\\evil' }, { url: 'javascript:alert(1)' },
  ]) {
    assert.ok(validateProject({ ...project, ...invalid }), JSON.stringify(invalid));
  }
});

test('batch addition accepts optional URLs and enforces the exact twelve-project workspace limit', () => {
  const drafts = Array.from({ length: 12 }, (_, index) => ({
    ...project, id: `batch-${index}`, name: `Site ${index + 1}`, propertyId: `${index + 1}`,
  }));
  assert.equal(validateProjectBatch([], drafts), null);
  assert.equal(validateProjectBatch([project], drafts.slice(0, 11)), null);
  assert.match(validateProjectBatch([project], drafts), /12 projects/);
  assert.match(validateProjectBatch([], []), /at least one/);
  assert.equal(validateProjectBatch([], [{ ...drafts[0], url: '' }]), null);
  assert.match(validateProjectBatch([], [{ ...drafts[0], url: 'javascript:alert(1)' }]), /Site 1:.*URL/);
  assert.match(validateProjectBatch([], [{ ...drafts[0], name: '' }]), /Project:.*name/);
});

test('batch addition rejects existing and repeated property IDs or project identifiers', () => {
  assert.match(validateProjectBatch([project], [{ ...project, id: 'new-site' }]), /already/);
  assert.match(validateProjectBatch([project], [{ ...project, propertyId: '234567890' }]), /identifiers/);
  assert.match(validateProjectBatch([], [project, { ...project, id: 'new-site' }]), /more than once/);
  assert.match(validateProjectBatch([], [project, { ...project, propertyId: '234567890' }]), /identifiers/);
});

test('properties without a website URL survive a workspace storage round trip', () => {
  let stored;
  const appProject = { ...project, url: '' };
  assert.equal(validateProject(appProject), null);
  saveWorkspace({ setItem(key, value) { assert.equal(key, WORKSPACE_KEY); stored = value; } }, [appProject]);
  assert.deepEqual(readWorkspace({ getItem: () => stored }), [appProject]);
  for (const url of [undefined, null, 1, {}, '   ']) {
    assert.throws(() => readWorkspace({ getItem: () => JSON.stringify({
      version: 1, projects: [{ ...project, url }],
    }) }));
  }
});

test('demo is deterministic, complete and explicitly labeled in credential-free exports', () => {
  const response = createDemo(30, '2026-10-17');
  assert.deepEqual(response, createDemo(30, '2026-10-17'));
  assert.equal(response.reports.length, 2);
  for (const report of response.reports) {
    assert.equal(report.daily.length, 30);
    assert.equal(report.daily[0].date, '2026-09-18');
    assert.equal(report.daily[29].date, '2026-10-17');
    assert.ok(report.channels.length > 1);
  }
  const polluted = { ...response, credentials: { private_key: 'DO_NOT_EXPORT' } };
  const exported = JSON.stringify(exportData(polluted, true));
  assert.equal(exported.includes('DO_NOT_EXPORT'), false);
  assert.match(exported, /synthetic demo/i);
  assert.match(reportMarkdown(polluted, true), /DEMO: deterministic synthetic data/);
  assert.doesNotMatch(reportMarkdown(polluted, true), /DO_NOT_EXPORT/);
  assert.equal(percent(0.728), '72.8%');
  assert.equal(delta(null), 'New');
});

test('Markdown escapes provider content rather than emitting executable links or HTML', () => {
  const response = createDemo(7, '2026-10-17');
  response.reports[0].project.name = '<script>alert(1)</script>';
  response.reports[0].topPages[0].title = '[click](javascript:alert(1)) | injected';
  const markdown = reportMarkdown(response, false);
  assert.doesNotMatch(markdown, /<script>/);
  assert.doesNotMatch(markdown, /\[click\]\(javascript:/);
  assert.match(markdown, /\\\| injected/);
});
