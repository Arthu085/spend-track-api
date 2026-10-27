import { createConnection, createServer, type Socket } from 'node:net';
import type { AddressInfo } from 'node:net';

// `forward` relays traffic to the upstream; `refuse` drops every connection as
// soon as it opens (a database that went away); `stall` accepts connections
// but never relays a byte (a database that stopped answering).
export type TcpProxyMode = 'forward' | 'refuse' | 'stall';

export interface TcpProxy {
  readonly port: number;
  setMode(mode: TcpProxyMode): void;
  stallOpenConnections(): void;
  close(): Promise<void>;
}

interface Link {
  client: Socket;
  upstream?: Socket;
  stalled: boolean;
}

// Sits between the app and the real test Postgres so a spec can take the
// database away from one app without touching the container other spec
// files share. `setMode` drops the open connections, so the pool has to
// reconnect under the new mode. `stallOpenConnections` instead leaves them
// open but silent while new connections keep working, like half-open
// sockets after a network failover.
export async function startTcpProxy(
  upstreamHost: string,
  upstreamPort: number,
): Promise<TcpProxy> {
  let mode: TcpProxyMode = 'forward';
  const links = new Set<Link>();

  const dropAll = (): void => {
    for (const { client, upstream } of links) {
      client.destroy();
      upstream?.destroy();
    }

    links.clear();
  };

  const relay = (link: Link, from: Socket, to: Socket): void => {
    from.on('data', (chunk) => {
      if (!link.stalled) {
        to.write(chunk);
      }
    });
    from.on('close', () => {
      to.destroy();
      links.delete(link);
    });
    from.on('error', () => from.destroy());
  };

  const server = createServer((client) => {
    if (mode === 'refuse') {
      client.destroy();
      return;
    }

    const link: Link = { client, stalled: mode === 'stall' };
    links.add(link);

    if (link.stalled) {
      client.on('close', () => links.delete(link));
      client.on('error', () => client.destroy());
      return;
    }

    const upstream = createConnection(upstreamPort, upstreamHost);
    link.upstream = upstream;

    relay(link, client, upstream);
    relay(link, upstream, client);
  });

  await new Promise<void>((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve()),
  );

  return {
    port: (server.address() as AddressInfo).port,
    setMode(next) {
      mode = next;
      dropAll();
    },
    stallOpenConnections() {
      for (const link of links) {
        link.stalled = true;
      }
    },
    close() {
      dropAll();

      return new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
