import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

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

const MAX_THREADS = 7;

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

const [, , botToken, dataPath] = process.argv;
const fileName = path.resolve(__dirname, `data-${dataPath}.json`);
const data = fs.readFileSync(fileName, 'utf-8');
const ids: number[] = JSON.parse(data).map((idNode: number | { id: number | { '$numberLong': string } }) => {
  if (typeof idNode === 'number') {
    return idNode;
  } else {
    return typeof idNode.id === 'number'
      ? idNode.id
      : parseInt(idNode.id.$numberLong); // some data from mongoDb export may be like `{ '$numberLong': '-10015516.....' }`
  }
});

type StatedPromise = Promise<void> & { done?: boolean };

const resultMap: Map<number, Status> = new Map();
const statusMap: Map<Status, number> = new Map();

const echo = () => {
  console.log('OK: ', statusMap.get(Status.OK) ?? 0);
  console.log('BLOCKED: ', statusMap.get(Status.BLOCKED) ?? 0);
  console.log('DEACTIVATED: ', statusMap.get(Status.DEACTIVATED) ?? 0);
  console.log('NO_CHAT: ', statusMap.get(Status.NO_CHAT) ?? 0);
  console.log('KICKED: ', (statusMap.get(Status.KICKED) ?? 0) + (statusMap.get(Status.SG_KICKED) ?? 0));
  console.log('UPGRADED: ', statusMap.get(Status.CHAT_UPGRADED) ?? 0);
  console.log('DELETED: ', statusMap.get(Status.CHAT_DELETED) ?? 0);
  console.log('WRITE_FORBIDDEN: ', statusMap.get(Status.CHAT_WRITE_FORBIDDEN) ?? 0);
  console.log('PEER_ID_INVALID: ', statusMap.get(Status.PEER_ID_INVALID) ?? 0);
  console.log('NO_RIGHTS: ', statusMap.get(Status.NO_RIGHTS) ?? 0);
  console.log('SG_NO_MEMBER: ', statusMap.get(Status.SG_NO_MEMBER) ?? 0);
  console.log('CHANNEL_PRIVATE: ', statusMap.get(Status.CHANNEL_PRIVATE) ?? 0);
  console.log('OTHER: ', statusMap.get(Status.OTHER) ?? 0);
  console.log('TOTAL: ', resultMap.size, 'of', ids.length);
  console.log('\n');
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
        console.log('!!!', id, error.message);
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
  if (resultMap.size % 1000 === 0 || resultMap.size === ids.length) {
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
