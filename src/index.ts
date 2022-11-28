#!/usr/bin/env node

import axios from 'axios';
import * as fs from 'fs';

const BLOCKED_TEXT = 'Forbidden: bot was blocked by the user';
const DEACTIVATED_TEXT = 'Forbidden: user is deactivated';
const NO_CHAT = 'Bad Request: chat not found';
const KICKED = 'Forbidden: bot was kicked from the group chat';
const CHAT_UPGRADED = 'Bad Request: group chat was upgraded to a supergroup chat';
const CHAT_DELETED = 'Forbidden: the group chat was deleted';
const CHAT_WRITE_FORBIDDEN = 'Bad Request: CHAT_WRITE_FORBIDDEN';
const PEER_ID_INVALID = 'Bad Request: PEER_ID_INVALID';
const NO_RIGHTS = 'Bad Request: have no rights to send a message';
const SG_NO_MEMBER = 'Forbidden: bot is not a member of the supergroup chat';
const SG_KICKED = 'Forbidden: bot was kicked from the supergroup chat';
const CHANNEL_PRIVATE = 'Bad Request: CHANNEL_PRIVATE';

const ENOTFOUND = 'getaddrinfo ENOTFOUND api.telegram.org';

const MAX_THREADS = 20;

const FG_BG_RESET = '\x1b[0m';
const BG_BLUE_FG_YELLOW = '\x1b[44m\x1b[33m';

const errorLog: string[] = [];

enum Status {
  BLOCKED,
  OK,
  DEACTIVATED,
  NO_CHAT,
  KICKED,
  CHAT_UPGRADED,
  CHAT_DELETED,
  CHAT_WRITE_FORBIDDEN,
  PEER_ID_INVALID,
  NO_RIGHTS,
  SG_NO_MEMBER,
  SG_KICKED,
  CHANNEL_PRIVATE,
  OTHER,
}

const MAP_STATUSES: Record<string, Status> = {
  [BLOCKED_TEXT]: Status.BLOCKED,
  [DEACTIVATED_TEXT]: Status.DEACTIVATED,
  [NO_CHAT]: Status.NO_CHAT,
  [KICKED]: Status.KICKED,
  [CHAT_UPGRADED]: Status.CHAT_UPGRADED,
  [CHAT_WRITE_FORBIDDEN]: Status.CHAT_WRITE_FORBIDDEN,
  [PEER_ID_INVALID]: Status.PEER_ID_INVALID,
  [NO_RIGHTS]: Status.NO_RIGHTS,
  [SG_NO_MEMBER]: Status.SG_NO_MEMBER,
  [SG_KICKED]: Status.SG_KICKED,
  [CHANNEL_PRIVATE]: Status.CHANNEL_PRIVATE,
  [CHAT_DELETED]: Status.CHAT_DELETED,
};

const [, , botToken, fileName] = process.argv;
const data = fs.readFileSync(fileName, 'utf-8');
let ids: number[];
if (fileName.endsWith('.json')) {
  ids = JSON.parse(data).map((idNode: number | { id: number | { '$numberLong': string } }) => {
    if (typeof idNode === 'number') {
      return idNode;
    } else {
      return typeof idNode.id === 'number'
        ? idNode.id
        : parseInt(idNode.id.$numberLong); // some data from mongoDb export may be like `{ '$numberLong': '-10015516.....' }`
    }
  });
} else if (fileName.endsWith('.txt')) {
  ids = data.split('\n').filter((it) => Boolean(it)).map((it) => parseInt(it));
} else {
  console.error('Wrong data');
  process.exit();
}


type StatedPromise = Promise<void> & { done?: boolean };

const resultMap: Map<number, Status> = new Map();
const statusMap: Map<Status, number> = new Map();

const echo = () => {
  console.clear();
  const lines = `OK: ${statusMap.get(Status.OK) ?? 0}
                 BLOCKED: ${statusMap.get(Status.BLOCKED) ?? 0}
                 DEACTIVATED: ${statusMap.get(Status.DEACTIVATED) ?? 0}
                 NO_CHAT: ${statusMap.get(Status.NO_CHAT) ?? 0}
                 KICKED: ${(statusMap.get(Status.KICKED) ?? 0) + (statusMap.get(Status.SG_KICKED) ?? 0)}
                 UPGRADED: ${statusMap.get(Status.CHAT_UPGRADED) ?? 0}
                 DELETED: ${statusMap.get(Status.CHAT_DELETED) ?? 0}
                 WRITE_FORBIDDEN: ${statusMap.get(Status.CHAT_WRITE_FORBIDDEN) ?? 0}
                 PEER_ID_INVALID: ${statusMap.get(Status.PEER_ID_INVALID) ?? 0}
                 NO_RIGHTS: ${statusMap.get(Status.NO_RIGHTS) ?? 0}
                 SG_NO_MEMBER: ${statusMap.get(Status.SG_NO_MEMBER) ?? 0}
                 CHANNEL_PRIVATE: ${statusMap.get(Status.CHANNEL_PRIVATE) ?? 0}
                 OTHER: ${statusMap.get(Status.OTHER) ?? 0}
                 TOTAL: ${resultMap.size} of ${ids.length} (${(100 * resultMap.size / ids.length).toFixed()}%)

                 ${errorLog.join('\n')}
                 `.split('\n');

  const data = lines.map((line) => {
    const trimmed = line.trimStart();
    if (trimmed.includes(':')) {
      return trimmed.substring(0, trimmed.indexOf(':') + 1).padEnd(20)
             + BG_BLUE_FG_YELLOW
             + trimmed.substring(trimmed.indexOf(':') + 1)
             + ' ' + FG_BG_RESET;
    }
    return line;
  }).join('\n');
  console.log(data);
};

const set = (id: number, status: Status) => {
  resultMap.set(id, status);
  statusMap.set(status, (statusMap.get(status) ?? 0) + 1);
}

const checkBlocked = async (id: number): Promise<void> => {
  try {
    const request = await axios(`https://api.telegram.org/bot${botToken}/sendChatAction?action=typing&chat_id=${id}`);
    const { ok, result } = request.data;
    if (ok && result) {
      set(id, Status.OK);
    } else {
      set(id, Status.OTHER);
      console.log(id, ok, result);
    }
  } catch (error: any) {
    if (!error.response) {
      if (error.message === ENOTFOUND) {
        await new Promise((rs) => setTimeout(rs, 300 + Math.random() * 300));
        return checkBlocked(id);
      } else {
        errorLog.push(`${id} ${error.message}`);
        if (errorLog.length > 10) {
          errorLog.shift();
        }
      }
    } else {
      const { description } = error.response.data;
      const status = MAP_STATUSES[description] ?? Status.OTHER;
      set(id, status);

      if (status === Status.OTHER) {
        console.log(id, description);
      }
    }
  }
  if (resultMap.size % 10 === 0 || resultMap.size === ids.length) {
    echo();
  }
};

const promises: Array<StatedPromise> = [];

const START_FROM = 0;

const main = async () => {
  let counter = 0;
  for (const id of ids) {
    if (counter < START_FROM) {
      counter++;
      continue;
    } else {
      counter++;
    }
    const promise: StatedPromise = checkBlocked(id);
    promise.then(() => {
      promise.done = true;
    })
    promises.push(promise);
    if (promises.length >= MAX_THREADS) {
      await Promise.race(promises);
      for (let i = promises.length - 1; i >= 0; i--) {
        if (promises[i].done) {
          promises.splice(i, 1);
        }
      }
    }
  }
};

main();
