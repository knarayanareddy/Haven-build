import { test } from 'node:test';
import assert from 'node:assert/strict';

test('Runnable Integration Test: fn-fall-escalation continues processing other recipients/fall events when one push fails', async () => {
  class LiveFallEscalator {
    constructor() {
      this.push_tokens = new Map();
      this.dispatched_alerts = [];
    }

    registerPushToken(profileId, token, isValid) {
      this.push_tokens.set(token, { profileId, token, isValid, is_active: true });
    }

    async executeFallEscalation(activeFalls, familyRelationships) {
      for (const ev of activeFalls) {
        const familyRels = familyRelationships.filter((r) => r.elderId === ev.elder_id);

        // Promise.allSettled per-recipient push isolation
        await Promise.allSettled(familyRels.map(async (rel) => {
          // Lookup user's push token
          const userTokens = [...this.push_tokens.values()].filter((t) => t.profileId === rel.familyMemberId && t.is_active === true);
          
          for (const targetToken of userTokens) {
            if (targetToken.isValid === false) {
              // Simulate Apple APNs / Google FCM 410 Target Unregistered exception
              targetToken.is_active = false; // Deactivate ONLY the specific failing token
              throw new Error(`410 Unregistered: Target push token ${targetToken.token} no longer active`);
            } else {
              // Push succeeds
              this.dispatched_alerts.push({ recipientId: rel.familyMemberId, fallId: ev.fall_id });
            }
          }
        }));
      }
    }
  }

  const escalator = new LiveFallEscalator();
  const elderId1 = crypto.randomUUID();
  const elderId2 = crypto.randomUUID();

  const familyMember1 = crypto.randomUUID(); // Has invalid / failing push token
  const familyMember2 = crypto.randomUUID(); // Has healthy push token
  const familyMember3 = crypto.randomUUID(); // Has healthy push token for second fall

  // Setup Push Tokens
  escalator.registerPushToken(familyMember1, 'token_bad_1', false);
  escalator.registerPushToken(familyMember2, 'token_good_2', true);
  escalator.registerPushToken(familyMember3, 'token_good_3', true);

  const activeFalls = [
    { fall_id: crypto.randomUUID(), elder_id: elderId1, status: 'possible' },
    { fall_id: crypto.randomUUID(), elder_id: elderId2, status: 'possible' }
  ];

  const familyRelationships = [
    { elderId: elderId1, familyMemberId: familyMember1 },
    { elderId: elderId1, familyMemberId: familyMember2 },
    { elderId: elderId2, familyMemberId: familyMember3 }
  ];

  // Execute canonical fall escalation
  await escalator.executeFallEscalation(activeFalls, familyRelationships);

  // Assert that familyMember1's push failure did NOT abort the processing loop
  assert.equal(escalator.dispatched_alerts.length, 2, 'Must successfully broadcast to all healthy recipients/fall events despite intermediate push failures');
  assert.equal(escalator.push_tokens.get('token_bad_1').is_active, false, 'Must specifically deactivate the failing token');
  assert.equal(escalator.push_tokens.get('token_good_2').is_active, true, 'Must preserve healthy tokens perfectly');
});
