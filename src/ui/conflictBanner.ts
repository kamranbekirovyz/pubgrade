import { Conflict } from '../core/conflicts';
import { isBlocked, UPDATE_STYLES } from '../core/presentation';
import { Package } from '../core/types';
import { escapeHtml } from './html';

/**
 * The banner that sits above the changelog: either the blocked-update
 * explanation, or a note that `dependency_overrides:` is deciding this
 * package's version.
 *
 * The blocked one leads with a verdict — can I have this or not — and only
 * then shows the evidence. An earlier version opened with the constraints and
 * left the reader to work out what it meant for them; naming the outcome first
 * is the difference between a report and an answer.
 */

export function conflictBanner(pkg: Package): string {
  if (pkg.override) return overrideBanner(pkg);

  const conflict = pkg.conflict;
  if (!conflict || !isBlocked(pkg)) return '';

  return `
  <section class="conflict">
    ${versionBar(pkg, conflict)}
    <div class="conflict-body">
      <p class="verdict">${verdict(pkg, conflict)}</p>
      ${explanation(pkg, conflict)}
      ${callToAction(pkg, conflict)}
    </div>
  </section>`;
}

/** The one sentence the reader came for. */
function verdict(pkg: Package, conflict: Conflict): string {
  const version = escapeHtml(pkg.latestVersion);

  if (conflict.groupUpdate.length > 0) {
    const others = conflict.groupUpdate.length - 1;
    return `You can have ${version} — but ${others} other
            ${others === 1 ? 'package has' : 'packages have'} to move with it.`;
  }

  return conflict.safeVersion
    ? `You cannot have ${version} yet.`
    : `You cannot have ${version} yet, and there is nothing newer to take instead.`;
}

/**
 * An overridden package. No wall and no buttons: pub installs the override and
 * ignores everyone, so nothing is blocked. What the user needs to know is that
 * the override exists, and — usually the forgotten part — why it was added.
 */
function overrideBanner(pkg: Package): string {
  const override = pkg.override!;

  const pinned = override.pinnedTo
    ? `pinned to <code>${escapeHtml(override.pinnedTo)}</code> by
       <code>dependency_overrides</code>`
    : 'set by <code>dependency_overrides</code>';

  const blockers = override.wouldBlock?.blockers ?? [];
  const reason =
    blockers.length > 0
      ? `<p class="conflict-heading">Without the override, these would cap it:</p>
         <ul class="blockers">
           ${blockers
             .map(
               blocker => `
             <li>
               <span class="blocker-name">${escapeHtml(blocker.name)}</span>
               <span class="blocker-version">${escapeHtml(blocker.version)}</span>
               <code>${escapeHtml(blocker.over)} ${escapeHtml(blocker.allows)}</code>
             </li>`
             )
             .join('')}
         </ul>`
      : '';

  return `
  <section class="conflict overridden">
    <div class="conflict-body">
      <p><strong>${escapeHtml(pkg.name)}</strong> is ${pinned}.
      That is the version pub installs, whatever the constraint below says.</p>
      ${reason}
      <p class="conflict-note">
        Updating here changes the constraint, not what gets installed. Change
        the override to move this package.
      </p>
    </div>
  </section>`;
}

/** current ──●── safe ──┃── latest, with the wall where the blockers stop you. */
function versionBar(pkg: Package, conflict: Conflict): string {
  const blockerCount = new Set(conflict.blockers.map(blocker => blocker.name)).size;
  const wallLabel =
    blockerCount === 1
      ? `${conflict.blockers[0].name} stops here`
      : `${blockerCount} packages stop here`;

  const safeStop = conflict.safeVersion
    ? stop(conflict.safeVersion, 'suggested', 'safe')
    : '';

  return `
    <div class="bar">
      ${stop(pkg.currentVersion, 'current', 'current')}
      <div class="rail"></div>
      ${safeStop}
      <div class="wall" title="${escapeHtml(wallLabel)}">
        <span class="wall-label">${escapeHtml(wallLabel)}</span>
      </div>
      ${stop(pkg.latestVersion, 'latest', 'latest')}
    </div>`;
}

