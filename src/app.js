import { abi, createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import deployment from './deployment.json';
import { canPublish, CHAIN_ID, EXPLORER, parseLocales, receiptOutcome, RPC, verdictLabel } from './protocol.js';

const $ = id => document.getElementById(id);
const address = deployment.contract_address;
const demoId = deployment.demo?.release_id;
const reader = createClient({ chain: studionet });
const state = { release: null, locale: null, review: null, account: null, chain: null, readVersion: 0 };
const esc = value => String(value ?? '').replace(/[&<>"']/g, mark => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[mark]);
const short = value => value ? value.slice(0, 8) + '…' + value.slice(-5) : '';
const same = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
const badge = (label, kind) => '<span class="badge ' + esc(kind) + '">' + esc(label) + '</span>';
const messages = { create_release: 'Create release', review_translation: 'Review translation', publish_release: 'Publish release' };
const storage = 'localegate:activity:' + address.toLowerCase();
const pendingPolls = new Set();
let signing = false;
let activity = [];
try {
  const saved = JSON.parse(localStorage.getItem(storage) ?? '[]');
  if (Array.isArray(saved)) activity = saved;
} catch {}

function status(message, error = false) {
  $('status').textContent = message;
  $('status').classList.toggle('error', error);
}
const errorText = error => String(error?.shortMessage || error?.message || error).slice(0, 250);
const read = (method, ...args) => reader.readContract({
  address, functionName: method, args, transactionHashVariant: 'latest-final',
});
const isOwner = () => same(state.account, state.release?.publisher);

function route() {
  const tab = location.hash === '#activity' ? 'activity' : 'review';
  $('activity-view').hidden = tab !== 'activity';
  $('review-view').hidden = tab === 'activity';
  document.querySelectorAll('nav a').forEach(link => {
    if (link.hash === '#' + tab) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

function renderWallet() {
  $('wallet').textContent = state.account
    ? state.chain === CHAIN_ID ? short(state.account) : 'Switch to Studionet'
    : 'Connect wallet';
  $('wallet').title = state.account ?? '';
}

function renderRelease() {
  const release = state.release;
  if (!release) {
    $('record').innerHTML = '<div class="release-head"><h2>Find a release</h2></div><p>Enter a release ID or load the example to inspect an on-chain verdict.</p>';
    return;
  }
  const locales = Object.entries(release.targets);
  const selected = release.targets[state.locale];
  const review = state.review;
  const draft = release.status === 'DRAFT';
  const submit = isOwner() && draft;
  const action = submit
    ? '<div class="release-actions"><button type="button" class="primary" data-action="review">Review translation</button> <button type="button" data-action="publish" ' + (canPublish(release) ? '' : 'disabled') + '>Publish release</button><p class="publish-hint">' + (canPublish(release) ? 'Every target locale has passed review.' : 'Every target must match before you can publish.') + '</p></div>'
    : draft ? '<p class="publish-hint">The publisher can review translations and publish this draft.</p>' : '';
  const pagination = selected.attempt
    ? '<div class="history"><div class="section-head"><h3>Review history</h3>' + badge(verdictLabel[review?.verdict || selected.verdict], review?.verdict || selected.verdict) + '</div><div class="pagination"><button type="button" data-attempt="' + ((review?.attempt ?? selected.attempt) - 1) + '" ' + ((!review || review.attempt <= 1) ? 'disabled' : '') + '>Previous</button><span>Attempt ' + esc(review?.attempt ?? selected.attempt) + ' of ' + esc(selected.attempt) + '</span><button type="button" data-attempt="' + ((review?.attempt ?? selected.attempt) + 1) + '" ' + ((!review || review.attempt >= selected.attempt) ? 'disabled' : '') + '>Next</button></div></div>'
    : '';
  $('record').innerHTML = '<div class="release-head"><div><span class="kicker">Release ' + esc(release.id) + '</span><h2>' + esc(release.title) + '</h2></div>' +
    badge(draft ? 'Draft' : 'Published', release.status) + '</div>' + action +
    '<div class="target-list" aria-label="Target locales">' +
    locales.map(([locale, item]) => '<button type="button" class="locale" data-locale="' + esc(locale) + '" aria-pressed="' + (locale === state.locale) + '"><i class="' + esc(item.verdict) + '"></i>' + esc(locale) + '</button>').join('') +
    '</div><div class="comparison"><article class="copy-card"><header><h3>Source copy</h3><span>' + esc(release.source_locale) + '</span></header><p>' + esc(release.source) +
    '</p></article><article class="copy-card"><header><h3>Translation</h3><span>' + esc(state.locale) + '</span></header><p>' +
    esc(review?.translation ?? (selected.attempt ? 'Loading review…' : 'Awaiting a translation.')) + '</p></article></div>' + pagination;
}

function renderActivity() {
  $('activity').innerHTML = activity.length ? activity.map(item =>
    '<div class="activity-row"><div><strong>' + esc(messages[item.method] ?? item.method) + '</strong><p>' + esc(item.detail ?? '') +
    (item.id ? ' <button type="button" class="text-button" data-open-release="' + esc(item.id) + '">Open release ' + esc(item.id) + '</button>' : '') +
    '</p><a href="' + EXPLORER + '/transactions/' + esc(item.hash) + '" target="_blank" rel="noreferrer">' + esc(short(item.hash)) +
    ' ↗</a></div><div class="row-actions">' + badge(item.state, item.state) +
    (item.state === 'Pending' ? '<button type="button" data-check="' + esc(item.hash) + '">Check status</button>' : '') + '</div></div>'
  ).join('') : '<p>No transactions from this browser yet.</p>';
}

async function loadRelease(id, preferredLocale) {
  if (!/^[1-9][0-9]{0,77}$/.test(id)) throw Error('Enter a valid release ID.');
  const version = ++state.readVersion;
  status('Loading finalized Studionet data…');
  const release = await read('get_release', id);
  const locale = preferredLocale in release.targets ? preferredLocale : Object.keys(release.targets)[0];
  const attempt = release.targets[locale].attempt;
  const review = attempt ? await read('get_review', id, locale, attempt) : null;
  if (version !== state.readVersion) return;
  Object.assign(state, { release, locale, review });
  $('release-id').value = id;
  renderRelease();
  status('Showing finalized Studionet data.');
}

async function selectReview(locale, attempt = state.release?.targets[locale]?.attempt) {
  if (!state.release || !(locale in state.release.targets)) return;
  const version = ++state.readVersion;
  const review = attempt ? await read('get_review', state.release.id, locale, attempt) : null;
  if (version !== state.readVersion) return;
  Object.assign(state, { locale, review });
  renderRelease();
  status('Showing finalized Studionet data.');
}

async function refreshWallet() {
  const provider = window.ethereum;
  if (!provider) return;
  const [accounts, chain] = await Promise.all([
    provider.request({ method: 'eth_accounts' }),
    provider.request({ method: 'eth_chainId' }),
  ]);
  state.account = accounts[0] ?? null;
  state.chain = chain;
  renderWallet();
  renderRelease();
}

async function connect() {
  const provider = window.ethereum;
  if (!provider) throw Error('Open this app with an EIP-1193 browser wallet to sign transactions.');
  await provider.request({ method: 'eth_requestAccounts' });
  if (await provider.request({ method: 'eth_chainId' }) !== CHAIN_ID) {
    try {
      await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_ID }] });
    } catch (error) {
      if (Number(error.code) !== 4902) throw error;
      await provider.request({ method: 'wallet_addEthereumChain', params: [{
        chainId: CHAIN_ID, chainName: 'GenLayer Studionet',
        nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 },
        rpcUrls: [RPC], blockExplorerUrls: [EXPLORER],
      }] });
    }
  }
  await refreshWallet();
  if (!state.account || state.chain !== CHAIN_ID) throw Error('Select your account on GenLayer Studionet.');
  return state.account;
}

function updateActivity(item) {
  activity = [item, ...activity.filter(row => row.hash !== item.hash)].slice(0, 30);
  try { localStorage.setItem(storage, JSON.stringify(activity)); } catch {}
  renderActivity();
}

async function check(item, repeat = false) {
  if (pendingPolls.has(item.hash)) return;
  pendingPolls.add(item.hash);
  try {
    for (let i = 0; i < (repeat ? 25 : 1); i++) {
      const receipt = await reader.getTransaction({ hash: item.hash }).catch(() => null);
      const outcome = receiptOutcome(receipt);
      updateActivity({ ...item, state: outcome.state, detail: outcome.detail });
      if (outcome.state === 'Finalized') {
        if (item.method === 'create_release') {
          const id = abi.calldata.decode(Uint8Array.from(outcome.raw));
          const releaseId = String(id);
          updateActivity({ ...item, id: releaseId, state: 'Finalized' });
          await loadRelease(releaseId);
        } else if (state.release?.id === item.id) {
          await loadRelease(item.id, item.locale);
        }
        return;
      }
      if (outcome.state === 'Failed') return;
      if (repeat && i < 24) await new Promise(resolve => setTimeout(resolve, 4500));
    }
  } finally {
    pendingPolls.delete(item.hash);
  }
}

async function submit(method, args, details = {}) {
  if (signing) throw Error('A wallet request is already in progress.');
  signing = true;
  let hash;
  try {
    const account = await connect();
    if (details.owner && !same(account, details.owner)) throw Error('Select the publisher account in your wallet.');
    const client = createClient({ chain: studionet, account, provider: window.ethereum });
    hash = await client.writeContract({ address, functionName: method, args, value: 0n, leaderOnly: false });
    if (!/^0x[0-9a-f]{64}$/i.test(hash)) throw Error('Check your wallet activity for the transaction hash before retrying.');
  } finally {
    signing = false;
  }
  const item = { hash, method, id: details.id, locale: details.locale, state: 'Pending' };
  updateActivity(item);
  $('dialog').close();
  location.hash = '#activity';
  void check(item, true).catch(error => status(errorText(error), true));
}

function openDialog(title, fields, button, callback) {
  $('dialog-title').textContent = title;
  $('dialog-body').innerHTML = '<form class="dialog-fields" id="dialog-form">' + fields +
    '<p class="form-error" role="alert" hidden></p><button type="submit" class="primary">' + esc(button) + '</button></form>';
  const form = $('dialog-form');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    const error = form.querySelector('[role="alert"]');
    button.disabled = true;
    error.hidden = true;
    try {
      await callback(new FormData(form));
    } catch (failure) {
      error.textContent = errorText(failure);
      error.hidden = false;
    } finally {
      button.disabled = false;
    }
  });
  if (!$('dialog').open) $('dialog').showModal();
}

