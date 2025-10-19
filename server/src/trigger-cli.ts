import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import path from "path";
import { GRPC_ADDR } from "./config/env.config";
import { createClientCredentials } from "./common/helpers/grpc-cred.helper";

const clientId = process.argv[2];
const filePath = process.argv[3];

if (!clientId || !filePath) {
  console.log("Usage: node trigger-cli <clientId> <filePathOnClient>");
  process.exit(1);
}

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
const grpcClientCreds = createClientCredentials();
const Uploader = new proto.uploader.Uploader(GRPC_ADDR, grpcClientCreds);

Uploader.Trigger(
  { client_id: clientId, file_path: filePath },
  (err: any, res: any) => {
    if (err) {
      console.error("Trigger error:", err.message);
      process.exit(1);
    }
    console.log("Trigger response:", res);
  }
);
