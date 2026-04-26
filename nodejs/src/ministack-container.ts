import {
  AbstractStartedContainer,
  GenericContainer,
  StartedTestContainer,
  Wait,
} from "testcontainers";

export const PORT = 4566;
export const DEFAULT_IMAGE = "ministackorg/ministack";

export class MinistackContainer extends GenericContainer {
  /**
   * Create a MiniStack container with the default image and "latest" tag.
   *
   * @param image full image name including tag (default is `ministackorg/ministack`)
   */
  constructor(image: string = DEFAULT_IMAGE) {
    super(image);
    this.withExposedPorts(PORT);
    this.withWaitStrategy(
      Wait.forHttp("/_ministack/health", PORT).forStatusCode(200),
    );
  }

  /**
   * Activates real infrastructure mode.
   *
   * RDS spins up actual Postgres/MySQL containers, ElastiCache spins up real Redis, Athena runs real SQL via DuckDB, ECS runs real Docker containers.
   * @returns this container instance for chaining
   */
  public withRealInfrastructure(): MinistackContainer {
    const socketPath = this.getRemoteDockerUnixSocketPath();
    return this.withBindMounts([
      {
        source: socketPath,
        target: "/var/run/docker.sock",
        mode: "rw",
      },
    ]);
  }

  public override async start(): Promise<StartedMiniStackContainer> {
    return new StartedMiniStackContainer(await super.start());
  }

  private getRemoteDockerUnixSocketPath(): string {
    const dockerHost = process.env.DOCKER_HOST;

    if (dockerHost && dockerHost.startsWith("unix://")) {
      return dockerHost.replace("unix://", "");
    }

    if (
      dockerHost &&
      (dockerHost.startsWith("tcp://") || dockerHost.startsWith("ssh://"))
    ) {
      throw new Error(
        "DOCKER_HOST uses a remote connection. Could not bind /var/run/docker.sock.",
      );
    }

    if (
      process.platform === "win32" &&
      (!dockerHost || dockerHost.startsWith("npipe://"))
    ) {
      throw new Error(
        "Native windows-docker (Named Pipes) are not supported. Please use docker with WSL2.",
      );
    }

    // Fallback
    return "/var/run/docker.sock";
  }
}

export class StartedMiniStackContainer extends AbstractStartedContainer {
  constructor(startedTestContainer: StartedTestContainer) {
    super(startedTestContainer);
  }

  /**
   * @returns A the port of ministack container
   */
  public getPort(): number {
    return this.startedTestContainer.getMappedPort(PORT);
  }

  /**
   * @returns A connection URI in the form of `http://host:port`
   */
  public getConnectionUri(): string {
    return `http://${this.getHost()}:${this.getPort().toString()}`;
  }
}