function newRelease() {
  if (!address) throw Error('Configure a deployed LocaleGate contract first.');
  openDialog('New release', '<p>Release copy and translations are recorded publicly on Studionet.</p>' +
    '<label>Release title<input name="title" maxlength="80" required></label>' +
    '<div class="field-row"><label>Source locale<input name="source-locale" value="en" required></label>' +
    '<label>Target locales<input name="targets" required placeholder="es, pt-br"></label></div>' +
    '<label>Approved source copy<textarea name="source" maxlength="2000" rows="5" required></textarea></label>',
  'Sign and create', data => {
    const { source, targets } = parseLocales(data.get('source-locale'), data.get('targets'));
    return submit('create_release', [data.get('title'), source, data.get('source'), targets.join(',')]);
  });
}

function reviewTranslation() {
  const release = state.release;
  const locale = state.locale;
  const fallback = state.review?.translation ?? '';
  openDialog('Review translation', '<p>Release ' + esc(release.id) + ' · ' + esc(locale.toUpperCase()) +
    '. GenLayer validators will compare your copy with the approved source.</p>' +
    '<label>Translation<textarea name="translation" maxlength="2400" rows="6" required>' + esc(fallback) + '</textarea></label>',
  'Sign and review', data => submit('review_translation', [release.id, locale, data.get('translation')], {
    id: release.id, locale, owner: release.publisher,
  }));
}

