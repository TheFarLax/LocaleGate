import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canPublish, parseLocales, receiptOutcome } from '../src/protocol.js';

test('locale tags normalize and accept one to four distinct targets', () => {
  assert.deepEqual(parseLocales(' EN ', 'ES, pt-BR'), { source: 'en', targets: ['es', 'pt-br'] });
  assert.throws(() => parseLocales('EN', 'es,en'), /different/);
  assert.throws(() => parseLocales('en', 'es,ES'), /distinct/);
  assert.throws(() => parseLocales('en', 'pt_BR'), /language tags/);
  assert.throws(() => parseLocales('en', 'es,fr,de,it,id'), /1 to 4/);
});

test('all current targets must match while the release is still a draft', () => {
  assert.equal(canPublish({ status: 'DRAFT', targets: {} }), false);
  assert.equal(canPublish({ status: 'DRAFT', targets: { es: { verdict: 'MATCH' }, fr: { verdict: 'INCONCLUSIVE' } } }), false);
  assert.equal(canPublish({ status: 'DRAFT', targets: { es: { verdict: 'MATCH' } } }), true);
  assert.equal(canPublish({ status: 'PUBLISHED', targets: { es: { verdict: 'MATCH' } } }), false);
});

test('receipt states distinguish pending, consensus failure and successful writes', () => {
  assert.deepEqual(receiptOutcome({ status_name: 'ACCEPTED' }), { state: 'Pending' });
  assert.equal(receiptOutcome({ status_name: 'FINALIZED', result_name: 'DISAGREE' }).state, 'Failed');
  const successful = {
    statusName: 'FINALIZED',
    result_name: 'MAJORITY_AGREE',
    consensus_data: { leader_receipt: [{ execution_result: 'SUCCESS', result: { status: 'return', payload: { raw: [1] } } }] },
  };
  assert.deepEqual(receiptOutcome(successful), { state: 'Finalized', raw: [1] });
  assert.equal(receiptOutcome({ ...successful, consensus_data: {} }).state, 'Failed');
  successful.consensus_data.leader_receipt.push({ genvm_result: { error_code: 'CONSENSUS_VALIDATOR_QUORUM_REACHED' } });
  assert.equal(receiptOutcome(successful).state, 'Finalized');
});
