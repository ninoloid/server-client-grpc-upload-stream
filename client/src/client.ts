import "dotenv/config";
import fs from "fs";
import path from "path";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { jitter, sleep } from "./common/helper.common";
import {
  CHUNK_BYTES,
  CLIENT_ID,
  DEFAULT_FILE_PATH,
  GRPC_ADDR,
  SECRET,
} from "./config/env.config";
import { ResponseCode } from "./common/enum.common";
import { createClientCredentials } from "./common/helpers/grpc-cred.helper";

const pkgDef = protoLoader.loadSync(
  path.join(process.cwd(), "../proto/uploader.proto"),
  {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
  }
);

const proto = grpc.loadPackageDefinition(pkgDef) as any;

const Uploader = proto.uploader.Uploader as {
  new (address: string, creds: grpc.ChannelCredentials): any;
};

type Stream = grpc.ClientDuplexStream<any, any>;

async function connectWithRetry(): Promise<{ client: any; stream: Stream }> {
  let attempt = 0;
  while (true) {
    try {
      const grpcClientCreds = createClientCredentials();
      const client = new Uploader(GRPC_ADDR, grpcClientCreds);

      const stream: Stream = client.DataStream();
      await new Promise<void>((resolve, reject) => {
        stream.on("error", reject);
        // Send hello once the underlying HTTP/2 stream is ready to accept writes.
        setImmediate(() => {
          try {
            stream.write({ hello: { client_id: CLIENT_ID, secret: SECRET } });
            resolve();
          } catch (e) {
            reject(e);
          }
        });
      });

      console.log(`CLIENT: connected and sent hello`);
      return { client, stream };
    } catch (e: any) {
      attempt++;
      const backoff = Math.min(30_000, 1000 * Math.pow(2, attempt));
      const wait = jitter(backoff);

      console.warn(
        `CLIENT: connect failed (attempt ${attempt}): ${e.message}. retry in ${wait}ms`
      );

      await sleep(wait);
    }
  }
}

async function streamFile(
  stream: Stream,
  upload_id: string,
  file_path: string
) {
  const src = fs.createReadStream(file_path, { highWaterMark: CHUNK_BYTES });
  let seq = 0;
  let bytes = 0;

  // backpressure handling. if stream.write returns false, wait for 'drain'
  const writeAsync = (msg: any) =>
    new Promise<void>((resolve, reject) => {
      const ok = stream.write(msg, (err) => (err ? reject(err) : resolve()));
      if (!ok) stream.once("drain", () => resolve());
    });

  for await (const chunk of src) {
    bytes += (chunk as Buffer).length;
    await writeAsync({ chunk: { upload_id, seq, data: chunk, last: false } });
    seq++;
  }

  await writeAsync({
    chunk: { upload_id, seq, data: Buffer.alloc(0), last: true },
  });

  console.log(
    `CLIENT: finished sending ${bytes} bytes for upload_id=${upload_id}`
  );
}

async function main() {
  while (true) {
    try {
      const { client, stream } = await connectWithRetry();

      stream.on("data", async (msg: any) => {
        if (msg.ready) {
          console.log(
            `CLIENT: server acknowledged ready for client_id=${msg.ready.client_id}`
          );
          return;
        }

        if (msg.upload_req) {
          const { upload_id, file_path } = msg.upload_req;
          const pick = file_path || DEFAULT_FILE_PATH;
          if (!fs.existsSync(pick)) {
            stream.write({
              error: {
                upload_id,
                code: ResponseCode.NOT_FOUND,
                message: `file not found: ${pick}`,
              },
            });
            return;
          }

          console.log(
            `CLIENT: received upload request id=${upload_id} path=${pick}`
          );

          try {
            await streamFile(stream, upload_id, pick);
          } catch (e: any) {
            console.error("CLIENT: streamFile error:", e.message);
            stream.write({
              error: { upload_id, code: ResponseCode.IO, message: e.message },
            });
          }

          return;
        }

        if (msg.complete) {
          const { upload_id, size, sha256 } = msg.complete;
          console.log(
            `CLIENT: server complete: id=${upload_id} size=${size} sha=${sha256}`
          );
          return;
        }

        if (msg.error) {
          console.error("CLIENT: server error:", msg.error);
        }
      });

      stream.on("close", () => {
        console.warn("CLIENT: stream closed by server, will reconnect...");
      });

      stream.on("error", (e: any) => {
        console.warn("CLIENT: stream error:", e.message);
      });

      // keep the process alive. if stream errors/closes, outer loop retries
      await new Promise<void>((resolve, reject) => {
        stream.on("close", resolve);
        stream.on("error", resolve);
      });
    } catch (e: any) {
      console.warn("CLIENT: top-level error:", e.message);
    }

    // reconnect with backoff, exponential with jitter
    let attempt = 1;
    const backoff = Math.min(30_000, 1000 * Math.pow(2, attempt++));
    const wait = jitter(backoff);

    console.log(`CLIENT: reconnecting in ${wait}ms...`);

    await sleep(wait);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