function publishRelease() {
  const release = state.release;
  openDialog('Publish release', '<p>Publish this release and its reviewed translations on Studionet. Published records are immutable.</p>',
    'Sign and publish', () => submit('publish_release', [release.id], { id: release.id, owner: release.publisher }));
}

function report(promise) {
  return promise.catch(error => status(errorText(error), true));
}

$('wallet').addEventListener('click', () => report(connect()));
$('new-release').addEventListener('click', () => report(Promise.resolve().then(newRelease)));
$('load-form').addEventListener('submit', event => {
  event.preventDefault();
  report(loadRelease($('release-id').value.trim()));
});
$('demo-release').addEventListener('click', () => report(loadRelease(demoId)));
$('record').addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.locale) report(selectReview(button.dataset.locale));
  if (button.dataset.attempt) report(selectReview(state.locale, Number(button.dataset.attempt)));
  if (button.dataset.action === 'review') reviewTranslation();
  if (button.dataset.action === 'publish') publishRelease();
});
$('activity').addEventListener('click', event => {
  const button = event.target.closest('[data-check], [data-open-release]');
  if (button?.dataset.openRelease) {
    location.hash = '#review';
    report(loadRelease(button.dataset.openRelease));
  }
  const item = button?.dataset.check && activity.find(row => row.hash === button.dataset.check);
  if (item) report(check(item));
});
window.ethereum?.on?.('accountsChanged', () => report(refreshWallet()));
window.ethereum?.on?.('chainChanged', () => report(refreshWallet()));
window.addEventListener('hashchange', route);
route();
renderRelease();
renderActivity();
report(refreshWallet());
$('demo-release').disabled = !demoId;
if (address) {
  $('contract-link').href = EXPLORER + '/address/' + address;
  $('contract-link').hidden = false;
  if (demoId) report(loadRelease(demoId));
  else status('Enter a release ID to load finalized Studionet data.');
} else {
  status('Set the contract address in deployment.json and rebuild to connect to Studionet.', true);
}
