import pRetry from "p-retry";
import { MinistackContainer } from "./ministack-container";
import { describe, expect, it } from "vitest";
import {
  CreateBucketCommand,
  HeadBucketCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { CreateDBInstanceCommand, RDSClient } from "@aws-sdk/client-rds";
import { Client, ClientConfig } from "pg";

describe("LocalStackContainer", { timeout: 180_000 }, () => {
  it("should create a S3 bucket", async () => {
    await using container = await new MinistackContainer().start();

    const client = new S3Client({
      endpoint: container.getConnectionUri(),
      forcePathStyle: true,
      region: "us-east-1",
      credentials: {
        secretAccessKey: "test",
        accessKeyId: "test",
      },
    });

    const input = { Bucket: "testcontainers" };
    const command = new CreateBucketCommand(input);

    expect((await client.send(command)).$metadata.httpStatusCode).toEqual(200);
    expect(
      (await client.send(new HeadBucketCommand(input))).$metadata
        .httpStatusCode,
    ).toEqual(200);
  });

  it("should create rds with real infrastructure (postgres container)", async () => {
    await using container = await new MinistackContainer()
      .withRealInfrastructure()
      .start();

    const rdsClient = new RDSClient({
      endpoint: container.getConnectionUri(),
      region: "us-east-1",
      credentials: {
        secretAccessKey: "test",
        accessKeyId: "test",
      },
    });
    const command = new CreateDBInstanceCommand({
      DBInstanceIdentifier: "postgres",
      DBInstanceClass: "db.t3.micro",
      Engine: "postgres",
      MasterUsername: "masteruser",
      MasterUserPassword: "password",
      DBName: "postgresdb",
    });

    const response = await rdsClient.send(command);

    const pgConfig = {
      host: response.DBInstance!.Endpoint!.Address,
      port: response.DBInstance!.Endpoint!.Port,
      database: "postgresdb",
      user: "masteruser",
      password: "password",
    };

    const pgClient = await pRetry(() => tryConnect(pgConfig), {
      retries: 15,
      minTimeout: 1000,
      maxTimeout: 3000,
      factor: 1.5,
    });
    const result = await pgClient.query("SELECT 1");
    expect(result.rows[0]).toEqual({ "?column?": 1 });

    await pgClient.end();
  });
});

const tryConnect = async (config: ClientConfig) => {
  const client = new Client(config);
  try {
    await client.connect();
    return client;
  } catch (error) {
    client.end().catch(() => {});
    throw error;
  }
};
