import "dotenv/config";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { v4 as uuidv4 } from "uuid";
import {
  CLIENT_SHARED_SECRET,
  DOWNLOAD_DIR,
  GRPC_PORT,
} from "./config/env.config";
import { ResponseCode } from "./common/enum.common";
import { createServerCredentials } from "./common/helpers/grpc-cred.helper";

fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

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
const Uploader = proto.uploader.Uploader;

type DuplexCall = grpc.ServerDuplexStream<any, any>;

// Active client streams: clientId -> duplex call
const streams = new Map<string, DuplexCall>();

// Upload state: uploadId -> { ws, sha, total, filePath }
const uploads = new Map<
  string,
  {
    sha: crypto.Hash;
    total: number;
    outPath: string;
    request: { clientId: string; filePath: string };
  }
>();

function registerDataStream(call: DuplexCall) {
  let clientId: string | null = null;

  call.on("data", (msg: any) => {
    if (msg.hello) {
      const { client_id, secret } = msg.hello;
      if (!client_id || secret !== CLIENT_SHARED_SECRET) {
        call.write({
          error: { code: ResponseCode.AUTH, message: "auth failed" },
        });
        call.destroy(new Error("auth failed"));
        return;
      }
      clientId = client_id;
      streams.set(clientId, call);
      call.write({ ready: { client_id: clientId } });
      console.log(`SERVER: client connected: ${clientId}`);
      return;
    }

    if (msg.chunk) {
      const { upload_id, seq, data, last } = msg.chunk;
      const up = uploads.get(upload_id);
      if (!up) {
        call.write({
          error: {
            upload_id,
            code: ResponseCode.NOT_FOUND,
            message: "unknown upload",
          },
        });
        return;
      }
      up.sha.update(data);
      up.total += data?.length || 0;
      up.outPath && fs.appendFileSync(up.outPath, data);
      if (last) {
        const digest = up.sha.digest("hex");
        call.write({ complete: { upload_id, size: up.total, sha256: digest } });
        console.log(
          `SERVER: complete ${upload_id} -> ${up.outPath} (${up.total} bytes, sha=${digest})`
        );
        uploads.delete(upload_id);
      }
      return;
    }

    if (msg.error) {
      console.warn(
        `SERVER: client error (${clientId || "unknown"}):`,
        msg.error
      );
      return;
    }
  });

  call.on("close", () => {
    if (clientId) {
      streams.delete(clientId);
      console.log(`SERVER: client disconnected: ${clientId}`);
    }
  });
}

// Trigger RPC: tell a connected client to upload a file
async function trigger(
  call: grpc.ServerUnaryCall<any, any>,
  cb: grpc.sendUnaryData<any>
) {
  const { client_id, file_path } = call.request;
  const client = streams.get(client_id);
  if (!client) {
    cb(null, { upload_id: "", status: "client_not_connected" });
    return;
  }

  // create upload state
  const upload_id = uuidv4();
  const outPath = path.join(DOWNLOAD_DIR, `${client_id}-${Date.now()}.bin`);
  fs.writeFileSync(outPath, Buffer.alloc(0));
  uploads.set(upload_id, {
    sha: crypto.createHash("sha256"),
    total: 0,
    outPath,
    request: { clientId: client_id, filePath: file_path },
  });

  // ask client to start streaming chunks
  client.write({ upload_req: { upload_id, file_path } });
  cb(null, { upload_id, status: "queued" });
  console.log(
    `SERVER: trigger -> ${client_id} | upload_id=${upload_id} path=${file_path}`
  );
}

function main() {
  const server = new grpc.Server();

  server.addService(Uploader.service, {
    DataStream: registerDataStream,
    Trigger: trigger,
  });

  const grpcServerCreds = createServerCredentials();

  server.bindAsync(`0.0.0.0:${GRPC_PORT}`, grpcServerCreds, (err, port) => {
    if (err) {
      console.error("Failed to bind gRPC server:", err);
      process.exit(1);
    }
    console.log(`SERVER: gRPC listening on port ${port}`);
  });
  // server.bindAsync(`0.0.0.0:${GRPC_PORT}`, grpcServerCreds, (err, port) => {
  //   if (err) throw err;
  //   server.start();
  //   console.log(`SERVER: gRPC on :${port}`);
  // });
}

main();
