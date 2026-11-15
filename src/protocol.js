export const CHAIN_ID = '0xf22f';
export const RPC = 'https://studio.genlayer.com/api';
export const EXPLORER = 'https://explorer-studio.genlayer.com';

export const verdictLabel = Object.freeze({
  MATCH: 'Source matched',
  MATERIAL_DRIFT: 'Material drift',
  INCONCLUSIVE: 'Inconclusive',
  UNREVIEWED: 'Awaiting review',
});

export function parseLocales(source, targets) {
  const normalize = text => text.trim().toLowerCase();
  source = normalize(source);
  const list = targets.split(',').map(normalize);
  const valid = /^([a-z]{2,3})(-[a-z]{2})?$/;
  if (!valid.test(source) || list.some(locale => !valid.test(locale))) {
    throw Error('Use language tags like en, es, or pt-br.');
  }
  if (list.length > 4 || new Set(list).size !== list.length) {
    throw Error('Choose 1 to 4 distinct target locales.');
  }
  if (list.includes(source)) throw Error('Choose targets different from the source locale.');
  return { source, targets: list };
}

export function canPublish(release) {
  const targets = Object.values(release?.targets ?? {});
  return release?.status === 'DRAFT' && targets.length > 0 && targets.every(item => item.verdict === 'MATCH');
}

export function receiptOutcome(receipt) {
  if ((receipt?.statusName ?? receipt?.status_name) !== 'FINALIZED') return { state: 'Pending' };
  if (receipt.result_name !== 'MAJORITY_AGREE') {
    return { state: 'Failed', detail: 'Finalized without validator agreement. Review the receipt before retrying.' };
  }
  const rawLeaders = receipt.consensus_data?.leader_receipt;
  const leaders = Array.isArray(rawLeaders) ? rawLeaders : [rawLeaders];
  const leader = leaders.filter(item => item && item.genvm_result?.error_code !== 'CONSENSUS_VALIDATOR_QUORUM_REACHED').at(-1);
  if (leader?.execution_result !== 'SUCCESS' || leader.result?.status !== 'return') {
    return { state: 'Failed', detail: 'The contract did not complete this action. See the explorer receipt.' };
  }
  return { state: 'Finalized', raw: leader.result.payload?.raw };
}
