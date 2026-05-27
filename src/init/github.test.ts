import { describe, expect, test } from 'vitest';
import { parseGithubSpec } from './github.js';

describe('parseGithubSpec', () => {
  test('plain owner/repo', () => {
    expect(parseGithubSpec('sanity-labs/slides-template')).toEqual({
      owner: 'sanity-labs',
      repo: 'slides-template',
    });
  });

  test('owner/repo#branch', () => {
    expect(parseGithubSpec('sanity-labs/slides-template#main')).toEqual({
      owner: 'sanity-labs',
      repo: 'slides-template',
      ref: 'main',
    });
  });

  test('github: prefix', () => {
    expect(parseGithubSpec('github:owner/repo')).toEqual({ owner: 'owner', repo: 'repo' });
    expect(parseGithubSpec('github:owner/repo#branch')).toEqual({
      owner: 'owner',
      repo: 'repo',
      ref: 'branch',
    });
  });

  test('https URL', () => {
    expect(parseGithubSpec('https://github.com/owner/repo')).toEqual({
      owner: 'owner',
      repo: 'repo',
    });
    expect(parseGithubSpec('https://github.com/owner/repo.git')).toEqual({
      owner: 'owner',
      repo: 'repo',
    });
  });

  test('rejects non-GitHub shapes', () => {
    expect(parseGithubSpec('./local/path')).toBeNull();
    expect(parseGithubSpec('/absolute/path')).toBeNull();
    expect(parseGithubSpec('')).toBeNull();
    expect(parseGithubSpec('not-a-repo')).toBeNull();
    expect(parseGithubSpec('too/many/slashes')).toBeNull();
  });

  test('trims whitespace', () => {
    expect(parseGithubSpec('  owner/repo  ')).toEqual({ owner: 'owner', repo: 'repo' });
  });

  test('preserves complex refs like commit SHAs', () => {
    expect(parseGithubSpec('owner/repo#abc123def')).toEqual({
      owner: 'owner',
      repo: 'repo',
      ref: 'abc123def',
    });
    expect(parseGithubSpec('owner/repo#feature/my-branch')).toEqual({
      owner: 'owner',
      repo: 'repo',
      ref: 'feature/my-branch',
    });
  });
});
