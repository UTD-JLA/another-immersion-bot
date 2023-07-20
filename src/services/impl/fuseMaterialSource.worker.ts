import {parentPort} from 'worker_threads';
import Fuse from 'fuse.js';
import type {IndexEntry, WorkerMessage} from './fuseMaterialSource';

const index = new Fuse<IndexEntry>([], {
  keys: [
    'scope',
    'language',
    {name: 'text', weight: 1},
    {name: 'aliases', weight: 0.5},
  ],
  threshold: 0.3,
  includeScore: true,
  ignoreLocation: true,
  useExtendedSearch: true,
  isCaseSensitive: false,
});

parentPort?.on('message', (message: WorkerMessage) => {
  if (typeof message !== 'object' || message === null) {
    return;
  }

  const {type, data} = message;

  if (type === 'set') {
    index.setCollection(data);
  } else if (type === 'search') {
    const {requestId} = message;
    const {query, limit, scope, language} = data;

    const searchExpr: Fuse.Expression = {
      $and: [
        {
          $or: [
            {
              text: query,
            },
            {
              aliases: query,
            },
          ],
        },
      ],
    };

    if (scope) {
      searchExpr.$and!.push({scope: `=${scope}`});
    }

    if (language) {
      searchExpr.$and!.push({language: `=${language}`});
    }

    const results = index.search(searchExpr, {limit});

    parentPort?.postMessage({
      type: 'search',
      requestId,
      data: results,
    });
  }
});
