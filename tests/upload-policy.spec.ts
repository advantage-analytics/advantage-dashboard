import { expect, test } from '@playwright/test';

import {
  canUploadForProgram,
  explainVideoRefusal,
  type ProgramRole,
  type UploadPolicy,
  type Workspace,
} from '@/lib/workspace/types';

/**
 * `canUploadForProgram` against every rung of `upload_policy` and every
 * standing. Pure, so it is a table: the upload page's gate and the quota's
 * refusal read this one function, and a wrong cell here is a coach bounced
 * off their own budget or a player admitted to a page that will refuse them.
 */
function workspace(
  role: ProgramRole,
  uploadPolicy: UploadPolicy,
  memberUploadEnabled = true
): Workspace {
  return {
    id: 'p',
    kind: 'team',
    name: 'Westfield University',
    team: 'mens',
    orgType: 'college',
    timeZone: 'UTC',
    role,
    mark: 'W',
    canSubmitVideo: true,
    playersCanUpload: uploadPolicy === 'everyone',
    uploadPolicy,
    memberUploadEnabled,
  };
}

const TABLE: Record<UploadPolicy, Record<ProgramRole, boolean>> = {
  owner: { owner: true, coach: false, staff: false, player: false },
  owner_coaches: { owner: true, coach: true, staff: false, player: false },
  staff: { owner: true, coach: true, staff: true, player: false },
  everyone: { owner: true, coach: true, staff: true, player: true },
};

test.describe('canUploadForProgram', () => {
  for (const [policy, byRole] of Object.entries(TABLE) as [UploadPolicy, Record<ProgramRole, boolean>][]) {
    for (const [role, allowed] of Object.entries(byRole) as [ProgramRole, boolean][]) {
      test(`${policy}: ${role} ${allowed ? 'may' : 'may not'} upload`, () => {
        expect(canUploadForProgram(workspace(role, policy))).toBe(allowed);
      });
    }
  }

  test("a player's own row still narrows them under everyone, and nobody else", () => {
    expect(canUploadForProgram(workspace('player', 'everyone', false))).toBe(false);
    expect(canUploadForProgram(workspace('coach', 'everyone', false))).toBe(true);
    expect(canUploadForProgram(workspace('owner', 'owner', false))).toBe(true);
  });

  test('a personal workspace never answers yes', () => {
    expect(canUploadForProgram({ ...workspace('owner', 'everyone'), kind: 'personal' })).toBe(false);
  });
});

test.describe('explainVideoRefusal', () => {
  test('says nothing to someone who may upload', () => {
    expect(explainVideoRefusal(workspace('coach', 'owner_coaches'))).toBeNull();
  });

  test('tells staff the policy and who can widen it', () => {
    expect(explainVideoRefusal(workspace('staff', 'owner_coaches'))).toMatch(/owner and coaches/);
    expect(explainVideoRefusal(workspace('coach', 'owner'))).toMatch(/The owner can widen it/);
  });

  test('tells a player which of the two flags stopped them', () => {
    expect(explainVideoRefusal(workspace('player', 'staff'))).toMatch(/all staff/);
    expect(explainVideoRefusal(workspace('player', 'everyone', false))).toMatch(/Can send video/);
  });
});
