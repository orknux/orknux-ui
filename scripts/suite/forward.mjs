/**
 * Listens on the container's loopback and hands every connection to a port on
 * the host, so a browser in the container can reach a server on the host as
 * `localhost` - the name Chromium trusts with a microphone, and the one CI uses.
 *
 *   node scripts/suite/forward.mjs 18099            # localhost:18099 -> host.docker.internal:18099
 *   node scripts/suite/forward.mjs 18099 8080       # localhost:18099 -> host.docker.internal:8080
 */
import { createServer, connect } from 'node:net';

const [listenOn, sendTo = listenOn] = process.argv.slice(2).map(Number);
if (!listenOn) {
  console.error('say which port to listen on');
  process.exit(2);
}
createServer((incoming) => {
  const outgoing = connect(sendTo, 'host.docker.internal');
  incoming.pipe(outgoing).pipe(incoming);
  const drop = () => { incoming.destroy(); outgoing.destroy(); };
  incoming.on('error', drop);
  outgoing.on('error', drop);
}).listen(listenOn, '127.0.0.1', () => console.log(`localhost:${listenOn} -> host.docker.internal:${sendTo}`));
