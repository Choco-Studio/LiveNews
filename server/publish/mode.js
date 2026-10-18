// How the channel publishes (docs/publishing/beta.md, pipeline.md §8).
//
//   PUBLISH_MODE=manual   the beta profile: the owner publishes every piece by hand, from the approval page (a file to
//                         download, the texts to copy, the networks' own switches to set). No adapter ever calls a
//                         network, the publisher's round only re-checks, nothing is scheduled, and the live
//                         supervisor never streams. The networks' API audits take days or weeks (unaudited YouTube API
//                         uploads are locked private, TikTok's Content Posting API posts privately), so the beta is
//                         published by hand.
//   anything else         the API pipeline (dry run until the owner's five switches are on: setup.md §7)
//
//   publishMode(env) -> 'manual' | 'api';  isManual(env) -> boolean
//   manualAnywhere(...envs): true when any of the given environments (or this process's) says manual: an adapter
//   built with an empty environment for a dry plan still never reaches a network in a manual process.

export const MODES = Object.freeze(['manual', 'api']);

export function publishMode(env = process.env) {
  return String(env?.PUBLISH_MODE || '').trim().toLowerCase() === 'manual' ? 'manual' : 'api';
}

export const isManual = (env = process.env) => publishMode(env) === 'manual';

export const manualAnywhere = (...envs) => [...envs, process.env].some((e) => isManual(e));