function stop(version: string, label: string, kind: string): string {
  return `
    <div class="stop ${kind}">
      <span class="stop-version">${escapeHtml(version)}</span>
      <span class="stop-dot"></span>
      <span class="stop-label">${escapeHtml(label)}</span>
    </div>`;
}

/** Who is blocking, and over what. One row per blocker. */
function explanation(pkg: Package, conflict: Conflict): string {
  const first = conflict.blockers[0];
  const sharedPackage = first.over !== pkg.name;

  const heading = sharedPackage
    ? `${escapeHtml(pkg.name)} ${escapeHtml(pkg.latestVersion)} wants
       <code>${escapeHtml(first.over)} ${escapeHtml(first.wants)}</code>, but these do not agree:`
    : `These need ${escapeHtml(pkg.name)} to stay lower:`;

  const rows = conflict.blockers
    .map(
      blocker => `
      <li>
        <span class="blocker-name">${escapeHtml(blocker.name)}</span>
        <span class="blocker-version">${escapeHtml(blocker.version)}</span>
        <code>${escapeHtml(blocker.over)} ${escapeHtml(blocker.allows)}</code>
      </li>`
    )
    .join('');

  return `<p class="conflict-heading">${heading}</p><ul class="blockers">${rows}</ul>`;
}

/**
 * The group move, spelled out.
 *
 * This button writes several packages at once, and the ones it drags along are
 * usually major bumps whose changelogs the user has not opened — Pubgrade
 * exists so nobody updates blind, so every member shows its jump and offers
 * its own changelog before anything is agreed to.
 */
function groupPlan(pkg: Package, conflict: Conflict): string {
  const members = conflict.groupUpdate;
  const majors = members.filter(member => member.jump === 'major').length;

  const rows = members
    .map(member => {
      const style = UPDATE_STYLES[member.jump];
      const isOpenPackage = member.name === pkg.name;
      const read = isOpenPackage
        ? '<span class="blocker-version">shown below</span>'
        : `<button class="link" data-open="${escapeHtml(member.name)}">changelog</button>`;

      return `
      <li>
        <span class="blocker-name">${escapeHtml(member.name)}</span>
        <span class="blocker-version">${escapeHtml(member.from)} → ${escapeHtml(member.to)}</span>
        <span class="jump ${escapeHtml(member.jump)}"
              title="${escapeHtml(style.note)}">${escapeHtml(member.jump)}</span>
        ${read}
      </li>`;
    })
    .join('');

  const payload = members.map(member => `${member.name}@${member.to}`).join(',');
  const warning =
    majors > 0
      ? `<p class="conflict-note">
           ${majors === 1 ? 'One of these is a major bump' : `${majors} of these are major bumps`}
           — read their changelogs before you agree.
         </p>`
      : '';

  return `
    <p class="conflict-note">These have to move together. None of them works alone.</p>
    <ul class="blockers group">${rows}</ul>
    ${warning}
    <button data-group="${escapeHtml(payload)}">Update all ${members.length}</button>`;
}

/**
 * What the reader can actually do about it. Without this the panel states a
 * problem and stops, which leaves people looking things up on pub.dev by hand.
 */
function callToAction(pkg: Package, conflict: Conflict): string {
  if (conflict.groupUpdate.length > 0) return groupPlan(pkg, conflict);

  // The ones with nowhere to go: no version of them will agree, so the only
  // real answers are to wait for a release or to stop depending on them.
  const stuck = [
    ...new Set(conflict.blockers.filter(blocker => !blocker.movable).map(b => b.name))
  ];
  const names = stuck.length > 0 ? stuck : [...new Set(conflict.blockers.map(b => b.name))];
  const listed = names.map(name => `<code>${escapeHtml(name)}</code>`).join(', ');

  const takeSomething = conflict.safeVersion
    ? `<li>
         <button data-version="${escapeHtml(conflict.safeVersion)}">
           Update to ${escapeHtml(conflict.safeVersion)}
         </button>
         — needs exactly what ${escapeHtml(pkg.currentVersion)} needs, so it is
         guaranteed to install
       </li>`
    : `<li>Stay on ${escapeHtml(pkg.currentVersion)}. No newer version is
         guaranteed to install, so anything else is worth trying by hand.</li>`;

  return `
    <p class="conflict-heading">What you can do:</p>
    <ul class="options">
      ${takeSomething}
      <li>Wait for ${listed} to allow ${escapeHtml(pkg.latestVersion)}, then come back</li>
      <li>Drop ${listed} if you no longer use ${names.length === 1 ? 'it' : 'them'}</li>
    </ul>`;
}

