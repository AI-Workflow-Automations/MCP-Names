/**
 * Namelex CLI bridge – the TypeScript MCP server shells out to
 * `namelex hydrate` / `namelex stats` so hydration stays in the Python lexicon.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

import type { AppConfig } from "../config.js";

export class NamelexBridgeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NamelexBridgeError";
  }
}

export class NamelexBridge {
  constructor(private readonly config: AppConfig) {}

  async hydrate(name: string, options: { limit?: number; threshold?: number } = {}): Promise<unknown> {
    const limit = options.limit ?? this.config.matchLimit;
    const threshold = options.threshold ?? this.config.similarityThreshold;
    // --db/--data are parent-parser flags and must precede the subcommand.
    return this.run([
      "--db",
      this.config.dbPath,
      "hydrate",
      name,
      "--limit",
      String(limit),
      "--threshold",
      String(threshold),
    ]);
  }

  async stats(): Promise<unknown> {
    return this.run(["--db", this.config.dbPath, "stats"]);
  }

  private async run(args: string[]): Promise<unknown> {
    if (!existsSync(this.config.dbPath)) {
      throw new NamelexBridgeError(
        `Namelex database not found at ${this.config.dbPath}. ` +
          "Set NAMELEX_DB_PATH or run `python scripts/build_fixture_db.py`.",
      );
    }

    const pythonArgs = [...this.pythonModuleArgs(), ...args];
    const proc = Bun.spawn([this.config.pythonPath, ...pythonArgs], {
      cwd: this.config.repoRoot,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        PYTHONPATH: this.pythonPathEnv(),
      },
    });

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    if (exitCode !== 0) {
      const detail = (stderr || stdout).trim() || `exit ${exitCode}`;
      const label = args.find((a) => !a.startsWith("-") && a !== this.config.dbPath) ?? args[0];
      throw new NamelexBridgeError(`namelex ${label} failed: ${detail}`);
    }

    const text = stdout.trim();
    if (!text) {
      const label = args.find((a) => !a.startsWith("-") && a !== this.config.dbPath) ?? args[0];
      throw new NamelexBridgeError(`namelex ${label} returned empty stdout`);
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      const label = args.find((a) => !a.startsWith("-") && a !== this.config.dbPath) ?? args[0];
      throw new NamelexBridgeError(`namelex ${label} returned non-JSON: ${text.slice(0, 200)}`);
    }
  }

  /** Prefer `python -m namelex` with PYTHONPATH set to the vendored package. */
  private pythonModuleArgs(): string[] {
    return ["-m", "namelex"];
  }

  private pythonPathEnv(): string {
    const namelexSrc = join(this.config.repoRoot, "packages", "namelex", "src");
    const existing = process.env.PYTHONPATH;
    return existing ? `${namelexSrc}:${existing}` : namelexSrc;
  }
}