/** Scoped to `.conflict`, so it cannot disturb the changelog below it. */
export const CONFLICT_CSS = `
  .conflict {
    border: 1px solid var(--vscode-inputValidation-errorBorder, var(--vscode-panel-border));
    border-radius: 6px;
    margin-bottom: 24px;
    overflow: hidden;
  }
  /* An override is information, not a warning: no red. */
  .conflict.overridden { border-color: var(--vscode-panel-border); }
  .bar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 26px 18px 22px;
    background: var(--vscode-textBlockQuote-background);
  }
  .rail {
    flex: 1;
    height: 2px;
    background: var(--vscode-panel-border);
  }
  .stop {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    min-width: 64px;
  }
  .stop-version { font-size: 12px; font-weight: 600; }
  .stop-dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--vscode-panel-border);
  }
  .stop-label { font-size: 11px; color: var(--vscode-descriptionForeground); }
  .stop.current .stop-dot { background: var(--vscode-charts-blue, var(--vscode-textLink-foreground)); }
  .stop.safe .stop-dot { background: var(--vscode-charts-green, var(--vscode-testing-iconPassed)); }
  .stop.latest { opacity: 0.6; }
  .wall {
    position: relative;
    width: 3px;
    height: 46px;
    margin: 0 10px;
    background: var(--vscode-charts-red, var(--vscode-errorForeground));
    border-radius: 2px;
  }
  .wall-label {
    position: absolute;
    top: calc(100% + 4px);
    left: 50%;
    transform: translateX(-50%);
    white-space: nowrap;
    font-size: 11px;
    color: var(--vscode-charts-red, var(--vscode-errorForeground));
  }
  .conflict-body { padding: 16px 18px 18px; }
  .verdict { font-size: 15px; font-weight: 600; margin: 0 0 12px; }
  .conflict-heading { margin: 0 0 10px; }
  .options { list-style: none; margin: 0; padding: 0; }
  .options li {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    padding: 5px 0;
    color: var(--vscode-descriptionForeground);
  }
  .conflict-note { color: var(--vscode-descriptionForeground); margin: 4px 0 12px; }
  .blockers { list-style: none; margin: 0 0 14px; padding: 0; }
  .blockers li {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 3px 0;
  }
  .blocker-name { font-weight: 600; }
  .blocker-version { color: var(--vscode-descriptionForeground); font-size: 12px; }
  .blockers.group li { padding: 5px 0; }
  .jump {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    border-radius: 3px;
    padding: 1px 6px;
  }
  .jump.major {
    color: var(--vscode-errorForeground);
    border: 1px solid var(--vscode-errorForeground);
  }
  .jump.minor { color: var(--vscode-editorWarning-foreground); }
  .jump.patch, .jump.none { color: var(--vscode-editorInfo-foreground); }
  button.link {
    background: none;
    color: var(--vscode-textLink-foreground);
    padding: 0;
    font-size: 12px;
    text-decoration: underline;
  }
  button.link:hover { background: none; }
  code {
    font-family: var(--vscode-editor-font-family);
    background: var(--vscode-textCodeBlock-background);
    border-radius: 4px;
    padding: 1px 5px;
    font-size: 12px;
  }
  .blocked-note {
    color: var(--vscode-charts-red, var(--vscode-errorForeground));
    font-size: 11px;
  }
`;
